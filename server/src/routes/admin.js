import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db.js";
import { requireAdmin, requireAdminWrite } from "../middleware.js";
import { signPolicy, newOpaqueToken, hashToken } from "../security.js";

const router = Router();
router.use(requireAdmin);

const hostPattern = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const siteSchema = z.object({
  name: z.string().trim().min(1).max(70),
  hostname: z.string().trim().max(253).transform(v => v.toLowerCase().replace(/\.$/, "")).refine(v => hostPattern.test(v), "Hostname inválido."),
  enabled: z.boolean().default(true)
}).strict();

async function publishPolicySnapshot(client, admin) {
  // Serializa revisões para evitar números duplicados em publicações concorrentes.
  await client.query("SELECT pg_advisory_xact_lock(7042026)");
  const enabledSites = await client.query("SELECT hostname FROM agent_sites WHERE enabled=TRUE ORDER BY hostname");
  if (enabledSites.rowCount > 4500) { const error = new Error("A lista excede o limite seguro de 4.500 domínios para a extensão do navegador."); error.status = 400; throw error; }
  const revisionResult = await client.query("SELECT COALESCE(MAX(revision),0)::int AS revision FROM agent_policies");
  const revision = revisionResult.rows[0].revision + 1;
  const publishedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    product: "AGENTE COSTALOG",
    revision,
    mode: "deny-by-default",
    publishedAt,
    allowedDestinations: enabledSites.rows.map(row => ({ hostname: row.hostname, enabled: true }))
  };
  // Só publica se a chave privada estiver configurada e puder assinar o snapshot.
  signPolicy(payload);
  await client.query(
    "INSERT INTO agent_policies(revision,status,payload,published_by,published_at) VALUES($1,'published',$2::jsonb,$3,NOW())",
    [revision, JSON.stringify(payload), admin.id]
  );
  await client.query(
    "INSERT INTO agent_events(event_type,title,message,metadata) VALUES($1,$2,$3,$4::jsonb)",
    ["admin_policy_published", "Política publicada", "Revisão " + revision, JSON.stringify({ adminId: admin.id, revision, domains: enabledSites.rowCount })]
  );
  return { revision, publishedAt, domains: enabledSites.rowCount };
}

router.get("/sites", async (req, res, next) => {
  try {
    const result = await query("SELECT id,name,hostname,enabled,created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM agent_sites ORDER BY hostname");
    const revision = await query("SELECT COALESCE(MAX(revision),0)::int AS revision FROM agent_policies");
    res.json({ items: result.rows, revision: revision.rows[0].revision });
  } catch (e) { next(e); }
});

router.post("/sites", requireAdminWrite, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const data = siteSchema.parse(req.body);
    await client.query("BEGIN");
    const result = await client.query(
      "INSERT INTO agent_sites(name,hostname,enabled,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING id,name,hostname,enabled,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",
      [data.name, data.hostname, data.enabled, req.admin.id]
    );
    await client.query(
      "INSERT INTO agent_events(event_type,title,message,domain,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
      ["admin_site_created", "Domínio cadastrado", req.admin.email, data.hostname, JSON.stringify({ adminId: req.admin.id, siteId: result.rows[0].id })]
    );
    const publication = await publishPolicySnapshot(client, req.admin);
    await client.query("COMMIT");
    res.status(201).json({ ...result.rows[0], policyRevision: publication.revision, publishedAt: publication.publishedAt });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    if (e.code === "23505") return res.status(409).json({ error: "duplicate_hostname", message: "Este hostname já está cadastrado." });
    next(e);
  } finally { client.release(); }
});


router.patch("/sites/:siteId", requireAdminWrite, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const input = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE agent_sites SET enabled=$2,updated_by=$3,updated_at=NOW() WHERE id=$1 RETURNING id,name,hostname,enabled,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",
      [req.params.siteId,input.enabled,req.admin.id]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error:"not_found",message:"Domínio não encontrado." });
    }
    await client.query(
      "INSERT INTO agent_events(event_type,title,message,domain,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
      [input.enabled ? "admin_site_enabled" : "admin_site_disabled",input.enabled ? "Domínio ativado" : "Domínio desativado",req.admin.email,result.rows[0].hostname,JSON.stringify({adminId:req.admin.id,siteId:result.rows[0].id})]
    );
    const publication = await publishPolicySnapshot(client,req.admin);
    await client.query("COMMIT");
    res.json({...result.rows[0],policyRevision:publication.revision,publishedAt:publication.publishedAt});
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally { client.release(); }
});

