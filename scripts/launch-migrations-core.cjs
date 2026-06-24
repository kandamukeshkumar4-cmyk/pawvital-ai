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
      (error?.code === "42P01" ||
        /pawvital_schema_migrations/i.test(String(error?.message || "")))
    ) {
      return [];
    }
    throw error;
  }
}

async function existsQuery(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return Boolean(rows?.[0]?.exists);
}

function summarizeChecks(checks) {
  const passed = checks.filter((check) => check.present);
  if (passed.length === checks.length) {
    return { status: "already_applied", checks };
  }
  if (passed.length === 0) {
    return { status: "not_applied", checks };
  }
  return { status: "partial", checks };
}

async function hasColumn(client, tableName, columnName) {
  return existsQuery(
    client,
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    )`,
    [tableName, columnName],
  );
}

async function hasTable(client, tableName) {
  return existsQuery(
    client,
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )`,
    [tableName],
  );
}

async function hasPolicy(client, tableName, policyName) {
  return existsQuery(
    client,
    `SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = $1 AND policyname = $2
    )`,
    [tableName, policyName],
  );
}

async function hasIndex(client, indexName) {
  return existsQuery(
    client,
    `SELECT EXISTS (
      SELECT 1
      FROM pg_class idx
      JOIN pg_namespace nsp ON nsp.oid = idx.relnamespace
      WHERE nsp.nspname = 'public' AND idx.relkind = 'i' AND idx.relname = $1
    )`,
    [indexName],
  );
}

async function hasFunction(client, functionName) {
  return existsQuery(
    client,
    `SELECT EXISTS (
      SELECT 1
      FROM pg_proc proc
      JOIN pg_namespace nsp ON nsp.oid = proc.pronamespace
      WHERE nsp.nspname = 'public' AND proc.proname = $1
    )`,
    [functionName],
  );
}

async function hasConstraint(client, tableName, constraintName) {
  return existsQuery(
    client,
    `SELECT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public' AND rel.relname = $1 AND con.conname = $2
    )`,
    [tableName, constraintName],
  );
}

async function noLegacyJournalColumns(client) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'journal_entries'
       AND column_name = ANY($1::text[])`,
    [["type", "title", "content", "photo_url", "date"]],
  );
  return Number(rows?.[0]?.count || 0) === 0;
}

async function journalLegacyColumnsRelaxed(client) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'journal_entries'
       AND is_nullable = 'NO'
       AND column_name NOT IN ('id', 'user_id', 'pet_id', 'entry_date')`,
  );
  return Number(rows?.[0]?.count || 0) === 0;
}

