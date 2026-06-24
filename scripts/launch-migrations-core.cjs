const {
  EXPECTED_SUPABASE_PROJECT_REF,
  extractSupabaseProjectRefFromDatabaseUrl,
} = require("./launch-preflight-core.cjs");

function validateDatabaseUrlTarget(
  databaseUrl,
  expectedRef = EXPECTED_SUPABASE_PROJECT_REF,
) {
  if (!databaseUrl) {
    return "DATABASE_URL is required to apply launch migrations.";
  }

  const actualRef = extractSupabaseProjectRefFromDatabaseUrl(databaseUrl);
  if (!actualRef) {
    return `DATABASE_URL is not a Supabase project database URL for ${expectedRef}.`;
  }

  if (actualRef !== expectedRef) {
    return `DATABASE_URL points at Supabase project ${actualRef}, not the approved launch project ${expectedRef}.`;
  }

  return null;
}

async function ensureLedgerTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.pawvital_schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function readApplied(client, options = {}) {
  if (options.ensureLedgerTable !== false) {
    await ensureLedgerTable(client);
  }

  try {
    const { rows } = await client.query(
      "SELECT filename, checksum FROM public.pawvital_schema_migrations ORDER BY filename",
    );
    return rows;
  } catch (error) {
    if (
      options.ensureLedgerTable === false &&
      (error?.code === "42P01" || /pawvital_schema_migrations/i.test(String(error?.message || "")))
    ) {
      return [];
    }
    throw error;
  }
}

module.exports = {
  ensureLedgerTable,
  readApplied,
  validateDatabaseUrlTarget,
};
