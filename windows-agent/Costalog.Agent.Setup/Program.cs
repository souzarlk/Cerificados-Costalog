using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

Console.WriteLine("==============================================");
Console.WriteLine("       INSTALADOR — AGENTE COSTALOG");
Console.WriteLine("==============================================");
Console.WriteLine("Esta etapa registra este computador na API corporativa.");
Console.WriteLine();

Console.Write("Endereço HTTPS da API (ex.: https://api.interna.empresa): ");
var apiBaseUrl = (Console.ReadLine() ?? "").Trim().TrimEnd('/');
if (!Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var apiUri) ||
    (apiUri.Scheme != Uri.UriSchemeHttps && !(apiUri.IsLoopback && apiUri.Scheme == Uri.UriSchemeHttp)))
{
    Console.Error.WriteLine("Endereço inválido. Use HTTPS (HTTP somente para localhost em desenvolvimento).");
    return 2;
}

Console.WriteLine();
Console.WriteLine("Escolha o modo de proteção deste computador:");
Console.WriteLine("  1 — Opção A: proteção/controle do certificado (não bloqueia navegação)");
Console.WriteLine("  2 — Opção B: proteção do certificado + bloqueio de navegação");
Console.Write("Digite 1 ou 2: ");
var modeChoice = (Console.ReadLine() ?? "").Trim();
if (modeChoice is not ("1" or "2"))
{
    Console.Error.WriteLine("Escolha inválida.");
    return 2;
}
var installMode = modeChoice == "1" ? "certificate" : "certificate-and-web";

Console.WriteLine();
Console.Write("Cole o código de instalação de uso único: ");
var enrollmentToken = ReadSecret();
if (enrollmentToken.Length < 20)
{
    Console.Error.WriteLine("Código inválido ou incompleto.");
    return 2;
}

Console.WriteLine();
Console.Write("Caminho do arquivo policy-public.pem fornecido pela TI (Enter para procurar ao lado do instalador): ");
var keyPath = (Console.ReadLine() ?? "").Trim();
if (string.IsNullOrWhiteSpace(keyPath))
    keyPath = Path.Combine(AppContext.BaseDirectory, "policy-public.pem");
if (!File.Exists(keyPath))
{
    Console.Error.WriteLine("Chave pública não encontrada: " + keyPath);
    return 2;
}

var publicKeyPem = await File.ReadAllTextAsync(keyPath);
try
{
    using var rsa = RSA.Create();
    rsa.ImportFromPem(publicKeyPem);
    if (rsa.KeySize < 3072) throw new CryptographicException("A chave deve ter pelo menos 3072 bits.");
}
catch (Exception error)
{
    Console.Error.WriteLine("Chave pública inválida: " + error.Message);
    return 2;
}

var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Costalog", "Agent");
var privateRoot = Path.Combine(root, "Private");
var publicRoot = Path.Combine(root, "Public");
Directory.CreateDirectory(privateRoot);
Directory.CreateDirectory(publicRoot);
var protectedToken = Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(enrollmentToken), null, DataProtectionScope.LocalMachine));
var config = new
{
    apiBaseUrl,
    installMode,
    enrollmentTokenProtected = protectedToken,
    deviceTokenProtected = (string?)null,
    deviceId = (string?)null,
    policyPublicKeyPem = publicKeyPem,
    agentVersion = "1.0.0"
};
var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
var configPath = Path.Combine(privateRoot, "agent.json");
var tempPath = configPath + ".tmp";
await File.WriteAllTextAsync(tempPath, JsonSerializer.Serialize(config, jsonOptions), new UTF8Encoding(false));
File.Move(tempPath, configPath, true);

var publicState = new
{
    status = "awaiting-enrollment",
    installMode,
    revision = 0,
    expiresAt = "",
    allowedDestinations = Array.Empty<string>(),
    updatedAt = DateTimeOffset.UtcNow.ToString("O")
};
await File.WriteAllTextAsync(Path.Combine(publicRoot, "agent-public-state.json"), JsonSerializer.Serialize(publicState, jsonOptions), new UTF8Encoding(false));

Console.WriteLine();
Console.WriteLine("Configuração salva em ProgramData\\Costalog\\Agent.");
Console.WriteLine("O código de instalação foi protegido com DPAPI (escopo do computador).");
Console.WriteLine("Modo escolhido: " + (installMode == "certificate" ? "Opção A" : "Opção B"));
Console.WriteLine("Agora o serviço pode ser iniciado pelo instalador.");
return 0;

static string ReadSecret()
{
    var builder = new StringBuilder();
    while (true)
    {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); break; }
        if (key.Key == ConsoleKey.Backspace)
        {
            if (builder.Length > 0) { builder.Length--; Console.Write("\b \b"); }
            continue;
        }
        if (!char.IsControl(key.KeyChar) && builder.Length < 200)
        {
            builder.Append(key.KeyChar);
            Console.Write("*");
        }
    }
    return builder.ToString();
}
