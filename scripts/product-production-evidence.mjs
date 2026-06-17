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
  const currentReadOnlySmoke = evidence?.currentProduction?.readOnlyOwnerSmoke;
  const currentDeploymentReadOnlySmokePassed =
    currentReadOnlySmoke?.overallStatus === "pass" &&
    currentReadOnlySmoke?.mutationAttempted === false &&
    currentReadOnlySmoke.authenticatedPage?.status === 200 &&
    currentReadOnlySmoke.authenticatedPage?.loadedSymptomChecker === true &&
    currentReadOnlySmoke.ownerHistoryRead?.status === 200 &&
    currentReadOnlySmoke.ownerHistoryRead?.readinessCount >= 1 &&
    currentReadOnlySmoke.unownedPetRead?.status === 404 &&
    currentReadOnlySmoke.ownerVisibleScan?.status === 200 &&
    currentReadOnlySmoke.ownerVisibleScan?.claimLanguageFindings === 0 &&
    currentReadOnlySmoke.ownerVisibleScan?.leakageFindings === 0;
  const currentDeploymentAuthenticatedWriteSmokeComplete =
    evidence?.currentProduction?.writeSmoke?.exercised === true &&
    evidence.currentProduction.writeSmoke?.status === 201;
  const productionPersistenceStatus =
    authenticatedProductionSmokeComplete &&
    currentDeploymentAuthenticatedWriteSmokeComplete
      ? "go-current-production"
      : authenticatedProductionSmokeComplete &&
          currentDeploymentReadOnlySmokePassed
        ? "go-current-read-historical-write"
        : authenticatedProductionSmokeComplete
          ? "go-historical-write-current-deployment-unproven"
          : "hold";
  const currentDeploymentSmokeStatus =
    currentDeploymentAuthenticatedWriteSmokeComplete
      ? "current-deployment-write-exercised"
      : currentDeploymentReadOnlySmokePassed
        ? "current-deployment-read-only-pass-write-not-exercised"
        : "current-deployment-smoke-missing";
  const currentDeploymentBlockers = currentDeploymentReadOnlySmokePassed
    ? []
    : ["current deployment read-only owner-history smoke is missing or failing"];
  const currentDeploymentGaps = currentDeploymentAuthenticatedWriteSmokeComplete
    ? []
    : ["current deployment authenticated write smoke was not exercised"];

  return {
    exists: Boolean(evidence),
    liveMigrationApplied,
    authenticatedProductionSmokeComplete,
    productionPersistenceStatus,
    schemaApplied,
    ownerSmokePassed,
    rlsPassed,
    claimReviewPassed,
    postSmokeErrorsClean,
    focusedTestsPassed,
    currentDeploymentReadOnlySmokePassed,
    currentDeploymentAuthenticatedWriteSmokeComplete,
    currentDeploymentSmokeStatus,
    currentDeploymentBlockers,
    currentDeploymentGaps,
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
