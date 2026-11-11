using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Costalog.Agent.Service;

public sealed class AgentWorker : BackgroundService
{
    private readonly ILogger<AgentWorker> _logger;
    private readonly HttpClient _http;
    private DateTimeOffset _lastFailureEvent = DateTimeOffset.MinValue;

    public AgentWorker(ILogger<AgentWorker> logger, HttpClient http)
    {
        _logger = logger;
        _http = http;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AGENTE COSTALOG iniciado.");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var config = AgentConfigStore.Load();
                ValidateApi(config.ApiBaseUrl);
                if (string.IsNullOrWhiteSpace(config.DeviceTokenProtected))
                    await EnrollAsync(config, stoppingToken);
                config = AgentConfigStore.Load();
                await HeartbeatAsync(config, stoppingToken);
                await SyncPolicyAsync(config, stoppingToken);
                await FlushPendingEventsAsync(config, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                _logger.LogWarning("Falha de sincronização do agente: {Message}", error.Message);
                await MarkPolicyStateAsync("sync-error", [], 0, DateTimeOffset.UtcNow, stoppingToken);
                await ReportFailureAsync(error, stoppingToken);
            }

            try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private static void ValidateApi(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && !(uri.IsLoopback && uri.Scheme == Uri.UriSchemeHttp)))
            throw new InvalidDataException("A API do AGENTE COSTALOG deve usar HTTPS (HTTP somente em localhost para desenvolvimento).");
    }

    private HttpClient Client(AgentConfig config, bool authenticated)
    {
        _http.DefaultRequestHeaders.Clear();
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        _http.DefaultRequestHeaders.Authorization = authenticated && !string.IsNullOrWhiteSpace(config.DeviceTokenProtected)
            ? new AuthenticationHeaderValue("Bearer", AgentConfigStore.Unprotect(config.DeviceTokenProtected))
            : null;
        return _http;
    }

    private static Uri Endpoint(AgentConfig config, string route) => new(config.ApiBaseUrl.TrimEnd('/') + "/" + route.TrimStart('/'));

    private async Task EnrollAsync(AgentConfig config, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(config.EnrollmentTokenProtected))
            throw new InvalidOperationException("O código de instalação não está configurado. Reexecute o assistente do agente.");
        var client = Client(config, false);
        var body = new
        {
            enrollmentToken = AgentConfigStore.Unprotect(config.EnrollmentTokenProtected),
            deviceName = Environment.MachineName,
            windowsUsername = "",
            osVersion = Environment.OSVersion.VersionString,
            agentVersion = config.AgentVersion,
            installMode = config.InstallMode
        };
        using var response = await client.PostAsJsonAsync(Endpoint(config, "api/v1/agent/enroll"), body, token);
        var text = await response.Content.ReadAsStringAsync(token);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException("Enrollment recusado pela API: HTTP " + (int)response.StatusCode + ". " + text);
        using var document = JsonDocument.Parse(text);
        var root = document.RootElement;
        var deviceId = root.GetProperty("deviceId").GetString();
        var deviceToken = root.GetProperty("deviceToken").GetString();
        if (string.IsNullOrWhiteSpace(deviceId) || string.IsNullOrWhiteSpace(deviceToken))
            throw new InvalidDataException("A API não retornou a credencial do dispositivo.");
        config.DeviceId = deviceId;
        config.DeviceTokenProtected = AgentConfigStore.Protect(deviceToken);
        config.EnrollmentTokenProtected = null; // token de uso único descartado após cadastro
        AgentConfigStore.Save(config);
        _logger.LogInformation("Dispositivo cadastrado na API Costalog. ID: {DeviceId}", deviceId);
    }

    private async Task HeartbeatAsync(AgentConfig config, CancellationToken token)
    {
        var client = Client(config, true);
        using var response = await client.PostAsJsonAsync(Endpoint(config, "api/v1/agent/heartbeat"), new { agentVersion = config.AgentVersion }, token);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException("Heartbeat recusado: HTTP " + (int)response.StatusCode + ".");
    }

    private async Task SyncPolicyAsync(AgentConfig config, CancellationToken token)
    {
        var client = Client(config, true);
        using var response = await client.GetAsync(Endpoint(config, "api/v1/agent/policy"), token);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            await MarkPolicyStateAsync("no-policy", [], 0, DateTimeOffset.UtcNow, token);
            return;
        }
        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<PolicyEnvelope>(cancellationToken: token)
            ?? throw new InvalidDataException("Envelope de política vazio.");
        using var document = PolicyVerifier.VerifyEnvelope(envelope, config.PolicyPublicKeyPem);
        var root = document.RootElement;
        var expiry = PolicyVerifier.ReadExpiry(root);
        if (envelope.Revision < config.LastPolicyRevision)
            throw new InvalidDataException("A API tentou fornecer uma revisão de política anterior à já aceita.");
        var now = DateTimeOffset.UtcNow;
        if (expiry <= now) throw new InvalidDataException("Política expirada.");
        if (!root.TryGetProperty("revision", out var revisionValue) || revisionValue.GetInt32() != envelope.Revision)
            throw new InvalidDataException("Revisão inconsistente entre envelope e conteúdo assinado.");
        if (!root.TryGetProperty("device", out var device) ||
            !device.TryGetProperty("id", out var id) || id.GetString() != config.DeviceId)
            throw new InvalidDataException("Política assinada para outro dispositivo.");
        if (!root.TryGetProperty("allowedDestinations", out var destinations) || destinations.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("Lista de destinos ausente na política.");
        var hosts = destinations.EnumerateArray()
            .Where(x => x.TryGetProperty("enabled", out var enabled) && enabled.GetBoolean())
            .Select(x => x.GetProperty("hostname").GetString() ?? "")
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var serverMode = device.GetProperty("installMode").GetString() ?? config.InstallMode;
        if (serverMode != config.InstallMode) throw new InvalidDataException("O modo registrado no servidor diverge do modo desta instalação.");
        config.LastPolicyRevision = envelope.Revision;
        AgentConfigStore.Save(config);
        await MarkPolicyStateAsync("valid", hosts, envelope.Revision, expiry, token);
        _logger.LogInformation("Política {Revision} validada. {Count} destinos.", envelope.Revision, hosts.Length);
    }

    private static Task MarkPolicyStateAsync(string status, string[] hosts, int revision, DateTimeOffset expiry, CancellationToken token)
    {
        AgentConfigStore.WritePublicState(new AgentPublicState
        {
            Status = status,
            InstallMode = SafeMode(),
            Revision = revision,
            ExpiresAt = expiry.ToString("O"),
            AllowedDestinations = hosts,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("O")
        });
        return Task.CompletedTask;

        static string SafeMode()
        {
            try { return AgentConfigStore.Load().InstallMode; }
            catch { return "certificate-and-web"; }
        }
    }


    private async Task FlushPendingEventsAsync(AgentConfig config, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(config.DeviceTokenProtected)) return;
        var queue = AgentConfigStore.PendingEventsRoot;
        if (!Directory.Exists(queue)) return;
        var client = Client(config, true);
        foreach (var file in Directory.EnumerateFiles(queue, "*.json").Take(100))
        {
            token.ThrowIfCancellationRequested();
            try
            {
                using var document = JsonDocument.Parse(await File.ReadAllTextAsync(file, token));
                var root = document.RootElement;
                var eventType = root.GetProperty("eventType").GetString() ?? "";
                var title = root.TryGetProperty("title", out var titleValue) ? titleValue.GetString() ?? "" : "";
                var message = root.TryGetProperty("message", out var messageValue) ? messageValue.GetString() ?? "" : "";
                var domain = root.TryGetProperty("domain", out var domainValue) ? domainValue.GetString() ?? "" : "";
                if (eventType != "browser_navigation_blocked" || domain.Length > 253) { File.Delete(file); continue; }
                using var response = await client.PostAsJsonAsync(Endpoint(config, "api/v1/agent/events"),
                    new { eventType, title, message, domain, metadata = new { source = "managed-browser-extension" } }, token);
                if (response.IsSuccessStatusCode) File.Delete(file);
            }
            catch (JsonException) { File.Delete(file); }
            catch (IOException) { /* arquivo ainda pode estar sendo gravado pelo Native Host; tenta novamente no próximo ciclo */ }
            catch (HttpRequestException) { return; }
        }
    }

    private async Task ReportFailureAsync(Exception error, CancellationToken token)
    {
        if (DateTimeOffset.UtcNow - _lastFailureEvent < TimeSpan.FromMinutes(10)) return;
        _lastFailureEvent = DateTimeOffset.UtcNow;
        try
        {
            var config = AgentConfigStore.Load();
            if (string.IsNullOrWhiteSpace(config.DeviceTokenProtected)) return;
            var client = Client(config, true);
            using var response = await client.PostAsJsonAsync(Endpoint(config, "api/v1/agent/events"), new
            {
                eventType = "agent_sync_failed",
                title = "Falha na sincronização",
                message = error.Message.Length > 500 ? error.Message[..500] : error.Message,
                metadata = new { agentVersion = config.AgentVersion }
            }, token);
        }
        catch { /* A falha de rede não pode encerrar o serviço. */ }
    }
}
