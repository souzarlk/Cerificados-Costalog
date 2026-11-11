using System.Security.Cryptography;
using System.Text.Json;

namespace Costalog.Agent.Service;

public static class PolicyVerifier
{
    public static JsonDocument VerifyEnvelope(PolicyEnvelope envelope, string publicKeyPem)
    {
        if (string.IsNullOrWhiteSpace(envelope.SignedPayload) || string.IsNullOrWhiteSpace(envelope.Signature))
            throw new CryptographicException("Resposta de política sem assinatura.");
        var payload = Convert.FromBase64String(envelope.SignedPayload);
        var signature = Convert.FromBase64String(envelope.Signature);
        using var rsa = RSA.Create();
        rsa.ImportFromPem(publicKeyPem);
        if (!rsa.VerifyData(payload, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
            throw new CryptographicException("Assinatura da política inválida.");
        return JsonDocument.Parse(payload);
    }

    public static DateTimeOffset ReadExpiry(JsonElement payload)
    {
        if (!payload.TryGetProperty("expiresAt", out var expiry) || expiry.ValueKind != JsonValueKind.String)
            throw new InvalidDataException("A política não informa validade.");
        if (!DateTimeOffset.TryParse(expiry.GetString(), out var parsed))
            throw new InvalidDataException("Validade da política inválida.");
        return parsed;
    }
}

public sealed class PolicyEnvelope
{
    public int Revision { get; set; }
    public string Status { get; set; } = "";
    public string KeyId { get; set; } = "";
    public string SignedPayload { get; set; } = "";
    public string Signature { get; set; } = "";
}
