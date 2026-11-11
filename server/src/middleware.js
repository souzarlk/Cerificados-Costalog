import { verifyAdminToken, verifyCentralAdminToken, centralAdminIdentity } from "./security.js";
import { query } from "./db.js";

export async function requireAdmin(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "unauthorized", message: "Autenticação necessária." });

  try {
    let claims;
    let centralIdentity = false;
    try {
      claims = verifyAdminToken(token);
    } catch {
      claims = verifyCentralAdminToken(token);
      centralIdentity = true;
    }

    if (centralIdentity) {
      const identity = centralAdminIdentity(claims.sub);
      await query(
        "INSERT IGNORE INTO admin_users(id,email,display_name,password_hash,role,active) VALUES(?,?,?,?, 'admin',1)",
        [identity.id, identity.email, claims.sub, "CENTRAL_AUTH_ONLY_NO_LOCAL_PASSWORD"]
      );
      const result = await query("SELECT id,email,role,active FROM admin_users WHERE id=?", [identity.id]);
      const user = result.rows[0];
      if (!user || !user.active) {
        return res.status(403).json({ error: "forbidden", message: "Acesso administrativo desativado. Procure a TI." });
      }
      if (!["admin", "auditor"].includes(user.role)) {
        return res.status(403).json({ error: "forbidden", message: "Perfil sem permissão." });
      }
      req.admin = { id: user.id, email: user.email, role: user.role };
      return next();
    }

    if (claims.typ !== "admin" || !["admin", "auditor"].includes(claims.role)) {
      return res.status(403).json({ error: "forbidden", message: "Perfil sem permissão." });
    }
    req.admin = { id: claims.sub, email: claims.email, role: claims.role };
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized", message: "Sessão inválida ou expirada. Entre pela Central de Notas Fiscais." });
  }
}

export function requireAdminWrite(req, res, next) {
  if (!req.admin || req.admin.role !== "admin") return res.status(403).json({ error: "forbidden", message: "Somente administradores podem alterar políticas." });
  next();
}

export function errorHandler(err, req, res, next) {
  if (err && err.name === "ZodError") return res.status(400).json({ error: "validation_error", message: "Os dados enviados são inválidos.", issues: err.issues });
  if (err && ["23505","ER_DUP_ENTRY"].includes(err.code)) return res.status(409).json({ error: "conflict", message: "Registro duplicado." });
  console.error("API error", { method: req.method, path: req.path, message: err.message });
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.code || "internal_error",
    message: err.status && err.status < 500 ? err.message : "Erro interno. Consulte o identificador de requisição com a TI.",
    requestId: req.id || null
  });
}
