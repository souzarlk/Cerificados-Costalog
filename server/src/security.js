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
