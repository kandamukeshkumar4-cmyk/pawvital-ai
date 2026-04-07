#!/usr/bin/env node
/**
 * Apply a SQL schema file to the database.
 *
 * Usage: node scripts/apply-schema.mjs <schema-file.sql>
 *
 * Example:
 *   node scripts/apply-schema.mjs supabase-audio-schema.sql
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to apply a schema file.");
  process.exit(1);
}

const schemaFile = process.argv[2];
if (!schemaFile) {
  console.error("Usage: node scripts/apply-schema.mjs <schema-file.sql>");
  process.exit(1);
}

const sqlPath = resolve(process.cwd(), schemaFile);
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
  console.log(`Applied ${schemaFile} successfully.`);
} finally {
  await pool.end();
}
