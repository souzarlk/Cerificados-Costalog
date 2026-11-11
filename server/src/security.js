import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
if (JWT_SECRET.length < 32 || /^(REPLACE_WITH|CHANGE_ME|EXAMPLE)/i.test(JWT_SECRET)) throw new Error("JWT_SECRET precisa ser substituído por um segredo aleatório de pelo menos 32 caracteres.");

export function hashToken(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
export function newOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
export function signAdminToken(admin) {
  return jwt.sign({ sub: admin.id, role: admin.role, email: admin.email, typ: "admin" }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    issuer: "costalog-agent-api",
    audience: "costalog-agent-admin"
  });
}
export function verifyAdminToken(token) {
  return jwt.verify(token, JWT_SECRET, { issuer: "costalog-agent-api", audience: "costalog-agent-admin" });
}

const CENTRAL_TOKEN_ISSUER = "costalog-central-notas-fiscais";

export function verifyCentralAdminToken(token) {
  const secret = process.env.CENTRAL_ADMIN_AUTH_SECRET || "";
  if (Buffer.byteLength(secret, "utf8") < 32 || !token || typeof token !== "string" || token.length > 4096) {
    throw new Error("Sessão central não configurada ou inválida.");
  }
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Formato de sessão central inválido.");
  const [encodedHeader, encodedPayload, receivedSignature] = parts;
  const unsigned = encodedHeader + "." + encodedPayload;
  const expectedSignature = crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
  const a = Buffer.from(receivedSignature, "utf8");
  const b = Buffer.from(expectedSignature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Assinatura da sessão central inválida.");

  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "HS256" || header.typ !== "JWT" || payload.iss !== CENTRAL_TOKEN_ISSUER ||
      typeof payload.sub !== "string" || !payload.sub || !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) || payload.iat > now + 60 || payload.exp <= now || payload.exp <= payload.iat) {
    throw new Error("Sessão central expirada ou inválida.");
  }
  return payload;
}

export function centralAdminIdentity(username) {
  const digest = crypto.createHash("sha256").update("costalog-central-notas-fiscais:" + username, "utf8").digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  const id = hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  return { id, email: "central-" + digest.toString("hex").slice(0, 32) + "@identity.costalog.local" };
}
export function getPolicySigningKey() {
  const value = process.env.POLICY_SIGNING_PRIVATE_KEY_B64 || "";
  if (!value) throw new Error("POLICY_SIGNING_PRIVATE_KEY_B64 não configurada.");
  return Buffer.from(value, "base64").toString("utf8");
}
export function signPolicy(payload) {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = crypto.sign("RSA-SHA256", bytes, getPolicySigningKey()).toString("base64");
  return {
    keyId: process.env.POLICY_SIGNING_KEY_ID || "costalog-policy-default",
    signedPayload: bytes.toString("base64"),
    signature
  };
}
