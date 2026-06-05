import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const productProductionEvidencePath = "plans/VET-1564-production-evidence.json";

export function loadProductProductionEvidence(cwd = process.cwd()) {
  const absolutePath = resolve(cwd, productProductionEvidencePath);
  if (!existsSync(absolutePath)) {
    return null;
  }
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

export function summarizeProductProductionEvidence(evidence) {
  const schemaApplied =
    evidence?.schemaApply?.committed === true &&
    evidence.schemaApply.tables?.length >= 2 &&
    evidence.schemaApply.tables.every((table) => table.rlsEnabled === true);
  const ownerSmokePassed =
    evidence?.ownerSmoke?.overallStatus === "pass" &&
    evidence.ownerSmoke.historyReadBefore?.status === 200 &&
    evidence.ownerSmoke.dailyReadinessSave?.status === 201 &&
    evidence.ownerSmoke.historyReadAfter?.status === 200 &&
    evidence.ownerSmoke.historyReadAfter?.readinessCount >= 1 &&
    evidence.ownerSmoke.unownedPetRead?.status === 404 &&
    evidence.ownerSmoke.ownerVisibleScan?.claimLanguageFindings === 0 &&
    evidence.ownerSmoke.ownerVisibleScan?.leakageFindings === 0;
  const rlsPassed =
    evidence?.rlsProof?.pass === true &&
    evidence.rlsProof.ownerVisibleCount >= 1 &&
    evidence.rlsProof.otherVisibleCount === 0 &&
    evidence.rlsProof.crossOwnerInsertDenied === true;
  const claimReviewPassed =
    evidence?.localVerification?.claimLanguageReview?.verdict === "pass" &&
    evidence.localVerification.claimLanguageReview.findings === 0;
  const postSmokeErrorsClean =
    evidence?.postSmokeErrorLogQuery?.statusCode === 500 &&
    evidence.postSmokeErrorLogQuery.jsonRecordCount === 0;
  const focusedTestsPassed =
    evidence?.localVerification?.focusedJestSuites >= 8 &&
    evidence?.localVerification?.focusedJestTests >= 28;
  const liveMigrationApplied = schemaApplied;
  const authenticatedProductionSmokeComplete =
    schemaApplied &&
    ownerSmokePassed &&
    rlsPassed &&
    claimReviewPassed &&
    postSmokeErrorsClean &&
    focusedTestsPassed;
  const recoveryCheckpointProductionWriteExercised =
    evidence?.ownerSmoke?.recoveryCheckpointWrite?.exercised === true;

  return {
    exists: Boolean(evidence),
    liveMigrationApplied,
    authenticatedProductionSmokeComplete,
    schemaApplied,
    ownerSmokePassed,
    rlsPassed,
    claimReviewPassed,
    postSmokeErrorsClean,
    focusedTestsPassed,
    recoveryCheckpointProductionWriteExercised,
    recoveryCheckpointStatus: recoveryCheckpointProductionWriteExercised
      ? "production-write-exercised"
      : "schema-and-route-ready-production-write-not-exercised",
    blockers: [
      ...(schemaApplied ? [] : ["live Supabase migration is not applied"]),
      ...(ownerSmokePassed ? [] : ["authenticated owner workflow smoke is incomplete"]),
      ...(rlsPassed ? [] : ["RLS denial proof is incomplete"]),
      ...(claimReviewPassed ? [] : ["claim-language review is not passing"]),
      ...(postSmokeErrorsClean ? [] : ["post-smoke 500 log query is not clean"]),
      ...(focusedTestsPassed ? [] : ["focused product-intelligence tests are not passing"]),
    ],
  };
}
