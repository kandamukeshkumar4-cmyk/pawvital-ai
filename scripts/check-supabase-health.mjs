#!/usr/bin/env node
/**
 * Verifies Supabase Postgres connectivity and core PawVital tables.
 * Reads DATABASE_URL from environment (load .env.local before running).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const CORE_TABLES = [
  "pets",
  "symptom_checks",
  "profiles",
  "health_scores",
];

async function main() {
  loadEnvLocal();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const { rows } = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  await client.end();

  const names = new Set(rows.map((row) => row.table_name));
  const missing = CORE_TABLES.filter((table) => !names.has(table));

  if (missing.length > 0) {
    console.error(`Supabase health: missing tables: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log(
    `Supabase health: OK (${rows.length} public tables; core tables present).`
  );
}

main().catch((error) => {
  console.error("Supabase health check failed:", error.message);
  process.exit(1);
});
