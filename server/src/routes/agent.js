import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db.js";
import { newOpaqueToken, hashToken, signPolicy } from "../security.js";
import { sendSecurityAlert } from "../alerts.js";

const router = Router();

const enrollmentSchema = z.object({
  enrollmentToken: z.string().min(20).max(200),
  deviceName: z.string().trim().min(1).max(120),
  windowsUsername: z.string().max(120).optional().default(""),
  osVersion: z.string().max(120).optional().default(""),
  agentVersion: z.string().max(40).optional().default(""),
  installMode: z.enum(["certificate","certificate-and-web"])
}).strict();

async function requireAgent(req,res,next) {
  try {
    const header=req.get("authorization")||"";
    const token=header.startsWith("Bearer ")?header.slice(7):"";
    if(!token)return res.status(401).json({error:"unauthorized",message:"Credencial do dispositivo necessária."});
    const result=await query("SELECT id,device_name,install_mode,status,policy_revision FROM agent_devices WHERE token_hash=$1",[hashToken(token)]);
    const device=result.rows[0];
    if(!device||device.status!=="active")return res.status(401).json({error:"device_revoked",message:"Dispositivo não autorizado ou revogado."});
    req.device=device;
    next();
  } catch(e) { next(e); }
}

router.post("/enroll", async (req,res,next) => {
  const client=await pool.connect();
  try {
    const input=enrollmentSchema.parse(req.body);
    const deviceToken=newOpaqueToken(48);
    await client.query("BEGIN");
    const tokenResult=await client.query(
      "UPDATE enrollment_tokens SET used_at=NOW() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() RETURNING id",
      [hashToken(input.enrollmentToken)]
    );
    if(!tokenResult.rowCount){await client.query("ROLLBACK");return res.status(401).json({error:"invalid_enrollment_token",message:"Token de instalação inválido, expirado ou já utilizado."});}
    const inserted=await client.query(
      "INSERT INTO agent_devices(device_name,windows_username,os_version,agent_version,install_mode,token_hash,status) VALUES($1,$2,$3,$4,$5,$6,'active') RETURNING id,device_name AS \"deviceName\",install_mode AS \"installMode\",status",
      [input.deviceName,input.windowsUsername,input.osVersion,input.agentVersion,input.installMode,hashToken(deviceToken)]
    );
    const device=inserted.rows[0];
    await client.query("INSERT INTO agent_events(device_id,event_type,title,message,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
      [device.id,"device_enrolled","Agente instalado",device.deviceName,JSON.stringify({installMode:device.installMode,agentVersion:input.agentVersion})]);
    await client.query("COMMIT");
    res.status(201).json({deviceId:device.id,deviceToken,deviceName:device.deviceName,installMode:device.installMode,warning:"Token exibido uma única vez. O agente o protege localmente com DPAPI."});
  } catch(e) {
    try{await client.query("ROLLBACK")}catch{}
    next(e);
  } finally {client.release();}
});

router.use(requireAgent);

router.post("/heartbeat", async (req,res,next) => {
  try {
    await query("UPDATE agent_devices SET last_seen_at=NOW(),agent_version=COALESCE(NULLIF($2,''),agent_version) WHERE id=$1",
      [req.device.id,String(req.body?.agentVersion||"").slice(0,40)]);
    res.json({ok:true,serverTime:new Date().toISOString()});
  } catch(e) { next(e); }
});

router.get("/policy", async (req,res,next) => {
  try {
    const result=await query("SELECT revision,status,payload,published_at FROM agent_policies WHERE status='published' ORDER BY revision DESC LIMIT 1");
    if(!result.rowCount)return res.status(404).json({error:"policy_not_published",message:"Nenhuma política foi publicada pela TI."});
    const row=result.rows[0];
    const now=Date.now();
    const payload={
      ...row.payload,
      device:{id:req.device.id,name:req.device.device_name,installMode:req.device.install_mode},
      issuedAt:new Date(now).toISOString(),
      expiresAt:new Date(now+Math.max(1,Number(process.env.POLICY_VALIDITY_HOURS||24))*60*60*1000).toISOString()
    };
    const signed=signPolicy(payload);
    await query("UPDATE agent_devices SET last_seen_at=NOW(),policy_revision=$2 WHERE id=$1",[req.device.id,row.revision]);
    res.set("Cache-Control","no-store");
    res.json({revision:row.revision,status:"published",...signed});
  } catch(e) { next(e); }
});

router.post("/events", async (req,res,next) => {
  try {
    const input=z.object({
      eventType:z.string().min(2).max(80),
      title:z.string().max(120).optional().default(""),
      message:z.string().max(1000).optional().default(""),
      domain:z.string().max(253).optional().default(""),
      metadata:z.record(z.any()).optional().default({})
    }).strict().parse(req.body);
    const result=await query(
      "INSERT INTO agent_events(device_id,event_type,title,message,domain,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id,created_at AS \"createdAt\"",
      [req.device.id,input.eventType,input.title,input.message,input.domain,JSON.stringify(input.metadata)]
    );
    if (input.eventType === "browser_navigation_blocked") {
      await sendSecurityAlert({ ...input, deviceName: req.device.device_name, createdAt: result.rows[0].createdAt });
    }
    res.status(201).json(result.rows[0]);
  } catch(e) { next(e); }
});

export default router;
