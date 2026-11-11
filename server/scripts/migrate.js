import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../src/db.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = await fs.readFile(path.join(dir, "../migrations/001_initial.sql"), "utf8");
// The migration contains only ordinary CREATE TABLE / INSERT statements.
// MariaDB commits DDL implicitly, so apply idempotent statements individually.
const statements = sql
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map(statement => statement.trim())
  .filter(statement => statement && !statement.startsWith("--"));

try {
  for (const statement of statements) await query(statement);
  console.log("Migração MariaDB 001 aplicada/verificada.");
} finally {
  await pool.end();
}
