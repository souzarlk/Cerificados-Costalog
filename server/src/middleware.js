import { verifyAdminToken } from "./security.js";

export function requireAdmin(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "unauthorized", message: "Autenticação necessária." });
  try {
    const claims = verifyAdminToken(token);
    if (claims.typ !== "admin" || !["admin","auditor"].includes(claims.role)) {
      return res.status(403).json({ error: "forbidden", message: "Perfil sem permissão." });
    }
    req.admin = { id: claims.sub, email: claims.email, role: claims.role };
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized", message: "Sessão inválida ou expirada." });
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
