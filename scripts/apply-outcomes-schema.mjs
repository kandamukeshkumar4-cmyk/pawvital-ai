#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabasePool, requireDatabaseUrl } from "./lib/database.mjs";

const databaseUrl = requireDatabaseUrl(process.cwd());

const sqlPath = resolve(process.cwd(), "supabase-outcomes-schema.sql");
const sql = await readFile(sqlPath, "utf8");

const pool = createDatabasePool(databaseUrl, { max: 1 });

try {
  await pool.query(sql);
  console.log("Applied supabase-outcomes-schema.sql successfully.");
} finally {
  await pool.end();
}
