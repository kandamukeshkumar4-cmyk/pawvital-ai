#!/usr/bin/env node
/**
 * Build a VET-1563 model promotion evidence packet template.
 *
 * This is a fillable review-only packet for the future promotion ticket. It
 * does not call providers, score outputs, train models, or mutate runtime
 * routing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const preflightPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-readiness-preflight.json`
);
const checklistPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-checklist.json`
);
const outputCapturePlanPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-capture-plan.json`
);
const outputTemplatesPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-templates.json`
);
const outputStatusPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-status.json`
);
const rollbackPlanPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-model-rollback-plan.json`
);
const protectedClinicalDiffProofPath = resolve(
  process.cwd(),
  "plans/VET-1563-protected-clinical-diff-proof.json"
);
const promotionTicketPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-runtime-promotion-ticket.json`
);
const ownerApprovalRequestPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-owner-approval-request.json`
);
const promotionSmokeRunbookPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-smoke-runbook.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-evidence-packet.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function templateFor(outputTemplates, caseSourceId, variant) {
  return (outputTemplates?.cases ?? [])
    .find((item) => item.caseSourceId === caseSourceId)
    ?.templates?.find((item) => item.variant === variant) ?? null;
}

function outputSlots(outputCapturePlan, outputStatus, outputTemplates) {
  const statusCases = outputStatus?.cases ?? [];
  return [
    ...(outputCapturePlan.validationCases ?? []),
    ...(outputCapturePlan.holdoutCases ?? []),
  ].map((item) => {
    const statusCase = statusCases.find(
      (candidate) => candidate.caseSourceId === item.caseSourceId
    );
    const candidateTemplate = templateFor(
      outputTemplates,
      item.caseSourceId,
      "candidate"
    );
    const baselineSha256 =
      statusCase?.baseline?.schemaValid === true ? statusCase?.baseline?.sha256 ?? null : null;
    const candidateSha256 =
      statusCase?.candidate?.schemaValid === true ? statusCase?.candidate?.sha256 ?? null : null;
    return {
      caseSourceId: item.caseSourceId,
      split: item.split,
      baselineOutputPath: item.baseline.outputPath,
      baselineOutputSha256: baselineSha256,
      baselineSchemaValid: statusCase?.baseline?.schemaValid ?? false,
      baselineBlocker: statusCase?.baseline?.blocker ?? null,
      candidateOutputPath: item.candidate.outputPath,
      candidateOutputSha256: candidateSha256,
      candidateOutputContentSha256: statusCase?.candidate?.contentSha256 ?? null,
      candidateSchemaValid: statusCase?.candidate?.schemaValid ?? false,
      candidateBlocker: statusCase?.candidate?.blocker ?? null,
      candidateCaptureGate: candidateTemplate?.captureGate ?? null,
      reviewer: item.scorecardPatch?.expectedEvidence?.reviewer ?? null,
      populated: Boolean(
        baselineSha256 &&
          candidateSha256 &&
          statusCase?.baseline?.schemaValid === true &&
          statusCase?.candidate?.schemaValid === true &&
          item.scorecardPatch?.expectedEvidence?.reviewer
      ),
    };
  });
}

function buildPacket() {
  const preflight = readJson(preflightPath);
  const checklist = readJson(checklistPath);
  const outputCapturePlan = readJson(outputCapturePlanPath);
  const outputStatus = existsSync(outputStatusPath) ? readJson(outputStatusPath) : null;
  const outputTemplates = existsSync(outputTemplatesPath)
    ? readJson(outputTemplatesPath)
    : null;
  const rollbackPlan = existsSync(rollbackPlanPath) ? readJson(rollbackPlanPath) : null;
  const protectedClinicalDiffProof = existsSync(protectedClinicalDiffProofPath)
    ? readJson(protectedClinicalDiffProofPath)
    : null;
  const promotionTicket = existsSync(promotionTicketPath)
    ? readJson(promotionTicketPath)
    : null;
  const ownerApprovalRequest = existsSync(ownerApprovalRequestPath)
    ? readJson(ownerApprovalRequestPath)
    : null;
  const promotionSmokeRunbook = existsSync(promotionSmokeRunbookPath)
    ? readJson(promotionSmokeRunbookPath)
    : null;
  const slots = outputSlots(outputCapturePlan, outputStatus, outputTemplates);
  const blockedEvidence = checklist.requiredEvidence.filter(
    (item) => item.status !== "ready"
  );

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only-evidence-packet-template",
    generatedAt:
      process.env.MODEL_PROMOTION_EVIDENCE_PACKET_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Fillable packet for a future separate promotion ticket. It does not authorize runtime model routing changes.",
    inputArtifacts: {
      preflight: {
        path: `plans/VET-1563-${role}-promotion-readiness-preflight.json`,
        sha256: sha256(preflightPath),
      },
      checklist: {
        path: `plans/VET-1563-${role}-promotion-checklist.json`,
        sha256: sha256(checklistPath),
      },
      outputCapturePlan: {
        path: `plans/VET-1563-${role}-frozen-output-capture-plan.json`,
        sha256: sha256(outputCapturePlanPath),
      },
      outputTemplates: outputTemplates
        ? {
            path: `plans/VET-1563-${role}-frozen-output-templates.json`,
            sha256: sha256(outputTemplatesPath),
          }
        : null,
      outputStatus: outputStatus
        ? {
            path: `plans/VET-1563-${role}-frozen-output-status.json`,
            sha256: sha256(outputStatusPath),
          }
        : null,
      rollbackPlan: rollbackPlan
        ? {
            path: `plans/VET-1563-${role}-model-rollback-plan.json`,
            sha256: sha256(rollbackPlanPath),
          }
        : null,
      protectedClinicalDiffProof: protectedClinicalDiffProof
        ? {
            path: "plans/VET-1563-protected-clinical-diff-proof.json",
            sha256: sha256(protectedClinicalDiffProofPath),
          }
        : null,
      promotionTicket: promotionTicket
        ? {
            path: `plans/VET-1563-${role}-runtime-promotion-ticket.json`,
            sha256: sha256(promotionTicketPath),
          }
        : null,
      ownerApprovalRequest: ownerApprovalRequest
        ? {
            path: `plans/VET-1563-${role}-owner-approval-request.json`,
            sha256: sha256(ownerApprovalRequestPath),
          }
        : null,
      promotionSmokeRunbook: promotionSmokeRunbook
        ? {
            path: `plans/VET-1563-${role}-promotion-smoke-runbook.json`,
            sha256: sha256(promotionSmokeRunbookPath),
          }
        : null,
    },
    readiness: {
      readyForPromotionTicket: preflight.summary.readyForPromotionTicket,
      blockedEvidenceCount: preflight.summary.blockedEvidenceCount,
      blockers: preflight.blockers,
    },
    evidenceToAttach: blockedEvidence.map((item) => ({
      id: item.id,
      currentStatus: item.status,
      requiredProof: item.evidence,
      blockers: item.blockers,
      attachmentSlot: null,
      reviewer: null,
      completedAt: null,
    })),
    frozenOutputSlots: slots,
    frozenOutputTemplateStatus: {
      available: Boolean(outputTemplates),
      templateCount:
        outputTemplates?.cases?.reduce(
          (count, item) => count + (item.templates?.length ?? 0),
          0
        ) ?? 0,
      schema: outputTemplates?.envelopeSchema ?? null,
    },
    frozenOutputStatus: outputStatus
      ? {
          readyForHumanReview: outputStatus.summary?.readyForHumanReview ?? false,
          readyCaseCount: outputStatus.summary?.readyCaseCount ?? 0,
          missingBaselineOutputCount:
            outputStatus.summary?.missingBaselineOutputCount ?? null,
          missingCandidateOutputCount:
            outputStatus.summary?.missingCandidateOutputCount ?? null,
          invalidJsonOutputCount: outputStatus.summary?.invalidJsonOutputCount ?? null,
          invalidSchemaOutputCount:
            outputStatus.summary?.invalidSchemaOutputCount ?? null,
        }
      : null,
    ownerApproval: {
      required: true,
      approver: null,
      approvedAt: null,
      approvalArtifact: ownerApprovalRequest
        ? `plans/VET-1563-${role}-owner-approval-request.json`
        : null,
      notes: null,
    },
    separatePromotionTicket: {
      required: true,
      draftArtifact: promotionTicket
        ? `plans/VET-1563-${role}-runtime-promotion-ticket.json`
        : null,
      draftTicket: promotionTicket?.ticket ?? null,
      runtimeChangeAllowedByDraft: promotionTicket?.runtimeChangeAllowedByThisArtifact ?? null,
      readyToOpenPromotionPr: promotionTicket?.readiness?.readyToOpenPromotionPr ?? false,
      blockers: promotionTicket?.readiness?.blockers ?? ["promotion ticket draft missing"],
    },
    promotionSmokeRunbook: {
      required: true,
      artifact: promotionSmokeRunbook
        ? `plans/VET-1563-${role}-promotion-smoke-runbook.json`
        : null,
      readyForSmoke: promotionSmokeRunbook?.currentStatus?.readyForSmoke ?? false,
      evidenceStepCount: promotionSmokeRunbook?.smokeRunbook?.length ?? 0,
      requiredAttachments:
        promotionSmokeRunbook?.evidencePacketTemplate?.requiredAttachments ?? [],
    },
    rollbackPlan: {
      required: true,
      status: rollbackPlan?.status ?? "missing",
      currentRuntimeSurface:
        rollbackPlan?.currentRuntimeSurface ?? checklist.baselineRoute.currentRuntimeSurface,
      currentPrimaryModel:
        rollbackPlan?.currentPrimaryModel ?? checklist.baselineRoute.primaryModel,
      currentFallbackModel:
        rollbackPlan?.currentFallbackModel ?? checklist.baselineRoute.fallbackModel,
      previousRouteOrConfigValue: rollbackPlan?.previousRouteOrConfigValue ?? null,
      rollbackCommand: rollbackPlan?.rollbackCommand ?? null,
      productionSmokePlan: rollbackPlan?.productionSmokePlan ?? null,
      proofArtifact: rollbackPlan
        ? `plans/VET-1563-${role}-model-rollback-plan.json`
        : null,
    },
    protectedClinicalProof: {
      required: true,
      files: [
        "src/lib/triage-engine.ts",
        "src/lib/clinical-matrix.ts",
        "src/app/api/ai/symptom-chat/route.ts",
        "src/lib/symptom-memory.ts",
      ],
      diffProofCommand:
        "git diff -- src/lib/triage-engine.ts src/lib/clinical-matrix.ts src/app/api/ai/symptom-chat/route.ts src/lib/symptom-memory.ts",
      status: protectedClinicalDiffProof?.status ?? "missing",
      attachedDiffProof: protectedClinicalDiffProof
        ? {
            path: "plans/VET-1563-protected-clinical-diff-proof.json",
            diffSha256: protectedClinicalDiffProof.diffSha256,
            diffLineCount: protectedClinicalDiffProof.diffLineCount,
            proof: protectedClinicalDiffProof.proof,
          }
        : null,
    },
    promotionDecision: {
      allowedByThisPacket: false,
      reason:
        "This packet is only a fillable evidence template. Runtime promotion remains blocked until every slot is completed, reviewed, and linked from a separate authorized promotion ticket.",
    },
    guardrails: checklist.goodhartGuard,
  };
}

const packet = buildPacket();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(packet, null, 2));
}
