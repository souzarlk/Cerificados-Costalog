import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, query } from "../src/db.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = await fs.readFile(path.join(dir, "../migrations/001_initial.sql"), "utf8");
try {
  await query(sql);
  console.log("Migração 001 aplicada/verificada.");
} finally {
  await pool.end();
}
