import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.JWT_SECRET = "ci-agent-jwt-secret-with-at-least-32-bytes";
process.env.CENTRAL_ADMIN_AUTH_SECRET = "ci-central-admin-auth-secret-with-at-least-32-bytes";
const { verifyCentralAdminToken, centralAdminIdentity } = await import("../src/security.js");

function createCentralToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "COSTALOG-ADMIN",
    iss: "costalog-central-notas-fiscais",
    iat: now,
    exp: now + 3600,
    ...overrides
  })).toString("base64url");
  const unsigned = header + "." + payload;
  const signature = crypto.createHmac("sha256", process.env.CENTRAL_ADMIN_AUTH_SECRET).update(unsigned).digest("base64url");
  return unsigned + "." + signature;
}

test("accepts a valid token from the Central Fiscal login", () => {
  const claims = verifyCentralAdminToken(createCentralToken());
  assert.equal(claims.sub, "COSTALOG-ADMIN");
});

test("rejects an expired Central Fiscal token", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.throws(() => verifyCentralAdminToken(createCentralToken({ iat: now - 7200, exp: now - 1 })));
});

test("rejects a token signed with a different secret", () => {
  const token = createCentralToken();
  process.env.CENTRAL_ADMIN_AUTH_SECRET = "different-secret-that-is-at-least-32-bytes";
  assert.throws(() => verifyCentralAdminToken(token));
  process.env.CENTRAL_ADMIN_AUTH_SECRET = "ci-central-admin-auth-secret-with-at-least-32-bytes";
});

test("maps the one shared Central Fiscal user to a stable audit identity", () => {
  const first = centralAdminIdentity("COSTALOG-ADMIN");
  const second = centralAdminIdentity("COSTALOG-ADMIN");
  const other = centralAdminIdentity("OTHER-USER");
  assert.equal(first.id, second.id);
  assert.notEqual(first.id, other.id);
  assert.match(first.id, /^[0-9a-f-]{36}$/i);
});