router.delete("/sites/:siteId", requireAdminWrite, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("DELETE FROM agent_sites WHERE id=$1 RETURNING id,hostname", [req.params.siteId]);
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found", message: "Domínio não encontrado." });
    }
    await client.query(
      "INSERT INTO agent_events(event_type,title,message,domain,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
      ["admin_site_deleted", "Domínio removido", req.admin.email, result.rows[0].hostname, JSON.stringify({ adminId: req.admin.id, siteId: result.rows[0].id })]
    );
    const publication = await publishPolicySnapshot(client, req.admin);
    await client.query("COMMIT");
    res.set("X-Costalog-Policy-Revision", String(publication.revision));
    res.status(204).end();
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally { client.release(); }
});

router.get("/devices", async (req, res, next) => {
  try {
    const result = await query(
      "SELECT id,device_name AS \"deviceName\",windows_username AS username,os_version AS \"osVersion\",agent_version AS \"agentVersion\",install_mode AS \"installMode\",status,policy_revision AS \"policyRevision\",last_seen_at AS \"lastSeenAt\",enrolled_at AS \"enrolledAt\" FROM agent_devices ORDER BY enrolled_at DESC"
    );
    res.json({ items: result.rows });
  } catch (e) { next(e); }
});

router.patch("/devices/:deviceId/status", requireAdminWrite, async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(["active", "disabled", "revoked"]) }).strict().parse(req.body);
    const result = await query(
      "UPDATE agent_devices SET status=$2 WHERE id=$1 RETURNING id,device_name AS \"deviceName\",status",
      [req.params.deviceId, input.status]
    );
    if (!result.rowCount) return res.status(404).json({ error: "not_found", message: "Dispositivo não encontrado." });
    await query(
      "INSERT INTO agent_events(device_id,event_type,title,message,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
      [result.rows[0].id, "admin_device_status_changed", "Estado do dispositivo alterado", input.status, JSON.stringify({ adminId: req.admin.id })]
    );
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

router.get("/events", async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const result = await query(
      "SELECT e.id,e.event_type AS \"eventType\",e.title,e.message,e.domain,e.metadata,e.created_at AS \"createdAt\",d.device_name AS \"deviceName\",d.id AS \"deviceId\" FROM agent_events e LEFT JOIN agent_devices d ON d.id=e.device_id ORDER BY e.created_at DESC LIMIT $1",
      [limit]
    );
    res.json({ items: result.rows });
  } catch (e) { next(e); }
});

router.get("/policy", async (req, res, next) => {
  try {
    const result = await query("SELECT revision,status,payload,published_at AS \"publishedAt\",created_at AS \"createdAt\" FROM agent_policies ORDER BY revision DESC LIMIT 1");
    if (!result.rowCount) return res.json({ revision: 0, status: "draft", mode: "deny-by-default", allowedDestinations: [] });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

router.post("/policy/publish", requireAdminWrite, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const publication = await publishPolicySnapshot(client, req.admin);
    await client.query("COMMIT");
    res.json({ ...publication, status: "published", devicesPendingSync: 0 });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    next(e);
  } finally { client.release(); }
});

router.post("/enrollment-tokens", requireAdminWrite, async (req, res, next) => {
  try {
    const token = newOpaqueToken(32);
    const expiresMinutes = Math.min(1440, Math.max(5, Number(req.body?.expiresMinutes) || 60));
    await query("INSERT INTO enrollment_tokens(token_hash,created_by,expires_at) VALUES($1,$2,NOW()+($3::int * INTERVAL '1 minute'))",
      [hashToken(token), req.admin.id, expiresMinutes]);
    await query("INSERT INTO agent_events(event_type,title,message,metadata) VALUES($1,$2,$3,$4::jsonb)",
      ["admin_enrollment_token_created", "Token de instalação gerado", req.admin.email, JSON.stringify({ adminId: req.admin.id, expiresMinutes })]);
    res.status(201).json({ enrollmentToken: token, expiresInMinutes: expiresMinutes, warning: "Exibido uma única vez. Envie somente ao técnico responsável pela instalação." });
  } catch (e) { next(e); }
});

export default router;
