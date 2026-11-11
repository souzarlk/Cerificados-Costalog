import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString || /REPLACE_WITH|CHANGE_ME|EXAMPLE/i.test(connectionString)) throw new Error("DATABASE_URL não configurada ou ainda contém valores de exemplo. Configure o banco no servidor da empresa.");

export const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});
pool.on("error", error => console.error("Erro inesperado no pool do banco:", error.message));

export async function query(text, params = []) {
  return pool.query(text, params);
}
