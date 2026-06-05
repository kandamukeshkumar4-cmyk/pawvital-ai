#!/usr/bin/env node
/**
 * Build the VET-1564 production readiness packet for product intelligence.
 *
 * This is review-only. It does not apply Supabase migrations, call production,
 * write data, or enable owner workflow automation.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadProductProductionEvidence,
  productProductionEvidencePath,
  summarizeProductProductionEvidence,
} from "./product-production-evidence.mjs";

const schemaReadinessPath = resolve(
  process.cwd(),
  "plans/VET-1564-product-persistence-schema-readiness.json"
);
const claimReviewPath = resolve(
  process.cwd(),
  "plans/VET-1564C-claim-language-review.json"
);
const readinessContractPath = resolve(
  process.cwd(),
  "plans/VET-1564-longitudinal-readiness-contract.json"
);
const routePath = resolve(
  process.cwd(),
  "src/app/api/product-intelligence/snapshots/route.ts"
);
const persistenceMapperPath = resolve(
  process.cwd(),
  "src/lib/product-intelligence-persistence.ts"
);
const ownerWorkflowTestPath = resolve(
  process.cwd(),
  "tests/analytics-product-owner-workflow.test.ts"
);
const productionEvidencePath = resolve(
  process.cwd(),
  productProductionEvidencePath
);
const outPath = resolve(
  process.cwd(),
  "plans/VET-1564-production-readiness.json"
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

function buildReadiness() {
  const schemaReadiness = readJson(schemaReadinessPath);
  const claimReview = readJson(claimReviewPath);
  const readinessContract = readJson(readinessContractPath);
  const productionEvidence = loadProductProductionEvidence();
  const productionEvidenceSummary =
    summarizeProductProductionEvidence(productionEvidence);
  const routeExists = existsSync(routePath);
  const ownerWorkflowTestExists = existsSync(ownerWorkflowTestPath);
  const routeText = readText(routePath);
  const persistenceMapperText = readText(persistenceMapperPath);
  const ownerWorkflowTest = readText(ownerWorkflowTestPath);
  const routeGuards = {
    routeExists,
    authenticatedUserRequired: routeText.includes("supabase.auth.getUser()"),
    petOwnershipCheck: routeText.includes("verifyPetOwnership"),
    demoModeBlocked: routeText.includes("DEMO_MODE"),
    persistenceAllowedEnforced:
      routeText.includes("buildDailyReadinessSnapshot") &&
      routeText.includes("buildRecoveryCheckpoint") &&
      routeText.includes("mapReadinessSnapshotToRow") &&
      routeText.includes("mapRecoveryCheckpointToRow") &&
      persistenceMapperText.includes("!snapshot.persistenceAllowed") &&
      persistenceMapperText.includes("!checkpoint.persistenceAllowed"),
    rateLimitEnforced: routeText.includes("checkRateLimit"),
    ownerScopedHistoryRead: routeText.includes("daily_readiness_snapshots") &&
      routeText.includes("recovery_checkpoints") &&
      routeText.includes(".eq(\"user_id\", user.id)"),
  };
  const workflowSmoke = {
    ownerWorkflowTestExists,
    selectedDogHistoryRead: ownerWorkflowTest.includes("2 saved readiness records"),
    readinessSavePost: ownerWorkflowTest.includes("/api/product-intelligence/snapshots") &&
      ownerWorkflowTest.includes("method: \"POST\""),
    credentialedRequest: ownerWorkflowTest.includes("credentials: \"include\""),
  };
  const missingRouteGuards = Object.entries(routeGuards)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const missingWorkflowEvidence = Object.entries(workflowSmoke)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    ticket: "VET-1564A/B",
    mode: "review-only-production-readiness",
    generatedAt:
      process.env.PRODUCT_PRODUCTION_READINESS_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    readyForProductionSmoke:
      schemaReadiness.readyForMigrationReview === true &&
      claimReview.verdict === "pass" &&
      missingRouteGuards.length === 0 &&
      missingWorkflowEvidence.length === 0,
    liveMigrationApplied: productionEvidenceSummary.liveMigrationApplied,
    authenticatedProductionSmokeComplete:
      productionEvidenceSummary.authenticatedProductionSmokeComplete,
    currentDeploymentReadOnlySmokePassed:
      productionEvidenceSummary.currentDeploymentReadOnlySmokePassed,
    currentDeploymentAuthenticatedWriteSmokeComplete:
      productionEvidenceSummary.currentDeploymentAuthenticatedWriteSmokeComplete,
    currentDeploymentSmokeStatus:
      productionEvidenceSummary.currentDeploymentSmokeStatus,
    productionPersistenceStatus:
      productionEvidenceSummary.productionPersistenceStatus,
    recoveryCheckpointProductionWriteExercised:
      productionEvidenceSummary.recoveryCheckpointProductionWriteExercised,
    recoveryCheckpointStatus: productionEvidenceSummary.recoveryCheckpointStatus,
    inputArtifacts: {
      schemaReadiness: artifact(
        schemaReadinessPath,
        "plans/VET-1564-product-persistence-schema-readiness.json"
      ),
      claimReview: artifact(claimReviewPath, "plans/VET-1564C-claim-language-review.json"),
      readinessContract: artifact(
        readinessContractPath,
        "plans/VET-1564-longitudinal-readiness-contract.json"
      ),
      route: artifact(
        routePath,
        "src/app/api/product-intelligence/snapshots/route.ts"
      ),
      persistenceMapper: artifact(
        persistenceMapperPath,
        "src/lib/product-intelligence-persistence.ts"
      ),
      ownerWorkflowTest: artifact(
        ownerWorkflowTestPath,
        "tests/analytics-product-owner-workflow.test.ts"
      ),
      productionEvidence: artifact(
        productionEvidencePath,
        productProductionEvidencePath
      ),
    },
    productionEvidence: productionEvidence
      ? {
          issue: productionEvidence.issue,
          decision: productionEvidence.decision,
          deploymentId: productionEvidence.production?.deploymentId,
          currentDeploymentId: productionEvidence.currentProduction?.deploymentId,
          targetDatabaseHost: productionEvidence.production?.targetDatabaseHost,
          schemaSha256: productionEvidence.production?.schemaSha256,
          readinessRowId:
            productionEvidence.ownerSmoke?.dailyReadinessSave?.rowId,
          ownerSmokeCompletedAt: productionEvidence.ownerSmoke?.completedAt,
          rlsProofCompletedAt: productionEvidence.rlsProof?.completedAt,
          currentDeploymentReadOnlySmoke:
            productionEvidence.currentProduction?.readOnlyOwnerSmoke,
          currentDeploymentWriteSmoke:
            productionEvidence.currentProduction?.writeSmoke,
          postSmoke500JsonRecordCount:
            productionEvidence.postSmokeErrorLogQuery?.jsonRecordCount,
          sourceEvidence: productionEvidence.sourceEvidence,
        }
      : null,
    routeGuards,
    workflowSmoke,
    missingRouteGuards,
    missingWorkflowEvidence,
    productionSmokePlan: [
      "Apply supabase-product-intelligence-schema.sql through the approved Supabase migration path.",
      "Run authenticated owner workflow on production with a real test pet owned by the signed-in user.",
      "Save one persistable daily readiness snapshot and verify it appears in saved history.",
      "Save or withhold recovery checkpoint according to persistenceAllowed and verify blocked reasons are preserved.",
      "Confirm RLS denies reads/writes for a pet owned by another user.",
      "Rerun claim-language review after any owner-visible copy changes.",
    ],
    rollbackPlan: [
      "Disable the analytics save controls if production write/read fails.",
      "Revert the route/UI changes through the owning promotion PR if persistence corrupts owner data.",
      "Drop only the two product-intelligence tables through an approved database rollback if the migration itself must be reverted.",
    ],
    blockers: productionEvidenceSummary.blockers,
    currentDeploymentBlockers:
      productionEvidenceSummary.currentDeploymentBlockers,
    currentDeploymentGaps: productionEvidenceSummary.currentDeploymentGaps,
    guardrails: [
      "This packet does not apply the migration.",
      "Do not use service-role credentials in owner workflow smoke.",
      "Do not claim current-deployment write coverage unless the current deployment POST smoke is exercised.",
      "Do not store diagnosis, prognosis, treatment, or emergency-clearance claims.",
      "Do not bypass pet ownership or RLS checks to make the smoke pass.",
    ],
    contractTickets: readinessContract.nextImplementationTickets ?? [],
  };
}

const readiness = buildReadiness();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(readiness, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(readiness, null, 2));
}
