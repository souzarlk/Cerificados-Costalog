import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { signAdminToken } from "../security.js";
import { requireAdmin } from "../middleware.js";

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "rate_limited", message: "Muitas tentativas. Aguarde antes de tentar novamente." } });
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256)
}).strict();

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await query("SELECT id,email,role,active,password_hash FROM admin_users WHERE email=?", [input.email.trim().toLowerCase()]);
    const admin = result.rows[0];
    const valid = admin && admin.active && await bcrypt.compare(input.password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: "invalid_credentials", message: "E-mail ou senha incorretos." });
    const accessToken = signAdminToken(admin);
    await query("UPDATE admin_users SET updated_at=NOW() WHERE id=?", [admin.id]);
    res.set("Cache-Control", "no-store");
    res.json({ accessToken, tokenType: "Bearer", expiresIn: process.env.JWT_EXPIRES_IN || "15m", user: { id: admin.id, email: admin.email, role: admin.role } });
  } catch (error) { next(error); }
});

router.get("/me", requireAdmin, async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ id: req.admin.id, email: req.admin.email, role: req.admin.role });
});

export default router;
