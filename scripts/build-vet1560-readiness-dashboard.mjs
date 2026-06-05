#!/usr/bin/env node
/**
 * Build the VET-1560 readiness dashboard.
 *
 * This aggregates the local project-manager, model/NIM, and product-intelligence
 * artifacts into one review-only handoff for the next agent. It does not call
 * Azure DevOps, providers, model endpoints, or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const artifactPaths = {
  azureSyncPreflight: "plans/VET-1560-azure-sync-preflight.json",
  azureLiveSyncRunbook: "plans/VET-1560-azure-live-sync-runbook.json",
  projectManagerSync: "plans/VET-1560-project-manager-sync-readiness.json",
  projectManagerLocalSync: "plans/VET-1560-project-manager-local-sync.json",
  modelPromotionPreflight:
    "plans/VET-1563-extraction-promotion-readiness-preflight.json",
  modelPromotionEvidencePacket:
    "plans/VET-1563-extraction-promotion-evidence-packet.json",
  modelCandidateSelectionPacket:
    "plans/VET-1563-extraction-candidate-selection-packet.json",
  modelFrozenOutputTemplates:
    "plans/VET-1563-extraction-frozen-output-templates.json",
  modelFrozenOutputStatus:
    "plans/VET-1563-extraction-frozen-output-status.json",
  modelOutputCaptureRunbook:
    "plans/VET-1563-extraction-output-capture-runbook.json",
  modelOutputCaptureAuthorization:
    "plans/VET-1563-extraction-output-capture-authorization.json",
  modelCandidateApprovalIntake:
    "plans/VET-1563-extraction-candidate-approval-intake.json",
  modelScorecardReviewPacket:
    "plans/VET-1563-extraction-scorecard-review-packet.json",
  modelRollbackPlan: "plans/VET-1563-extraction-model-rollback-plan.json",
  modelPromotionSmokeRunbook:
    "plans/VET-1563-extraction-promotion-smoke-runbook.json",
  protectedClinicalDiffProof: "plans/VET-1563-protected-clinical-diff-proof.json",
  modelPromotionTicket: "plans/VET-1563-extraction-runtime-promotion-ticket.json",
  modelOwnerApprovalRequest: "plans/VET-1563-extraction-owner-approval-request.json",
  claimLanguageReview: "plans/VET-1564C-claim-language-review.json",
  readinessContract: "plans/VET-1564-longitudinal-readiness-contract.json",
  productProductionReadiness: "plans/VET-1564-production-readiness.json",
  productProductionSmokeRunbook: "plans/VET-1564-production-smoke-runbook.json",
  tugboatGovernancePlan: "plans/VET-1565-tugboat-governance-plan.json",
  regenerationSummary: "plans/VET-1560-regeneration-summary.json",
};

const outPath = resolve(
  process.cwd(),
  "plans/VET-1560-readiness-dashboard.json"
);
const markdownOutPath = resolve(
  process.cwd(),
  "plans/VET-1560-readiness-dashboard.md"
);

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8"));
}

function sha256(relativePath) {
  return createHash("sha256")
    .update(readFileSync(resolve(process.cwd(), relativePath)))
    .digest("hex");
}

function artifact(relativePath) {
  if (relativePath === artifactPaths.regenerationSummary) {
    return {
      path: relativePath,
      exists: existsSync(resolve(process.cwd(), relativePath)),
      sha256: null,
      sha256OmittedReason:
        "regeneration summary is finalized after the dashboard; hashing it here would make regeneration non-idempotent",
    };
  }

  return {
    path: relativePath,
    exists: existsSync(resolve(process.cwd(), relativePath)),
    sha256: existsSync(resolve(process.cwd(), relativePath))
      ? sha256(relativePath)
      : null,
  };
}

function status(value) {
  return value ? "ready" : "blocked";
}

function candidateEvidenceSummary(candidateSelectionPacket) {
  const search = candidateSelectionPacket.candidateEvidenceSearch;
  if (!search) {
    return "candidate evidence provenance unavailable";
  }

  const sourceSummary = (search.sourcesInspected ?? [])
    .map((source) => `${source.id}=${source.status}`)
    .join(", ");

  return `candidate evidence provenance resolved=${search.resolved}; ${search.conclusion} Sources inspected: ${sourceSummary}`;
}

function buildDashboard() {
  const projectManager = readJson(artifactPaths.projectManagerSync);
  const projectManagerLocalSync = existsSync(
    resolve(process.cwd(), artifactPaths.projectManagerLocalSync)
  )
    ? readJson(artifactPaths.projectManagerLocalSync)
    : null;
  const azurePreflight = readJson(artifactPaths.azureSyncPreflight);
  const azureLiveSyncRunbook = readJson(artifactPaths.azureLiveSyncRunbook);
  const modelPreflight = readJson(artifactPaths.modelPromotionPreflight);
  const modelEvidencePacket = readJson(artifactPaths.modelPromotionEvidencePacket);
  const modelCandidateSelectionPacket = readJson(
    artifactPaths.modelCandidateSelectionPacket
  );
  const modelOutputCaptureRunbook = readJson(artifactPaths.modelOutputCaptureRunbook);
  const modelOutputCaptureAuthorization = readJson(
    artifactPaths.modelOutputCaptureAuthorization
  );
  const modelCandidateApprovalIntake = readJson(
    artifactPaths.modelCandidateApprovalIntake
  );
  const modelPromotionSmokeRunbook = readJson(artifactPaths.modelPromotionSmokeRunbook);
  const modelPromotionTicket = readJson(artifactPaths.modelPromotionTicket);
  const modelOwnerApprovalRequest = readJson(artifactPaths.modelOwnerApprovalRequest);
  const claimReview = readJson(artifactPaths.claimLanguageReview);
  const readinessContract = readJson(artifactPaths.readinessContract);
  const productProductionReadiness = readJson(artifactPaths.productProductionReadiness);
  const productProductionSmokeRunbook = readJson(artifactPaths.productProductionSmokeRunbook);
  const tugboatGovernancePlan = readJson(artifactPaths.tugboatGovernancePlan);
  const candidateProvenanceSummary = candidateEvidenceSummary(
    modelCandidateSelectionPacket
  );
  const localQueueValidation = projectManager.localFallbackValidation;
  const localQueueValidationSummary = localQueueValidation
    ? `queue validation=${localQueueValidation.status}; ${localQueueValidation.verifierArtifactCount}/${localQueueValidation.ticketCount} verifier artifacts present; ${localQueueValidation.orderedDependencyEdgeCount}/${localQueueValidation.dependencyEdgeCount} dependency edges ordered`
    : "queue validation unavailable";
  const productHistoricalSmokeComplete =
    productProductionReadiness.authenticatedProductionSmokeComplete === true;
  const productCurrentWriteComplete =
    productProductionReadiness.currentDeploymentAuthenticatedWriteSmokeComplete === true;
  const productRecoveryWriteComplete =
    productProductionReadiness.recoveryCheckpointProductionWriteExercised === true;
  let productNextAction =
    "Apply the approved Supabase migration, then run the authenticated production owner workflow smoke from plans/VET-1564-production-readiness.json.";
  if (productHistoricalSmokeComplete && !productCurrentWriteComplete) {
    productNextAction =
      "Current deployment read-only owner-history proof passed; run a controlled current-deployment POST smoke before claiming current write coverage.";
  } else if (productHistoricalSmokeComplete && !productRecoveryWriteComplete) {
    productNextAction =
      "Current-deployment daily readiness write proof passed; capture recovery-checkpoint production write or blocked-reason smoke before claiming recovery write coverage.";
  } else if (productHistoricalSmokeComplete) {
    productNextAction =
      "Keep monitoring product-intelligence persistence and rerun smoke after schema, route, RLS, or copy changes.";
  }
  const productSummary =
    productHistoricalSmokeComplete
      ? `${readinessContract.nextImplementationTickets?.length ?? 0} implementation tickets defined; product-intelligence persistence=${productProductionReadiness.productionPersistenceStatus}; write deployment=${productProductionReadiness.productionEvidence?.deploymentId}; current deployment=${productProductionReadiness.productionEvidence?.currentDeploymentId}; current smoke=${productProductionReadiness.currentDeploymentSmokeStatus}; historical readiness row=${productProductionReadiness.productionEvidence?.readinessRowId}; current readiness row=${productProductionReadiness.productionEvidence?.currentReadinessRowId}; recovery checkpoint status=${productProductionReadiness.recoveryCheckpointStatus}.`
      : `${readinessContract.nextImplementationTickets?.length ?? 0} implementation tickets defined; production smoke ready=${productProductionReadiness.readyForProductionSmoke}, live migration applied=${productProductionReadiness.liveMigrationApplied}; smoke runbook has ${productProductionSmokeRunbook.smokeRunbook?.length ?? 0} evidence steps.`;

  const lanes = [
    {
      id: "project-manager",
      label: "Project-manager sync",
      status: status(projectManager.readyForExecutionSync),
      summary: projectManager.readyForLiveSync
        ? `${projectManager.ticketCount} tickets ready for live Azure Boards sync.`
        : projectManagerLocalSync?.localFallback?.ready
          ? `${projectManagerLocalSync.localFallback.itemCount} tickets queued in the local project-manager fallback; ${localQueueValidationSummary}; Azure live sync remains blocked by: ${azurePreflight.missing.join(", ") || "none"}.`
          : `${projectManager.blockedReason}; Azure preflight missing: ${azurePreflight.missing.join(", ") || "none"}; live-sync runbook has ${azureLiveSyncRunbook.runSequence?.length ?? 0} steps.`,
      nextAction: projectManager.readyForLiveSync
        ? projectManager.liveRunCommand
        : projectManagerLocalSync?.localFallback?.ready
          ? "Use plans/VET-1560-project-manager-local-sync.json as the current execution queue; add Azure credentials only in a separate live-sync pass."
          : "Run npm run devops:vet1560-azure-preflight, then npm run devops:vet1560-local-sync.",
    },
    {
      id: "model-nim-promotion",
      label: "Model/NIM promotion",
      status: status(modelPreflight.summary?.readyForPromotionTicket),
      summary: modelPreflight.summary?.readyForPromotionTicket
        ? "Extraction route has enough evidence to open a separate promotion ticket."
        : `${modelPreflight.summary?.blockedEvidenceCount ?? 0} blocked evidence categories; candidate selection resolved=${modelCandidateSelectionPacket.candidateIdentityResolved}; ${candidateProvenanceSummary}; candidate approval intake status=${modelCandidateApprovalIntake.status}, missing fields=${modelCandidateApprovalIntake.missingFields?.length ?? 0}; promotion ticket candidate resolved=${modelPromotionTicket.routeContext?.candidateIdentityResolved}; owner approval request ready=${modelOwnerApprovalRequest.approvalRequestReady}; ${modelPreflight.summary?.candidateOutputHashes ?? 0}/${modelPreflight.summary?.outputCases ?? 0} candidate output hashes populated; candidate capture gates blocked=${modelPreflight.summary?.candidateGateBlockedCount ?? 0}; diagnostic candidate content hashes without evidence hash=${modelPreflight.summary?.candidateContentHashWithoutEvidenceHashCount ?? 0}; evidence packet has ${modelEvidencePacket.evidenceToAttach?.length ?? 0} attachment slots; capture runbook has ${modelOutputCaptureRunbook.captureSequence?.length ?? 0} gated steps; capture authorization ready=${modelOutputCaptureAuthorization.readyForProviderCapture}; promotion smoke runbook has ${modelPromotionSmokeRunbook.smokeRunbook?.length ?? 0} evidence steps; promotion ticket blockers=${modelPromotionTicket.readiness?.blockers?.length ?? 0}.`,
      nextAction: modelPreflight.summary?.readyForPromotionTicket
        ? "Open a separate runtime promotion ticket with owner approval and rollback."
        : modelPreflight.nextActions?.[0]?.action ?? "Populate model promotion evidence.",
    },
    {
      id: "claim-language",
      label: "Claim-language review",
      status: claimReview.verdict === "pass" ? "ready" : "blocked",
      summary:
        claimReview.verdict === "pass"
          ? `${claimReview.reviewedStringCount} strings reviewed with no blocked findings.`
          : claimReview.blockedReason,
      nextAction:
        claimReview.verdict === "pass"
          ? "Rerun npm run product:claim-language-review after any owner-visible copy change."
          : "Resolve blocked claim-language findings before expanding product copy.",
    },
    {
      id: "whoop-product-contract",
      label: "Whoop-style product contract",
      status: productHistoricalSmokeComplete && !productCurrentWriteComplete
        ? "partial"
        : "ready",
      summary: productSummary,
      nextAction: productNextAction,
    },
    {
      id: "instruction-governance",
      label: "Instruction governance",
      status: "ready",
      summary: `${tugboatGovernancePlan.projectManagerTicket.id} defines a proposal-only Tugboat adoption plan with ${tugboatGovernancePlan.adoptionPlan.length} phases and ${tugboatGovernancePlan.pawvitalBoundaries.length} PawVital boundaries.`,
      nextAction:
        "Use VET-1565 for any Tugboat-style instruction observability work; do not install, run llmff, or apply instruction patches without a separate approved trace bundle and reviewer decision.",
    },
  ];
  const blockers = lanes
    .filter((lane) => lane.status !== "ready")
    .map((lane) => `${lane.label}: ${lane.summary}`);

  return {
    ticket: "VET-1560",
    mode: "review-only-dashboard",
    generatedAt:
      process.env.VET1560_READINESS_DASHBOARD_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    overallStatus: blockers.length === 0 ? "ready" : "blocked",
    summary:
      blockers.length === 0
        ? "All local review-only lanes are ready for the next authorized step."
        : `${blockers.length} lane(s) blocked before the full objective is complete.`,
    artifacts: Object.values(artifactPaths).map(artifact),
    lanes,
    blockers,
    guardrails: [
      "Do not treat local project-manager fallback evidence as Azure Boards live-sync evidence.",
      "Do not mutate runtime NIM, narrow-pack, provider env, or model routing from this dashboard.",
      "Do not promote a model from validation-only or unpopulated scorecard evidence.",
      "Do not weaken protected deterministic clinical files while improving product intelligence.",
      "Keep owner-visible readiness copy tied to evidence coverage and claim-language review.",
      "Keep Tugboat-style instruction optimization proposal-only until a reviewer approves a trace bundle, policy file, eval suite, and rollback plan.",
      "Use npm run vet1560:regenerate-all to refresh this evidence chain before handoff.",
    ],
  };
}

const dashboard = buildDashboard();

function renderMarkdown(dashboard) {
  const lanes = dashboard.lanes
    .map(
      (lane) =>
        `| ${lane.label} | ${lane.status.toUpperCase()} | ${lane.summary} | ${lane.nextAction} |`
    )
    .join("\n");
  const blockers =
    dashboard.blockers.length > 0
      ? dashboard.blockers.map((blocker) => `- ${blocker}`).join("\n")
      : "- None";
  const guardrails = dashboard.guardrails
    .map((guardrail) => `- ${guardrail}`)
    .join("\n");
  const artifacts = dashboard.artifacts
    .map((artifact) => {
      const digest =
        artifact.sha256 ??
        artifact.sha256OmittedReason ??
        "missing";
      return `- \`${artifact.path}\` (${digest})`;
    })
    .join("\n");

  return `# VET-1560 Readiness Dashboard

Generated: ${dashboard.generatedAt}
Mode: ${dashboard.mode}
Overall status: ${dashboard.overallStatus.toUpperCase()}

${dashboard.summary}

## Lanes

| Lane | Status | Summary | Next action |
|---|---|---|---|
${lanes}

## Blockers

${blockers}

## Guardrails

${guardrails}

## Source Artifacts

${artifacts}
`;
}

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(dashboard, null, 2)}\n`);
  writeFileSync(markdownOutPath, renderMarkdown(dashboard));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownOutPath}`);
} else {
  console.log(JSON.stringify(dashboard, null, 2));
}