async function classifyMigrationDatabaseState(client, filename) {
  switch (filename) {
    case "20260618_vet_dog_brain_context_signals.sql":
      return summarizeChecks([
        {
          name: "daily_health_logs.context_signals",
          present: await hasColumn(
            client,
            "daily_health_logs",
            "context_signals",
          ),
        },
        {
          name: "daily_health_logs.photo_urls",
          present: await hasColumn(client, "daily_health_logs", "photo_urls"),
        },
      ]);

    case "20260619_vet_record_summaries_and_followups.sql":
      return summarizeChecks([
        {
          name: "vet_record_summaries table",
          present: await hasTable(client, "vet_record_summaries"),
        },
        {
          name: "dog_brain_followups table",
          present: await hasTable(client, "dog_brain_followups"),
        },
        {
          name: "vet_record_summaries owner policy",
          present: await hasPolicy(
            client,
            "vet_record_summaries",
            "Users can manage their vet record summaries",
          ),
        },
        {
          name: "dog_brain_followups owner policy",
          present: await hasPolicy(
            client,
            "dog_brain_followups",
            "Users can manage their dog brain followups",
          ),
        },
        {
          name: "idx_vet_record_summaries_pet index",
          present: await hasIndex(client, "idx_vet_record_summaries_pet"),
        },
        {
          name: "idx_dog_brain_followups_pet index",
          present: await hasIndex(client, "idx_dog_brain_followups_pet"),
        },
      ]);

    case "20260620_journal_relax_legacy_columns.sql": {
      const legacyGone = await noLegacyJournalColumns(client);
      const relaxed = legacyGone || (await journalLegacyColumnsRelaxed(client));
      return relaxed
        ? {
            status: "already_applied",
            checks: [
              {
                name: "journal legacy columns relaxed or removed",
                present: true,
              },
            ],
          }
        : {
            status: "not_applied",
            checks: [
              {
                name: "journal legacy columns relaxed or removed",
                present: false,
              },
            ],
          };
    }

    case "20260620b_journal_drop_legacy_columns.sql": {
      const gone = await noLegacyJournalColumns(client);
      return gone
        ? {
            status: "already_applied",
            checks: [{ name: "journal legacy columns removed", present: true }],
          }
        : {
            status: "not_applied",
            checks: [
              { name: "journal legacy columns removed", present: false },
            ],
          };
    }

    case "20260622000000_dog_brain_supplement_trials.sql":
      return summarizeChecks([
        {
          name: "dog_brain_supplement_trials table",
          present: await hasTable(client, "dog_brain_supplement_trials"),
        },
        {
          name: "dog_brain_supplement_trials.outcome_at",
          present: await hasColumn(
            client,
            "dog_brain_supplement_trials",
            "outcome_at",
          ),
        },
        {
          name: "dog_brain_supplement_trials_status_check constraint",
          present: await hasConstraint(
            client,
            "dog_brain_supplement_trials",
            "dog_brain_supplement_trials_status_check",
          ),
        },
        {
          name: "dog_brain_supplement_trials owner policy",
          present: await hasPolicy(
            client,
            "dog_brain_supplement_trials",
            "dog_brain_supplement_trials_owner_all",
          ),
        },
        {
          name: "uniq_supplement_trial_open index",
          present: await hasIndex(client, "uniq_supplement_trial_open"),
        },
      ]);

    case "20260622000100_supplements_add_notes.sql":
      return summarizeChecks([
        {
          name: "supplements.notes",
          present: await hasColumn(client, "supplements", "notes"),
        },
      ]);

    case "supabase-product-intelligence-schema.sql":
      return summarizeChecks([
        {
          name: "daily_readiness_snapshots table",
          present: await hasTable(client, "daily_readiness_snapshots"),
        },
        {
          name: "recovery_checkpoints table",
          present: await hasTable(client, "recovery_checkpoints"),
        },
        {
          name: "set_product_intelligence_updated_at function",
          present: await hasFunction(
            client,
            "set_product_intelligence_updated_at",
          ),
        },
        {
          name: "daily_readiness_snapshots_select_own policy",
          present: await hasPolicy(
            client,
            "daily_readiness_snapshots",
            "daily_readiness_snapshots_select_own",
          ),
        },
        {
          name: "recovery_checkpoints_select_own policy",
          present: await hasPolicy(
            client,
            "recovery_checkpoints",
            "recovery_checkpoints_select_own",
          ),
        },
      ]);

    default:
      return { status: "unknown", checks: [] };
  }
}

async function annotatePlanWithDatabaseState(client, plan) {
  const annotated = [];
  for (const item of plan) {
    if (item.status !== "pending") {
      annotated.push(item);
      continue;
    }

    const databaseState = await classifyMigrationDatabaseState(
      client,
      item.filename,
    );
    if (databaseState.status === "already_applied") {
      annotated.push({
        ...item,
        status: "adopted_database_state",
        databaseState,
      });
      continue;
    }
    if (databaseState.status === "partial") {
      annotated.push({
        ...item,
        status: "database_state_conflict",
        databaseState,
      });
      continue;
    }

    annotated.push({ ...item, databaseState });
  }
  return annotated;
}

module.exports = {
  annotatePlanWithDatabaseState,
  classifyMigrationDatabaseState,
  ensureLedgerTable,
  readApplied,
  validateDatabaseUrlTarget,
};
