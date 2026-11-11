import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pool, query } from "../src/db.js";

const id = randomUUID();
const hostname = "ci-" + id + ".example.test";
const payload = { revision: 991337, allowedDestinations: [{ hostname, enabled: true }] };
const metadata = { source: "mariadb-smoke", ok: true };

const client = await pool.connect();
let inTransaction = false;
try {
  await client.query("BEGIN");
  inTransaction = true;

  const lock = await client.query("SELECT id FROM agent_policy_lock WHERE id=1 FOR UPDATE");
  if (lock.rowCount !== 1) throw new Error("MariaDB policy lock row missing.");

  await client.query(
    "INSERT INTO admin_users(id,email,display_name,password_hash,role) VALUES(?,?,?,?,?)",
    [id, "ci-" + id + "@example.test", "MariaDB CI", "not-a-real-password-hash", "admin"]
  );
  await client.query(
    "INSERT INTO agent_sites(name,hostname,enabled,created_by,updated_by) VALUES(?,?,?,?,?)",
    ["CI smoke", hostname, true, id, id]
  );
  await client.query(
    "INSERT INTO agent_policies(revision,status,payload,published_by,published_at) VALUES(?,?,?,?,NOW(3))",
    [991337, "published", JSON.stringify(payload), id]
  );
  await client.query(
    "INSERT INTO agent_events(event_type,title,message,domain,metadata) VALUES(?,?,?,?,?)",
    ["mariadb_smoke", "Smoke test", "MariaDB JSON insert", hostname, JSON.stringify(metadata)]
  );
  await client.query(
    "INSERT INTO enrollment_tokens(token_hash,created_by,expires_at) VALUES(?,?,DATE_ADD(NOW(3), INTERVAL ? MINUTE))",
    ["a".repeat(64), id, 10]
  );

  const policy = await client.query("SELECT payload FROM agent_policies WHERE revision=?", [991337]);
  if (policy.rowCount !== 1 || policy.rows[0].payload.revision !== 991337) throw new Error("MariaDB JSON payload round-trip failed.");
  const event = await client.query("SELECT metadata FROM agent_events WHERE domain=?", [hostname]);
  if (event.rowCount !== 1 || event.rows[0].metadata.source !== "mariadb-smoke") throw new Error("MariaDB JSON metadata round-trip failed.");

  const expiry = await client.query("SELECT DATE_ADD(NOW(3), INTERVAL ? MINUTE) AS expiresAt", [10]);
  if (!expiry.rowCount || !expiry.rows[0].expiresAt) throw new Error("MariaDB DATE_ADD interval binding failed.");

  const updated = await client.query("UPDATE agent_devices SET policy_revision=GREATEST(policy_revision,?) WHERE id=?", [12, id]);
  // This device intentionally does not exist; the statement must execute cleanly.
  if (updated.rowCount !== 0) throw new Error("Unexpected device update count.");

  await client.query("ROLLBACK");
  inTransaction = false;
  console.log("MariaDB smoke test OK: InnoDB transaction, row lock, JSON, UUID, DATE_ADD and prepared statements.");
} catch (error) {
  if (inTransaction) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  console.error("MariaDB smoke test failed:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
