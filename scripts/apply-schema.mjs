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
import { createDatabasePool, requireDatabaseUrl } from "./lib/database.mjs";

const databaseUrl = requireDatabaseUrl(process.cwd());

const schemaFile = process.argv[2];
if (!schemaFile) {
  console.error("Usage: node scripts/apply-schema.mjs <schema-file.sql>");
  process.exit(1);
}

const sqlPath = resolve(process.cwd(), schemaFile);
const sql = await readFile(sqlPath, "utf8");

const pool = createDatabasePool(databaseUrl, { max: 1 });

try {
  await pool.query(sql);
  console.log(`Applied ${schemaFile} successfully.`);
} finally {
  await pool.end();
}
