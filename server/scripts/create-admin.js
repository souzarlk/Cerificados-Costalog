import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, query } from "../src/db.js";

const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
if (!email || !password || password.length < 14) {
  throw new Error("Defina BOOTSTRAP_ADMIN_EMAIL e uma BOOTSTRAP_ADMIN_PASSWORD com pelo menos 14 caracteres no ambiente do servidor.");
}
try {
  const existing = await query("SELECT id FROM admin_users WHERE email = $1", [email]);
  if (existing.rowCount) {
    console.log("Administrador já existe. Nenhuma senha foi alterada.");
  } else {
    const hash = await bcrypt.hash(password, 12);
    await query("INSERT INTO admin_users(email, display_name, password_hash, role) VALUES($1,$2,$3,'admin')", [email, "Administrador Costalog", hash]);
    console.log("Administrador inicial criado:", email);
  }
} finally {
  await pool.end();
}
