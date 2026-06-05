#!/usr/bin/env node
/**
 * Verify the VET-1564 product-intelligence persistence schema is present and
 * still RLS/claim guarded. This is local-only and does not apply the migration.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadProductProductionEvidence,
  productProductionEvidencePath,
  summarizeProductProductionEvidence,
} from "./product-production-evidence.mjs";

const schemaPath = resolve(process.cwd(), "supabase-product-intelligence-schema.sql");
const outPath = resolve(
  process.cwd(),
  "plans/VET-1564-product-persistence-schema-readiness.json"
);

function hasAll(text, values) {
  return values.every((value) => text.includes(value));
}

function buildReadiness() {
  const sql = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : "";
  const productionEvidence = loadProductProductionEvidence();
  const productionEvidenceSummary =
    summarizeProductProductionEvidence(productionEvidence);
  const requiredFragments = [
    "CREATE TABLE IF NOT EXISTS public.daily_readiness_snapshots",
    "CREATE TABLE IF NOT EXISTS public.recovery_checkpoints",
    "ALTER TABLE public.daily_readiness_snapshots ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE public.recovery_checkpoints ENABLE ROW LEVEL SECURITY",
    "auth.uid() = user_id",
    "UNIQUE (user_id, pet_id, snapshot_date, generated_by)",
    "UNIQUE (user_id, pet_id, report_source_id, checkpoint_date, generated_by)",
  ];
  const forbiddenClaimFragments = [
    "diagnosis certainty",
    "treatment recommendation",
    "prognosis promise",
    "emergency clearance",
  ];
  const missingRequired = requiredFragments.filter((fragment) => !sql.includes(fragment));
  const forbiddenPresent = forbiddenClaimFragments.filter((fragment) =>
    sql.toLowerCase().includes(fragment)
  );

  return {
    ticket: "VET-1564A/B",
    mode: "review-only-schema-readiness",
    generatedAt:
      process.env.PRODUCT_PERSISTENCE_SCHEMA_READINESS_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    readyForMigrationReview:
      missingRequired.length === 0 && forbiddenPresent.length === 0,
    schema: {
      path: "supabase-product-intelligence-schema.sql",
      exists: existsSync(schemaPath),
      sha256: existsSync(schemaPath) ? createHash("sha256").update(sql).digest("hex") : null,
    },
    tables: ["daily_readiness_snapshots", "recovery_checkpoints"],
    requiredFragmentsPresent: hasAll(sql, requiredFragments),
    missingRequired,
    forbiddenClaimFragmentsPresent: forbiddenPresent,
    liveMigrationApplied: productionEvidenceSummary.liveMigrationApplied,
    productionEvidence: productionEvidence
      ? {
          path: productProductionEvidencePath,
          decision: productionEvidence.decision,
          deploymentId: productionEvidence.production?.deploymentId,
          targetDatabaseHost: productionEvidence.production?.targetDatabaseHost,
          schemaSha256: productionEvidence.production?.schemaSha256,
          liveMigrationApplied:
            productionEvidenceSummary.liveMigrationApplied,
          authenticatedProductionSmokeComplete:
            productionEvidenceSummary.authenticatedProductionSmokeComplete,
          recoveryCheckpointStatus:
            productionEvidenceSummary.recoveryCheckpointStatus,
          blockers: productionEvidenceSummary.blockers,
        }
      : null,
    nextActions: productionEvidenceSummary.liveMigrationApplied
      ? [
          "Keep the reviewed schema evidence attached to VET-1564 production readiness.",
          "Rerun the authenticated owner workflow smoke after any schema, route, RLS, or owner-visible copy change.",
          "Capture a recovery-checkpoint production write or deterministic blocked-reason smoke before claiming recovery write coverage.",
        ]
      : [
          "Review SQL in Supabase SQL Editor or migration workflow.",
          "Apply only after product owner approves persistence semantics.",
          "Verify the authenticated write route against the migrated tables before enabling owner workflow automation.",
        ],
    guardrails: [
      "This verifier does not apply schema changes.",
      "Do not store diagnosis, treatment, prognosis, or emergency-clearance claims.",
      "Rows must remain user-owned through RLS policies.",
    ],
  };
}

const readiness = buildReadiness();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(readiness, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(readiness, null, 2));
}
