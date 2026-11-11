import { Router } from "express";
import { requireAdmin } from "../middleware.js";

const router = Router();

router.post("/login", (_req, res) => {
  res.status(410).json({
    error: "central_login_required",
    message: "Use o mesmo usuário e senha da Central de Notas Fiscais Costalog para entrar."
  });
});

router.get("/me", requireAdmin, async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ id: req.admin.id, email: req.admin.email, role: req.admin.role });
});

export default router;
