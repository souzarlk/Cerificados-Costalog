using System.Buffers.Binary;
using System.Text.Json;

const int MaxMessageLength = 1024 * 1024;
var input = Console.OpenStandardInput();
var output = Console.OpenStandardOutput();
var prefix = new byte[4];

while (await ReadFullyAsync(input, prefix))
{
    var length = BinaryPrimitives.ReadInt32LittleEndian(prefix);
    if (length <= 0 || length > MaxMessageLength) return 2;
    var bytes = new byte[length];
    if (!await ReadFullyAsync(input, bytes)) return 2;

    object response;
    try
    {
        using var request = JsonDocument.Parse(bytes);
        var root = request.RootElement;
        var type = root.TryGetProperty("type", out var property) ? property.GetString() : "";
        if (type == "get-policy") response = ReadLocalState();
        else if (type == "report-blocked") response = WriteBlockedEvent(root);
        else response = new { status = "unsupported-request", ok = false };
    }
    catch
    {
        response = new { status = "invalid-request", ok = false };
    }

    var responseBytes = JsonSerializer.SerializeToUtf8Bytes(response, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    BinaryPrimitives.WriteInt32LittleEndian(prefix, responseBytes.Length);
    await output.WriteAsync(prefix);
    await output.WriteAsync(responseBytes);
    await output.FlushAsync();
}

return 0;

static object ReadLocalState()
{
    var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Costalog", "Agent");
    var statePath = Path.Combine(root, "agent-public-state.json");
    if (!File.Exists(statePath))
        return new { status = "missing", installMode = "certificate", revision = 0, allowedDestinations = Array.Empty<string>() };
    using var doc = JsonDocument.Parse(File.ReadAllText(statePath));
    var state = doc.RootElement;
    var mode = state.TryGetProperty("installMode", out var m) ? m.GetString() ?? "certificate" : "certificate";
    var status = state.TryGetProperty("status", out var s) ? s.GetString() ?? "missing" : "missing";
    var revision = state.TryGetProperty("revision", out var r) ? r.GetInt32() : 0;
    var expiry = state.TryGetProperty("expiresAt", out var e) ? e.GetString() ?? "" : "";
    var domains = state.TryGetProperty("allowedDestinations", out var d) && d.ValueKind == JsonValueKind.Array
        ? d.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToArray()
        : Array.Empty<string>();
    if (!DateTimeOffset.TryParse(expiry, out var parsed) || parsed <= DateTimeOffset.UtcNow)
    {
        status = "expired";
        domains = Array.Empty<string>();
    }
    return new { status, installMode = mode, revision, expiresAt = expiry, allowedDestinations = domains };
}

static object WriteBlockedEvent(JsonElement request)
{
    if (!request.TryGetProperty("domain", out var domainProperty))
        return new { ok = false, error = "missing-domain" };
    var domain = (domainProperty.GetString() ?? "").Trim().ToLowerInvariant();
    if (domain.Length > 253 || !System.Text.RegularExpressions.Regex.IsMatch(domain, @"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?.)+[a-z]{2,63}$"))
        return new { ok = false, error = "invalid-domain" };

    var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Costalog", "Agent", "pending-events");
    Directory.CreateDirectory(root);
    var item = new
    {
        eventType = "browser_navigation_blocked",
        title = "Navegação bloqueada pelo AGENTE COSTALOG",
        message = "Tentativa de abrir um domínio fora da lista autorizada.",
        domain,
        createdAt = DateTimeOffset.UtcNow.ToString("O")
    };
    var file = Path.Combine(root, Guid.NewGuid().ToString("N") + ".json");
    File.WriteAllText(file, JsonSerializer.Serialize(item, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    return new { ok = true };
}

static async Task<bool> ReadFullyAsync(Stream stream, byte[] buffer)
{
    var offset = 0;
    while (offset < buffer.Length)
    {
        var read = await stream.ReadAsync(buffer.AsMemory(offset, buffer.Length - offset));
        if (read == 0) return false;
        offset += read;
    }
    return true;
}
