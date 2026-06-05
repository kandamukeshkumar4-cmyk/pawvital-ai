#!/usr/bin/env node
/**
 * Build the VET-1560 completion audit.
 *
 * This maps the user's original objective to current local evidence. It is a
 * review-only audit: it does not call Azure DevOps, providers, model endpoints,
 * or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadModelTechniqueIntake } from "./vet1560-model-technique-intake.mjs";

const artifactPaths = {
  dashboard: "plans/VET-1560-readiness-dashboard.json",
  tickets: "plans/VET-1560-project-manager-tickets.json",
  localProjectManagerSync: "plans/VET-1560-project-manager-local-sync.json",
  azureLiveSyncRunbook: "plans/VET-1560-azure-live-sync-runbook.json",
  modelTechniqueIntakeSnapshot: "plans/VET-1560-model-technique-intake-snapshot.json",
  modelEvidencePacket: "plans/VET-1563-extraction-promotion-evidence-packet.json",
  modelPromotionPreflight:
    "plans/VET-1563-extraction-promotion-readiness-preflight.json",
  modelCandidateSelectionPacket: "plans/VET-1563-extraction-candidate-selection-packet.json",
  modelFrozenOutputTemplates: "plans/VET-1563-extraction-frozen-output-templates.json",
  modelFrozenOutputStatus: "plans/VET-1563-extraction-frozen-output-status.json",
  modelOutputCaptureRunbook: "plans/VET-1563-extraction-output-capture-runbook.json",
  modelOutputCaptureAuthorization: "plans/VET-1563-extraction-output-capture-authorization.json",
  modelCandidateApprovalIntake:
    "plans/VET-1563-extraction-candidate-approval-intake.json",
  modelScorecardReviewPacket: "plans/VET-1563-extraction-scorecard-review-packet.json",
  modelRollbackPlan: "plans/VET-1563-extraction-model-rollback-plan.json",
  modelPromotionSmokeRunbook: "plans/VET-1563-extraction-promotion-smoke-runbook.json",
  protectedClinicalDiffProof: "plans/VET-1563-protected-clinical-diff-proof.json",
  modelPromotionTicket: "plans/VET-1563-extraction-runtime-promotion-ticket.json",
  modelOwnerApprovalRequest: "plans/VET-1563-extraction-owner-approval-request.json",
  claimReview: "plans/VET-1564C-claim-language-review.json",
  readinessContract: "plans/VET-1564-longitudinal-readiness-contract.json",
  productProductionReadiness: "plans/VET-1564-production-readiness.json",
  productProductionSmokeRunbook: "plans/VET-1564-production-smoke-runbook.json",
  productPersistence: "src/lib/product-intelligence-persistence.ts",
  productPersistenceSchema: "supabase-product-intelligence-schema.sql",
  productPersistenceSchemaReadiness:
    "plans/VET-1564-product-persistence-schema-readiness.json",
  productPersistenceRoute:
    "src/app/api/product-intelligence/snapshots/route.ts",
  productOwnerWorkflow:
    "src/app/(dashboard)/analytics/page.tsx",
  tugboatGovernancePlan: "plans/VET-1565-tugboat-governance-plan.json",
  regenerationSummary: "plans/VET-1560-regeneration-summary.json",
};

const outPath = resolve(process.cwd(), "plans/VET-1560-completion-audit.json");
const markdownOutPath = resolve(process.cwd(), "plans/VET-1560-completion-audit.md");

function absolute(relativePath) {
  return resolve(process.cwd(), relativePath);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(absolute(relativePath), "utf8"));
}

function sha256(relativePath) {
  return createHash("sha256").update(readFileSync(absolute(relativePath))).digest("hex");
}

function artifact(relativePath) {
  if (relativePath === artifactPaths.regenerationSummary) {
    return {
      path: relativePath,
      exists: existsSync(absolute(relativePath)),
      sha256: null,
      sha256OmittedReason:
        "regeneration summary is finalized after the completion audit; hashing it here would make regeneration non-idempotent",
    };
  }

  return {
    path: relativePath,
    exists: existsSync(absolute(relativePath)),
    sha256: existsSync(absolute(relativePath)) ? sha256(relativePath) : null,
  };
}

function candidateEvidenceSummary(candidateSelectionPacket) {
  const search = candidateSelectionPacket.candidateEvidenceSearch;
  if (!search) {
    return {
      evidence: "Candidate evidence provenance unavailable.",
      blocker: "candidate-selection: candidate evidence provenance unavailable",
    };
  }

  const sourceSummary = (search.sourcesInspected ?? [])
    .map((source) => `${source.id}=${source.status}`)
    .join(", ");

  return {
    evidence: `Candidate evidence provenance: resolved=${search.resolved}; ${search.conclusion} Sources inspected: ${sourceSummary}`,
    blocker:
      search.resolved === true
        ? null
        : `candidate-selection: ${search.conclusion}`,
  };
}

function buildAudit() {
  const dashboard = readJson(artifactPaths.dashboard);
  const tickets = readJson(artifactPaths.tickets);
  const localProjectManagerSync = existsSync(
    absolute(artifactPaths.localProjectManagerSync)
  )
    ? readJson(artifactPaths.localProjectManagerSync)
    : null;
  const azureLiveSyncRunbook = readJson(artifactPaths.azureLiveSyncRunbook);
  const modelTechniqueIntake = loadModelTechniqueIntake();
  const modelEvidencePacket = readJson(artifactPaths.modelEvidencePacket);
  const modelPreflight = readJson(artifactPaths.modelPromotionPreflight);
  const modelCandidateSelectionPacket = readJson(
    artifactPaths.modelCandidateSelectionPacket
  );
  const modelFrozenOutputTemplates = readJson(artifactPaths.modelFrozenOutputTemplates);
  const modelFrozenOutputStatus = readJson(artifactPaths.modelFrozenOutputStatus);
  const modelOutputCaptureRunbook = readJson(artifactPaths.modelOutputCaptureRunbook);
  const modelOutputCaptureAuthorization = readJson(
    artifactPaths.modelOutputCaptureAuthorization
  );
  const modelCandidateApprovalIntake = readJson(
    artifactPaths.modelCandidateApprovalIntake
  );
  const modelScorecardReviewPacket = readJson(artifactPaths.modelScorecardReviewPacket);
  const modelRollbackPlan = readJson(artifactPaths.modelRollbackPlan);
  const modelPromotionSmokeRunbook = readJson(artifactPaths.modelPromotionSmokeRunbook);
  const protectedClinicalDiffProof = readJson(artifactPaths.protectedClinicalDiffProof);
  const modelPromotionTicket = readJson(artifactPaths.modelPromotionTicket);
  const modelOwnerApprovalRequest = readJson(artifactPaths.modelOwnerApprovalRequest);
  const modelCandidateEvidence = candidateEvidenceSummary(
    modelCandidateSelectionPacket
  );
  const claimReview = readJson(artifactPaths.claimReview);
  const readinessContract = readJson(artifactPaths.readinessContract);
  const productProductionReadiness = readJson(artifactPaths.productProductionReadiness);
  const productProductionSmokeRunbook = readJson(artifactPaths.productProductionSmokeRunbook);
  const tugboatGovernancePlan = readJson(artifactPaths.tugboatGovernancePlan);
  const regenerationSummary = readJson(artifactPaths.regenerationSummary);

  const projectManagerLane = dashboard.lanes.find((lane) => lane.id === "project-manager");
  const modelLane = dashboard.lanes.find((lane) => lane.id === "model-nim-promotion");
  const productLane = dashboard.lanes.find((lane) => lane.id === "whoop-product-contract");
  const claimLane = dashboard.lanes.find((lane) => lane.id === "claim-language");
  const instructionLane = dashboard.lanes.find((lane) => lane.id === "instruction-governance");
  const localQueueValidation =
    projectManagerLane && localProjectManagerSync?.localFallback?.validation
      ? localProjectManagerSync.localFallback.validation
      : null;
  const sourceIds = modelTechniqueIntake.intake.sources?.map((source) => source.id) ?? [];
  const productBlockers = [
    ...(productProductionReadiness.blockers ?? []),
    ...(productProductionReadiness.currentDeploymentGaps ?? []),
  ];
  if (
    productBlockers.length === 0 &&
    productProductionReadiness.authenticatedProductionSmokeComplete !== true
  ) {
    productBlockers.push(
      "Daily readiness and recovery live migration is not applied; authenticated production owner workflow smoke is not complete."
    );
  }
  const requiredSources = ["fareedkhan-train-llm-from-scratch", "syndicalt-tugboat"];
  const hasRequiredSources = requiredSources.every((sourceId) => sourceIds.includes(sourceId));
  const modelBlockers = [
    ...(modelEvidencePacket.readiness?.blockers ?? []),
    ...(modelCandidateSelectionPacket.blockers ?? []).map(
      (blocker) => `candidate-selection: ${blocker}`
    ),
    ...(modelCandidateEvidence.blocker ? [modelCandidateEvidence.blocker] : []),
    ...(modelPromotionTicket.readiness?.blockers ?? []).map(
      (blocker) => `promotion-ticket: ${blocker}`
    ),
    ...(modelOwnerApprovalRequest.approvalBlockers ?? []).map(
      (blocker) => `owner-approval-request: ${blocker}`
    ),
    ...(modelOutputCaptureAuthorization.blockers ?? []).map(
      (blocker) => `output-capture-authorization: ${blocker}`
    ),
  ];

  const requirements = [
    {
      id: "source-reviewed",
      requirement: "Go through FareedKhan-dev/train-llm-from-scratch and syndicalt/tugboat and identify transferable techniques.",
      status: hasRequiredSources ? "proved" : "missing",
      evidence: [
        `${modelTechniqueIntake.source.path} modelTechniqueIntake includes source ids: ${sourceIds.join(", ")}.`,
        "Both sources include observed implementation details, transferable techniques, and non-transferable claims.",
        tickets.source.verdict,
      ],
      blockers: hasRequiredSources ? [] : [`missing source ids: ${requiredSources.filter((sourceId) => !sourceIds.includes(sourceId)).join(", ")}`],
    },
    {
      id: "project-manager-tickets",
      requirement: "Create tickets in the PawVital project manager.",
      status: projectManagerLane?.status === "ready" ? "proved" : "blocked",
      evidence: [
        `${tickets.tickets.length} local ticket payload entries exist.`,
        localProjectManagerSync?.localFallback?.ready
          ? `${localProjectManagerSync.localFallback.itemCount} tickets are queued in the local project-manager fallback.`
          : "Local project-manager fallback artifact is missing.",
        localQueueValidation
          ? `Local queue validation: ${localQueueValidation.status}; ${localQueueValidation.verifierArtifactCount}/${localQueueValidation.ticketCount} verifier artifacts present; ${localQueueValidation.orderedDependencyEdgeCount}/${localQueueValidation.dependencyEdgeCount} dependency edges ordered.`
          : "Local queue validation is unavailable.",
        `Azure live-sync runbook: ${azureLiveSyncRunbook.runSequence?.length ?? 0} execution steps and ${azureLiveSyncRunbook.evidencePacketTemplate?.requiredAttachments?.length ?? 0} required evidence attachments defined.`,
        projectManagerLane?.summary ?? "project-manager lane missing",
      ],
      blockers:
        projectManagerLane?.status === "ready" ? [] : [projectManagerLane?.summary ?? "live sync status unknown"],
    },
    {
      id: "local-config-updated",
      requirement: "Update local.config so next agents can use learned techniques.",
      status: modelTechniqueIntake.intake.nextAgentInstruction ? "proved" : "missing",
      evidence: [
        `${modelTechniqueIntake.source.path} has modelTechniqueIntake.nextAgentInstruction.`,
        `${modelTechniqueIntake.intake.projectManagerArtifacts?.length ?? 0} model/product/project-manager artifacts registered.`,
        `Regeneration command status: ${regenerationSummary.overallStatus}.`,
      ],
      blockers: [],
    },
    {
      id: "nim-and-ai-model-improvement",
      requirement: "Make the NIM models and AI models better for PawVital.",
      status: modelLane?.status === "ready" ? "proved" : "blocked",
      evidence: [
        modelLane?.summary ?? "model lane missing",
        `${modelEvidencePacket.evidenceToAttach?.length ?? 0} promotion evidence slots defined.`,
        `Candidate selection packet: resolved=${modelCandidateSelectionPacket.candidateIdentityResolved}, blockers=${modelCandidateSelectionPacket.blockers?.length ?? 0}.`,
        modelCandidateEvidence.evidence,
        `Frozen output templates: ${modelFrozenOutputTemplates.cases?.length ?? 0} cases and ${modelEvidencePacket.frozenOutputTemplateStatus?.templateCount ?? 0} baseline/candidate envelopes defined.`,
        `Frozen output status: ${modelFrozenOutputStatus.summary?.readyCaseCount ?? 0}/${modelFrozenOutputStatus.summary?.caseCount ?? 0} cases ready for human review.`,
        `Promotion preflight gate summary: candidateGateBlockedCount=${modelPreflight.summary?.candidateGateBlockedCount ?? 0}, candidateContentHashWithoutEvidenceHashCount=${modelPreflight.summary?.candidateContentHashWithoutEvidenceHashCount ?? 0}.`,
        `Output capture runbook: ${modelOutputCaptureRunbook.captureSequence?.length ?? 0} gated capture steps with holdout gated until validation freeze.`,
        `Output capture authorization: readyForProviderCapture=${modelOutputCaptureAuthorization.readyForProviderCapture}, blockers=${modelOutputCaptureAuthorization.blockers?.length ?? 0}.`,
        `Candidate approval intake: status=${modelCandidateApprovalIntake.status}, missingFields=${modelCandidateApprovalIntake.missingFields?.length ?? 0}, approvalRecordTarget=${modelCandidateApprovalIntake.approvalRecordTarget}.`,
        `Scorecard review packet: ${modelScorecardReviewPacket.validationReviews?.length ?? 0} validation and ${modelScorecardReviewPacket.holdoutReviews?.length ?? 0} holdout review forms defined.`,
        `Rollback plan status: ${modelRollbackPlan.status}.`,
        `Promotion smoke runbook: ${modelPromotionSmokeRunbook.smokeRunbook?.length ?? 0} evidence steps and ${modelPromotionSmokeRunbook.evidencePacketTemplate?.requiredAttachments?.length ?? 0} required attachments defined.`,
        `Protected clinical diff proof status: ${protectedClinicalDiffProof.status}.`,
        `Promotion ticket draft: ${modelPromotionTicket.ticket} (${modelPromotionTicket.mode}), ready=${modelPromotionTicket.readiness?.readyToOpenPromotionPr}, candidateResolved=${modelPromotionTicket.routeContext?.candidateIdentityResolved}.`,
        `Owner approval request status: ${modelOwnerApprovalRequest.status}, ready=${modelOwnerApprovalRequest.approvalRequestReady}.`,
        "Runtime routing was intentionally not changed by this review-only work.",
      ],
      blockers: modelBlockers,
    },
    {
      id: "whoop-for-dogs-app",
      requirement: "Move the app toward a best-in-world Whoop-for-Dogs style experience.",
      status:
        ["ready", "partial"].includes(productLane?.status) &&
        claimLane?.status === "ready"
          ? "partial"
          : "blocked",
      evidence: [
        productLane?.summary ?? "product lane missing",
        claimLane?.summary ?? "claim lane missing",
        `${readinessContract.nextImplementationTickets?.length ?? 0} implementation tickets defined.`,
        `Production readiness packet: readyForProductionSmoke=${productProductionReadiness.readyForProductionSmoke}, liveMigrationApplied=${productProductionReadiness.liveMigrationApplied}, authenticatedProductionSmokeComplete=${productProductionReadiness.authenticatedProductionSmokeComplete}, currentDeploymentReadOnlySmokePassed=${productProductionReadiness.currentDeploymentReadOnlySmokePassed}, currentDeploymentAuthenticatedWriteSmokeComplete=${productProductionReadiness.currentDeploymentAuthenticatedWriteSmokeComplete}.`,
        productProductionReadiness.productionEvidence
          ? `Production evidence: writeDeployment=${productProductionReadiness.productionEvidence.deploymentId}, currentDeployment=${productProductionReadiness.productionEvidence.currentDeploymentId}, historicalReadinessRowId=${productProductionReadiness.productionEvidence.readinessRowId}, currentReadinessRowId=${productProductionReadiness.productionEvidence.currentReadinessRowId}, postSmoke500JsonRecordCount=${productProductionReadiness.productionEvidence.postSmoke500JsonRecordCount}.`
          : "Production evidence artifact is not attached.",
        `Recovery checkpoint status: ${productProductionReadiness.recoveryCheckpointStatus ?? "unknown"}.`,
        `Production smoke runbook: ${productProductionSmokeRunbook.migrationRunbook?.length ?? 0} migration steps and ${productProductionSmokeRunbook.smokeRunbook?.length ?? 0} smoke evidence steps defined.`,
        "Readiness/recovery persistence schema, pure row mappers, authenticated read/write route, and analytics save/history controls exist.",
      ],
      blockers: productBlockers,
    },
    {
      id: "claim-safety",
      requirement: "Keep owner-facing model/product intelligence clinically safe.",
      status: claimReview.verdict === "pass" ? "proved" : "blocked",
      evidence: [
        `Claim-language verdict: ${claimReview.verdict}.`,
        `${claimReview.reviewedStringCount} strings reviewed.`,
      ],
      blockers: claimReview.blockedReason ? [claimReview.blockedReason] : [],
    },
    {
      id: "instruction-governance",
      requirement: "Use Tugboat techniques to improve future agent instruction governance without unsafe auto-apply.",
      status: instructionLane?.status === "ready" ? "proved" : "missing",
      evidence: [
        instructionLane?.summary ?? "instruction-governance lane missing",
        `${tugboatGovernancePlan.adoptionPlan?.length ?? 0} proposal-only adoption phases defined.`,
        `${tugboatGovernancePlan.pawvitalBoundaries?.length ?? 0} PawVital boundaries defined.`,
        "Live Tugboat install, llmff runs, and instruction patch application remain intentionally unclaimed.",
      ],
      blockers: [],
    },
  ];

  const blockers = requirements.flatMap((item) =>
    item.blockers.map((blocker) => `${item.id}: ${blocker}`)
  );

  return {
    ticket: "VET-1560",
    mode: "review-only-completion-audit",
    generatedAt:
      process.env.VET1560_COMPLETION_AUDIT_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    objective:
      "Apply FareedKhan-dev/train-llm-from-scratch and syndicalt/tugboat techniques to PawVital, create project-manager tickets, improve NIM/AI model path, build toward a Whoop-for-Dogs app, and update local.config for next agents.",
    overallStatus: blockers.length === 0 ? "complete" : "incomplete",
    summary:
      blockers.length === 0
        ? "All audited objective requirements are proved by current artifacts."
        : `${blockers.length} blocker(s) remain before the full objective can be marked complete.`,
    artifacts: Object.values(artifactPaths).map(artifact),
    requirements,
    blockers,
    completionDecision: {
      canMarkGoalComplete: blockers.length === 0,
      reason:
        blockers.length === 0
          ? "Every audited requirement has current evidence."
          : "The full objective still requires live project-manager sync and model/NIM promotion evidence; product work is partial.",
    },
  };
}

function renderMarkdown(audit) {
  const rows = audit.requirements
    .map(
      (item) =>
        `| ${item.id} | ${item.status.toUpperCase()} | ${item.requirement} | ${item.evidence.join(" ")} |`
    )
    .join("\n");
  const blockers =
    audit.blockers.length > 0
      ? audit.blockers.map((blocker) => `- ${blocker}`).join("\n")
      : "- None";

  return `# VET-1560 Completion Audit

Generated: ${audit.generatedAt}
Mode: ${audit.mode}
Overall status: ${audit.overallStatus.toUpperCase()}

${audit.summary}

## Requirements

| Requirement | Status | Objective Item | Evidence |
|---|---|---|---|
${rows}

## Blockers

${blockers}

## Completion Decision

Can mark goal complete: ${audit.completionDecision.canMarkGoalComplete}

${audit.completionDecision.reason}
`;
}

const audit = buildAudit();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(audit, null, 2)}\n`);
  writeFileSync(markdownOutPath, renderMarkdown(audit));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownOutPath}`);
} else {
  console.log(JSON.stringify(audit, null, 2));
}
