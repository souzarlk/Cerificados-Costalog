import mysql from "mysql2/promise";

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missing = required.filter(name => !process.env[name] || /REPLACE_WITH|CHANGE_ME|EXAMPLE/i.test(process.env[name]));
if (missing.length) {
  throw new Error("Configuração MariaDB incompleta. Defina: " + missing.join(", "));
}

const port = Number(process.env.DB_PORT || 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("DB_PORT inválida.");

const rawPool = mysql.createPool({
  host: process.env.DB_HOST,
  port,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Math.max(2, Number(process.env.DB_POOL_MAX || 10)),
  queueLimit: 0,
  connectTimeout: 10000,
  timezone: "Z",
  charset: "utf8mb4",
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined
});

function normalizeSql(sql) {
  return String(sql);
}
function normalizeRows(rows) {
  return rows.map(row => {
    const normalized = { ...row };
    for (const key of ["payload", "metadata"]) {
      if (typeof normalized[key] === "string") {
        try { normalized[key] = JSON.parse(normalized[key]); } catch {}
      }
    }
    for (const key of ["enabled", "active"]) {
      if (Object.prototype.hasOwnProperty.call(normalized, key)) normalized[key] = Boolean(normalized[key]);
    }
    return normalized;
  });
}

function wrapResult(result) {
  if (Array.isArray(result)) {
    const rows = normalizeRows(result);
    return { rows, rowCount: rows.length };
  }
  return { rows: [], rowCount: Number(result.affectedRows || 0), insertId: result.insertId };
}

class MariaConnection {
  constructor(connection) { this.connection = connection; }

  async query(sql, params = []) {
    const statement = String(sql).trim().replace(/;$/, "");
    if (/^BEGIN$/i.test(statement) || /^START TRANSACTION$/i.test(statement)) {
      await this.connection.beginTransaction();
      return { rows: [], rowCount: 0 };
    }
    if (/^COMMIT$/i.test(statement)) {
      await this.connection.commit();
      return { rows: [], rowCount: 0 };
    }
    if (/^ROLLBACK$/i.test(statement)) {
      await this.connection.rollback();
      return { rows: [], rowCount: 0 };
    }
    const [result] = await this.connection.execute(normalizeSql(sql), params);
    return wrapResult(result);
  }

  release() { this.connection.release(); }
}

export const pool = {
  async connect() {
    const connection = await rawPool.getConnection();
    return new MariaConnection(connection);
  },
  async end() { await rawPool.end(); }
};

export async function query(sql, params = []) {
  const [result] = await rawPool.execute(normalizeSql(sql), params);
  return wrapResult(result);
}
