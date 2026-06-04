#!/usr/bin/env node
/**
 * Build the VET-1563 model promotion checklist.
 *
 * This is a review-only gate artifact. It turns the offline scorecard and
 * experiment package into a concrete list of evidence needed before any
 * runtime model routing, NIM, adapter, or checkpoint promotion can happen.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const scorecardPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-shadow-eval-scorecard.json`
);
const experimentPath = resolve(
  process.cwd(),
  "plans/VET-1562-offline-experiment-package.json"
);
const evaluationPlanPath = resolve(
  process.cwd(),
  "plans/VET-1563-model-routing-evaluation-plan.json"
);
const outputCapturePlanPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-capture-plan.json`
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
const promotionSmokeRunbookPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-smoke-runbook.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-checklist.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifact(path) {
  return {
    path,
    exists: existsSync(path),
    sha256: existsSync(path) ? sha256(path) : null,
  };
}

function collectScorecardBlockers(scorecard, threshold) {
  const blockers = [];
  if (scorecard.mode !== "review-only") {
    blockers.push("scorecard must be review-only");
  }
  if (scorecard.promotionDecision?.allowed === true) {
    blockers.push("scorecard must not authorize runtime promotion by itself");
  }
  if ((scorecard.validationAverage ?? 0) < threshold) {
    blockers.push(
      `validation average ${scorecard.validationAverage ?? "missing"} below threshold ${threshold}`
    );
  }
  if ((scorecard.holdoutAverage ?? 0) < threshold) {
    blockers.push(
      `holdout average ${scorecard.holdoutAverage ?? "missing"} below threshold ${threshold}`
    );
  }
  if ((scorecard.promotionDecision?.issues ?? []).length > 0) {
    blockers.push("scorecard still contains unresolved issues");
  }
  return blockers;
}

function collectOutputStatusBlockers(outputCapturePlan, outputStatus) {
  if (!outputCapturePlan) {
    return {
      status: "blocked",
      evidence:
        "Baseline and candidate outputs must be frozen with paths and hashes for every validation and holdout case.",
      blockers: ["current scaffold/scorecard does not encode output hashes"],
    };
  }

  const cases = [
    ...(outputCapturePlan.validationCases ?? []),
    ...(outputCapturePlan.holdoutCases ?? []),
  ];
  if (!outputStatus) {
    return {
      status: "blocked",
      evidence: `capture plan exists with ${outputCapturePlan.validationCases.length} validation and ${outputCapturePlan.holdoutCases.length} holdout cases, but frozen output status is missing`,
      blockers: ["frozen output status artifact missing"],
    };
  }

  const summary = outputStatus.summary ?? {};
  const blockers = [];
  if (summary.readyCaseCount !== cases.length) {
    blockers.push(`${cases.length - (summary.readyCaseCount ?? 0)} case(s) not ready for human review`);
  }
  if ((summary.missingBaselineOutputCount ?? 0) > 0) {
    blockers.push(`${summary.missingBaselineOutputCount} baseline output file(s) missing`);
  }
  if ((summary.missingCandidateOutputCount ?? 0) > 0) {
    blockers.push(`${summary.missingCandidateOutputCount} candidate output file(s) missing`);
  }
  if ((summary.invalidJsonOutputCount ?? 0) > 0) {
    blockers.push(`${summary.invalidJsonOutputCount} output file(s) are not parseable JSON`);
  }
  if ((summary.invalidSchemaOutputCount ?? 0) > 0) {
    blockers.push(`${summary.invalidSchemaOutputCount} output file schema validation error(s)`);
  }

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    evidence: `status ready=${summary.readyCaseCount ?? 0}/${cases.length}, missing baseline=${summary.missingBaselineOutputCount ?? 0}, missing candidate=${summary.missingCandidateOutputCount ?? 0}, invalid JSON=${summary.invalidJsonOutputCount ?? 0}, invalid schema=${summary.invalidSchemaOutputCount ?? 0}`,
    blockers,
  };
}

function buildChecklist() {
  const scorecard = readJson(scorecardPath);
  const experiment = readJson(experimentPath);
  const evaluationPlan = readJson(evaluationPlanPath);
  const outputCapturePlan = existsSync(outputCapturePlanPath)
    ? readJson(outputCapturePlanPath)
    : null;
  const outputStatus = existsSync(outputStatusPath)
    ? readJson(outputStatusPath)
    : null;
  const rollbackPlan = existsSync(rollbackPlanPath) ? readJson(rollbackPlanPath) : null;
  const protectedClinicalDiffProof = existsSync(protectedClinicalDiffProofPath)
    ? readJson(protectedClinicalDiffProofPath)
    : null;
  const promotionTicket = existsSync(promotionTicketPath)
    ? readJson(promotionTicketPath)
    : null;
  const promotionSmokeRunbook = existsSync(promotionSmokeRunbookPath)
    ? readJson(promotionSmokeRunbookPath)
    : null;
  const rolePlan = evaluationPlan.rolePlans.find((candidate) => candidate.role === role);
  if (!rolePlan) {
    throw new Error(`No evaluation role plan found for ${role}.`);
  }

  const threshold =
    rolePlan.evaluation?.promotionThresholds?.weightedScoreMinimum ?? 4.2;
  const scorecardBlockers = collectScorecardBlockers(scorecard, threshold);
  const outputStatusEvidence = collectOutputStatusBlockers(outputCapturePlan, outputStatus);

  const requiredEvidence = [
    {
      id: "scorecard-populated",
      status: scorecardBlockers.length === 0 ? "ready" : "blocked",
      evidence: `validation=${scorecard.validationAverage}, holdout=${scorecard.holdoutAverage}, threshold=${threshold}`,
      blockers: scorecardBlockers,
    },
    {
      id: "frozen-observed-outputs",
      status: outputStatusEvidence.status,
      evidence: outputStatusEvidence.evidence,
      blockers: outputStatusEvidence.blockers,
    },
    {
      id: "owner-approval",
      status: "blocked",
      evidence: "Owner approval must be recorded outside the generated artifact.",
      blockers: ["explicit owner approval missing"],
    },
    {
      id: "rollback-plan",
      status: rollbackPlan?.status === "ready" ? "ready" : "blocked",
      evidence:
        rollbackPlan?.status === "ready"
          ? `Rollback plan ready for ${rollbackPlan.currentRuntimeSurface}.`
          : "Promotion PR must include exact previous route/config value, rollback command, and production smoke plan.",
      blockers:
        rollbackPlan?.status === "ready"
          ? []
          : [rollbackPlan?.blocker ?? "rollback plan missing"],
    },
    {
      id: "promotion-smoke-runbook",
      status:
        promotionSmokeRunbook?.mode ===
          "review-only-model-promotion-smoke-runbook" &&
        promotionSmokeRunbook.runtimeChangeAllowedByThisArtifact === false &&
        promotionSmokeRunbook.currentStatus?.readyForSmoke === true
          ? "ready"
          : "blocked",
      evidence:
        promotionSmokeRunbook?.mode ===
        "review-only-model-promotion-smoke-runbook"
          ? `Promotion smoke runbook defines ${promotionSmokeRunbook.smokeRunbook?.length ?? 0} evidence steps and ${promotionSmokeRunbook.evidencePacketTemplate?.requiredAttachments?.length ?? 0} required attachments; readyForSmoke=${promotionSmokeRunbook.currentStatus?.readyForSmoke === true}.`
          : "Promotion PR must include a production-like smoke runbook before owner approval.",
      blockers:
        promotionSmokeRunbook?.mode ===
          "review-only-model-promotion-smoke-runbook" &&
        promotionSmokeRunbook.runtimeChangeAllowedByThisArtifact === false &&
        promotionSmokeRunbook.currentStatus?.readyForSmoke === true
          ? []
          : [
              promotionSmokeRunbook?.currentStatus?.reason ??
                "promotion smoke runbook missing or not ready",
            ],
    },
    {
      id: "separate-promotion-ticket",
      status:
        promotionTicket?.mode === "review-only-promotion-ticket-draft" &&
        promotionTicket.runtimeChangeAllowedByThisArtifact === false &&
        promotionTicket.readiness?.readyToOpenPromotionPr === true
          ? "ready"
          : "blocked",
      evidence:
        promotionTicket?.mode === "review-only-promotion-ticket-draft"
          ? `Separate promotion ticket draft ${promotionTicket.ticket} exists; readyToOpenPromotionPr=${promotionTicket.readiness?.readyToOpenPromotionPr === true}.`
          : "Runtime routing changes must happen in a separate promotion ticket/PR after this review-only package passes.",
      blockers:
        promotionTicket?.mode === "review-only-promotion-ticket-draft" &&
        promotionTicket.runtimeChangeAllowedByThisArtifact === false &&
        promotionTicket.readiness?.readyToOpenPromotionPr === true
          ? []
          : promotionTicket?.mode === "review-only-promotion-ticket-draft"
            ? (promotionTicket.readiness?.blockers ?? [
                "promotion ticket draft is not ready to open",
              ])
            : ["promotion ticket not linked"],
    },
    {
      id: "protected-clinical-no-diff",
      status:
        protectedClinicalDiffProof?.status === "ready" ? "ready" : "blocked",
      evidence:
        protectedClinicalDiffProof?.status === "ready"
          ? protectedClinicalDiffProof.proof
          : "Promotion PR must show no unauthorized diffs in deterministic clinical logic files.",
      blockers:
        protectedClinicalDiffProof?.status === "ready"
          ? []
          : [
              protectedClinicalDiffProof?.blocker ??
                "protected-file diff proof not attached",
            ],
    },
    {
      id: "runtime-routing-no-diff-here",
      status:
        experiment.promotionGate?.runtimeChangeAllowedHere === false
          ? "ready"
          : "blocked",
      evidence:
        "Current VET-1560/VET-1563 work remains review-only and cannot mutate runtime model routing.",
      blockers:
        experiment.promotionGate?.runtimeChangeAllowedHere === false
          ? []
          : ["experiment package allows runtime change"],
    },
  ];

  const blockers = requiredEvidence.flatMap((item) =>
    item.blockers.map((blocker) => `${item.id}: ${blocker}`)
  );

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only",
    generatedAt:
      process.env.MODEL_PROMOTION_CHECKLIST_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Promotion checklist only. It does not call providers, train models, or mutate runtime routing.",
    inputArtifacts: {
      scorecard: artifact(scorecardPath),
      experimentPackage: artifact(experimentPath),
      evaluationPlan: artifact(evaluationPlanPath),
      outputCapturePlan: artifact(outputCapturePlanPath),
      outputStatus: artifact(outputStatusPath),
      rollbackPlan: artifact(rollbackPlanPath),
      protectedClinicalDiffProof: artifact(protectedClinicalDiffProofPath),
      promotionSmokeRunbook: artifact(promotionSmokeRunbookPath),
      promotionTicket: artifact(promotionTicketPath),
    },
    baselineRoute: experiment.baselineRoute,
    promotionThresholds: rolePlan.evaluation.promotionThresholds,
    requiredEvidence,
    promotionDecision: {
      allowed: false,
      reason:
        "Runtime promotion is blocked until all checklist evidence is ready, owner approval is recorded, and a separate promotion ticket authorizes the route change.",
      blockers,
    },
    goodhartGuard: [
      "Do not promote from training loss alone.",
      "Do not promote from validation-only score.",
      "Do not train on or tune against holdout cases.",
      "Do not improve JSON validity while weakening emergency escalation or clinical correctness.",
      "Do not let model output override deterministic clinical state fields.",
    ],
    nextPromotionTicketTemplate: {
      title: `Promote ${role} model route only after VET-1563 checklist passes`,
      mustAttach: [
        "populated scorecard artifact hash",
        "frozen baseline and candidate output hashes",
        "owner approval",
        "rollback plan",
        "protected clinical diff proof",
        "production-like smoke plan",
      ],
    },
  };
}

const checklist = buildChecklist();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(checklist, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(checklist, null, 2));
}
