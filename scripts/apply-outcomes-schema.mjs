#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to apply the outcomes schema.");
  process.exit(1);
}

const sqlPath = resolve(process.cwd(), "supabase-outcomes-schema.sql");
const sql = await readFile(sqlPath, "utf8");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : undefined,
  max: 1,
});

try {
  await pool.query(sql);
  console.log("Applied supabase-outcomes-schema.sql successfully.");
} finally {
  await pool.end();
}