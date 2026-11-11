using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Costalog.Agent.Service;

public sealed class AgentConfig
{
    public string ApiBaseUrl { get; set; } = "";
    public string InstallMode { get; set; } = "certificate";
    public string? EnrollmentTokenProtected { get; set; }
    public string? DeviceTokenProtected { get; set; }
    public string? DeviceId { get; set; }
    public string PolicyPublicKeyPem { get; set; } = "";
    public string AgentVersion { get; set; } = "1.0.0";
}

public static class AgentConfigStore
{
    public static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Costalog", "Agent");
    public static string ConfigPath => Path.Combine(Root, "agent.json");
    public static string PublicStatePath => Path.Combine(Root, "agent-public-state.json");
    public static string PolicyPath => Path.Combine(Root, "policy.json");

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public static AgentConfig Load()
    {
        if (!File.Exists(ConfigPath)) throw new FileNotFoundException("Configuração do AGENTE COSTALOG não encontrada.", ConfigPath);
        var json = File.ReadAllText(ConfigPath, Encoding.UTF8);
        return JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions)
            ?? throw new InvalidDataException("Arquivo de configuração inválido.");
    }

    public static void Save(AgentConfig config)
    {
        Directory.CreateDirectory(Root);
        var temp = ConfigPath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(config, JsonOptions), new UTF8Encoding(false));
        File.Move(temp, ConfigPath, true);
    }

    public static string Unprotect(string value)
    {
        var bytes = Convert.FromBase64String(value);
        var clear = ProtectedData.Unprotect(bytes, null, DataProtectionScope.LocalMachine);
        return Encoding.UTF8.GetString(clear);
    }

    public static string Protect(string value)
    {
        var clear = Encoding.UTF8.GetBytes(value);
        return Convert.ToBase64String(ProtectedData.Protect(clear, null, DataProtectionScope.LocalMachine));
    }

    public static void WritePublicState(AgentPublicState state)
    {
        Directory.CreateDirectory(Root);
        var temp = PublicStatePath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(state, JsonOptions), new UTF8Encoding(false));
        File.Move(temp, PublicStatePath, true);
    }
}

public sealed class AgentPublicState
{
    public string Status { get; set; } = "awaiting-enrollment";
    public string InstallMode { get; set; } = "certificate";
    public int Revision { get; set; }
    public string ExpiresAt { get; set; } = "";
    public string[] AllowedDestinations { get; set; } = [];
    public string UpdatedAt { get; set; } = DateTimeOffset.UtcNow.ToString("O");
}
