#!/usr/bin/env node
/**
 * Build the VET-1564 production smoke runbook for product intelligence.
 *
 * Review-only. It does not apply Supabase migrations, call production, write
 * data, or mark production smoke complete.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const readinessPath = resolve(
  process.cwd(),
  "plans/VET-1564-production-readiness.json"
);
const schemaPath = resolve(process.cwd(), "supabase-product-intelligence-schema.sql");
const outPath = resolve(
  process.cwd(),
  "plans/VET-1564-production-smoke-runbook.json"
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifact(path, relativePath) {
  return {
    path: relativePath,
    exists: existsSync(path),
    sha256: existsSync(path) ? sha256(path) : null,
  };
}

function buildRunbook() {
  const readiness = readJson(readinessPath);
  const schemaSql = readText(schemaPath);
  const hasRlsPolicies =
    schemaSql.includes("ENABLE ROW LEVEL SECURITY") &&
    schemaSql.includes("daily_readiness_snapshots_select_own") &&
    schemaSql.includes("recovery_checkpoints_select_own");
  const hasRollbackSql = schemaSql.includes("CREATE TABLE IF NOT EXISTS") &&
    schemaSql.includes("daily_readiness_snapshots") &&
    schemaSql.includes("recovery_checkpoints");

  return {
    ticket: "VET-1564A/B",
    mode: "review-only-production-smoke-runbook",
    generatedAt:
      process.env.PRODUCT_PRODUCTION_SMOKE_RUNBOOK_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      readiness.authenticatedProductionSmokeComplete
        ? "Runbook and evidence checklist. Production migration and owner smoke evidence are attached by reference; this command does not call production or apply migrations."
        : "Runbook only. It defines the live migration and authenticated production owner smoke evidence to collect; this command does not call production or apply migrations.",
    inputArtifacts: {
      productionReadiness: artifact(
        readinessPath,
        "plans/VET-1564-production-readiness.json"
      ),
      schema: artifact(schemaPath, "supabase-product-intelligence-schema.sql"),
    },
    preconditions: {
      readyForProductionSmoke: readiness.readyForProductionSmoke === true,
      liveMigrationApplied: readiness.liveMigrationApplied === true,
      authenticatedProductionSmokeComplete:
        readiness.authenticatedProductionSmokeComplete === true,
      currentDeploymentReadOnlySmokePassed:
        readiness.currentDeploymentReadOnlySmokePassed === true,
      currentDeploymentAuthenticatedWriteSmokeComplete:
        readiness.currentDeploymentAuthenticatedWriteSmokeComplete === true,
      currentDeploymentSmokeStatus:
        readiness.currentDeploymentSmokeStatus ?? "unknown",
      rlsPoliciesPresentInSql: hasRlsPolicies,
      rollbackTargetsPresentInSql: hasRollbackSql,
    },
    actorRequirements: [
      "Use a normal authenticated owner account, not a service-role key.",
      "Use one production test pet owned by that account.",
      "Use a second authenticated owner account or pet id not owned by the first account for RLS denial proof.",
      "Record sanitized request ids, timestamps, and table row ids; do not record PHI-like owner free text.",
    ],
    migrationRunbook: [
      {
        step: "schema-review",
        action:
          "Review supabase-product-intelligence-schema.sql and confirm it only creates daily_readiness_snapshots, recovery_checkpoints, indexes, updated_at trigger, and owner-scoped RLS policies.",
        evidence: "schema reviewer, timestamp, schema sha256, and approval link",
      },
      {
        step: "apply-migration",
        action:
          "Apply supabase-product-intelligence-schema.sql through the approved Supabase migration path.",
        evidence: "migration id or Supabase SQL editor run id plus schema sha256",
      },
      {
        step: "schema-verify",
        action:
          "Verify both tables, indexes, trigger, and RLS policies exist in production.",
        evidence:
          "sanitized SQL result showing table names, policy names, and RLS enabled",
      },
    ],
    smokeRunbook: [
      {
        step: "owner-history-read",
        action:
          "Open /analytics as the test owner, select the test pet, and verify saved readiness/recovery history loads through GET /api/product-intelligence/snapshots?pet_id=<owned-pet>.",
        expected: "200 response scoped to the signed-in owner and selected pet",
      },
      {
        step: "daily-readiness-save",
        action:
          "Save one persistable daily readiness snapshot from the analytics Evidence ring.",
        expected:
          "POST /api/product-intelligence/snapshots returns 200 and the saved record appears in history.",
      },
      {
        step: "recovery-checkpoint-policy",
        action:
          "Attempt recovery checkpoint save only when persistenceAllowed is true; otherwise verify the UI preserves blocked reasons.",
        expected: "No forced save when deterministic persistence is blocked.",
      },
      {
        step: "rls-denial",
        action:
          "Attempt read/write for a pet not owned by the signed-in owner.",
        expected: "403 or empty owner-scoped read; no cross-owner row is written.",
      },
      {
        step: "claim-safety-spot-check",
        action:
          "Verify visible saved-history and Evidence ring copy still avoids diagnosis, prognosis, treatment, and emergency-clearance claims.",
        expected: "Copy remains consistent with VET-1564C claim-language review.",
      },
    ],
    evidencePacketTemplate: {
      migrationApplied: readiness.liveMigrationApplied === true,
      authenticatedProductionSmokeComplete:
        readiness.authenticatedProductionSmokeComplete === true,
      currentDeploymentReadOnlySmokePassed:
        readiness.currentDeploymentReadOnlySmokePassed === true,
      currentDeploymentAuthenticatedWriteSmokeComplete:
        readiness.currentDeploymentAuthenticatedWriteSmokeComplete === true,
      productionEvidence: readiness.productionEvidence ?? null,
      recoveryCheckpointStatus: readiness.recoveryCheckpointStatus,
      requiredAttachments: [
        "migration id or SQL run id",
        "schema verification output",
        "current deployment id and alias inspect output",
        "owner history read response metadata",
        "current-deployment daily readiness save response metadata before claiming current write coverage",
        "daily readiness save response metadata",
        "RLS denial response metadata",
        "claim-safety spot-check notes",
      ],
    },
    rollbackRunbook: [
      "Disable analytics save controls if production reads/writes fail.",
      "Revert the route/UI changes through the owning PR if owner data is corrupted.",
      "Drop only daily_readiness_snapshots and recovery_checkpoints through approved database rollback if the migration itself must be reverted.",
    ],
    blockers: [
      ...(readiness.blockers ?? []),
      ...(readiness.currentDeploymentGaps ?? []),
    ],
    guardrails: [
      "Do not use service-role credentials for owner smoke.",
      "Do not bypass pet ownership or RLS checks to make the smoke pass.",
      "Do not store diagnosis, prognosis, treatment, or emergency-clearance claims.",
      "Do not mark this runbook complete without live production evidence attachments.",
    ],
  };
}

const runbook = buildRunbook();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(runbook, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(runbook, null, 2));
}
