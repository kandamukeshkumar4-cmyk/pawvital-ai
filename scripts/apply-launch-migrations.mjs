#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { buildMigrationPlan } = require("./launch-preflight-core.cjs");
const {
  annotatePlanWithDatabaseState,
  ensureLedgerTable,
  readApplied,
  validateDatabaseUrlTarget,
} = require("./launch-migrations-core.cjs");

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function applyOne(client, item) {
  if (item.status === "applied") {
    console.log(`[skip] ${item.filename} already applied`);
    return;
  }
  if (item.status === "checksum_mismatch") {
    throw new Error(
      `${item.filename} was already applied with a different checksum; stop and inspect before reapplying.`,
    );
  }
  if (item.status === "database_state_conflict") {
    const missing = item.databaseState.checks
      .filter((check) => !check.present)
      .map((check) => check.name)
      .join(", ");
    throw new Error(
      `${item.filename} is partially present in the database but is not recorded in public.pawvital_schema_migrations; stop and inspect before reapplying. Missing or mismatched state: ${missing}`,
    );
  }
  if (item.status === "adopted_database_state") {
    await client.query(
      `INSERT INTO public.pawvital_schema_migrations (filename, checksum)
       VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`,
      [item.filename, item.checksum],
    );
    console.log(
      `[adopt] ${item.filename} already present in database; ledger recorded`,
    );
    return;
  }

  const sql = readFileSync(item.path, "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO public.pawvital_schema_migrations (filename, checksum)
       VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`,
      [item.filename, item.checksum],
    );
    await client.query("COMMIT");
    console.log(`[apply] ${item.filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(argv = process.argv) {
  loadEnvLocal();

  const dryRun = argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const targetError = validateDatabaseUrlTarget(databaseUrl);
  if (targetError) {
    console.error(
      `${targetError} Human action: provide the production Supabase Postgres URL for the approved target project; do not commit it.`,
    );
    process.exit(1);
  }

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.co")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 1,
  });
  const client = await pool.connect();
  try {
    const appliedRows = await readApplied(client, { ensureLedgerTable: false });
    const plan = await annotatePlanWithDatabaseState(
      client,
      buildMigrationPlan(process.cwd(), appliedRows),
    );
    const mismatches = plan.filter(
      (item) => item.status === "checksum_mismatch",
    );
    const conflicts = plan.filter(
      (item) => item.status === "database_state_conflict",
    );
    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
      process.exit(mismatches.length === 0 && conflicts.length === 0 ? 0 : 1);
    }
    if (mismatches.length > 0 || conflicts.length > 0) {
      throw new Error(
        "Launch migration plan is not safe to apply; run with --dry-run and inspect checksum mismatches or database_state_conflict entries.",
      );
    }

    await ensureLedgerTable(client);
    for (const item of plan) {
      await applyOne(client, item);
    }
    console.log(`launch migrations complete (${plan.length} file(s) checked)`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
