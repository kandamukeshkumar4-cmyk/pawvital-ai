#!/usr/bin/env node
/**
 * Build the separate VET-1563P runtime promotion ticket draft.
 *
 * This is review-only. It creates the promotion-ticket payload that a future
 * authorized sync can import after evidence is populated. It does not call
 * providers, score outputs, train models, mutate runtime routing, or create a
 * live project-manager work item.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { repoRelativePath } from "./lib/artifact-paths.mjs";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const scorecardPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-shadow-eval-scorecard.json`
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
const promotionSmokeRunbookPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-smoke-runbook.json`
);
const candidateSelectionPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-candidate-selection-packet.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-runtime-promotion-ticket.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifact(path) {
  return {
    path: repoRelativePath(path),
    exists: existsSync(path),
    sha256: existsSync(path) ? sha256(path) : null,
  };
}

function buildTicket() {
  const scorecard = readJson(scorecardPath);
  const capturePlan = readJson(outputCapturePlanPath);
  const outputStatus = existsSync(outputStatusPath) ? readJson(outputStatusPath) : null;
  const rollbackPlan = existsSync(rollbackPlanPath) ? readJson(rollbackPlanPath) : null;
  const protectedClinicalDiffProof = existsSync(protectedClinicalDiffProofPath)
    ? readJson(protectedClinicalDiffProofPath)
    : null;
  const promotionSmokeRunbook = existsSync(promotionSmokeRunbookPath)
    ? readJson(promotionSmokeRunbookPath)
    : null;
  const candidateSelection = existsSync(candidateSelectionPath)
    ? readJson(candidateSelectionPath)
    : null;
  const cases = [
    ...(capturePlan.validationCases ?? []),
    ...(capturePlan.holdoutCases ?? []),
  ];
  const blockers = [
    ...(scorecard.validationAverage >= 4.2 ? [] : ["validation score below 4.2"]),
    ...(scorecard.holdoutAverage >= 4.2 ? [] : ["holdout score below 4.2"]),
    ...((scorecard.promotionDecision?.issues ?? []).length === 0
      ? []
      : ["scorecard contains unresolved issues"]),
    ...(outputStatus?.summary?.readyCaseCount === cases.length
      ? []
      : ["frozen baseline/candidate outputs and hashes are incomplete"]),
    ...(rollbackPlan?.status === "ready" ? [] : ["rollback plan missing or not ready"]),
    ...(protectedClinicalDiffProof?.status === "ready"
      ? []
      : ["protected clinical diff proof missing or not ready"]),
    ...(promotionSmokeRunbook?.mode === "review-only-model-promotion-smoke-runbook" &&
    promotionSmokeRunbook.runtimeChangeAllowedByThisArtifact === false
      ? []
      : ["promotion smoke runbook missing or not ready"]),
    ...(candidateSelection?.candidateIdentityResolved === true &&
    candidateSelection?.candidate?.modelOrAdapterId
      ? []
      : ["candidate model or adapter identity is not approved"]),
    "explicit owner approval artifact is missing",
  ];

  return {
    ticket: "VET-1563P",
    parentTicket: "VET-1563",
    role,
    type: "Task",
    mode: "review-only-promotion-ticket-draft",
    generatedAt:
      process.env.MODEL_PROMOTION_TICKET_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    title: `Promote ${role} model route after VET-1563 evidence passes`,
    priority: "P0",
    area: "Model routing / runtime promotion",
    goal:
      "Separate runtime promotion ticket draft for the extraction route. It remains blocked until scorecard, frozen outputs, owner approval, rollback, protected clinical proof, and production-like smoke evidence are complete.",
    dependencies: ["VET-1563", "VET-1562", "VET-1561"],
    liveProjectManagerSync: {
      ready: false,
      reason:
        "Draft exists locally, but live creation must wait for Azure credentials and completed promotion evidence.",
    },
    runtimeChangeAllowedByThisArtifact: false,
    readiness: {
      readyToOpenPromotionPr: blockers.length === 0,
      blockers,
    },
    acceptanceCriteria: [
      "Attach populated validation and holdout scorecard with weighted averages >= 4.2 and no unresolved issues.",
      "Attach frozen baseline and candidate output files with schema-valid hashes for every validation and holdout case.",
      "Attach explicit owner approval artifact referencing this ticket and the exact model route change.",
      "Attach approved candidate model or adapter identity with provider, artifact hash, and offline-eval evidence.",
      "Attach rollback plan and protected clinical diff proof.",
      "Run production-like smoke for extraction and prove deterministic clinical state fields remain authoritative.",
      "Do not edit runtime model routing in the review-only VET-1560/VET-1563 package.",
    ],
    verifier: [
      "npm run models:promotion-preflight",
      "npm run models:promotion-evidence-packet",
      "npm run models:frozen-output-status",
      "npm run models:promotion-smoke-runbook",
      "git diff -- src/lib/model-router.ts src/lib/nvidia-models.ts .env.example .env.local",
      "git diff -- src/lib/triage-engine.ts src/lib/clinical-matrix.ts src/app/api/ai/symptom-chat/route.ts src/lib/symptom-memory.ts",
    ],
    inputArtifacts: {
      scorecard: artifact(scorecardPath),
      outputCapturePlan: artifact(outputCapturePlanPath),
      outputStatus: artifact(outputStatusPath),
      rollbackPlan: artifact(rollbackPlanPath),
      protectedClinicalDiffProof: artifact(protectedClinicalDiffProofPath),
      promotionSmokeRunbook: artifact(promotionSmokeRunbookPath),
      candidateSelectionPacket: artifact(candidateSelectionPath),
    },
    routeContext: {
      runtimeSurface:
        rollbackPlan?.currentRuntimeSurface ?? "src/lib/model-router.ts",
      currentPrimaryModel: rollbackPlan?.currentPrimaryModel ?? null,
      currentFallbackModel: rollbackPlan?.currentFallbackModel ?? null,
      candidateSelectionStatus: candidateSelection?.status ?? "missing",
      candidateIdentityResolved: candidateSelection?.candidateIdentityResolved === true,
      candidateModel: candidateSelection?.candidate?.modelOrAdapterId ?? null,
    },
    guardrails: [
      "This draft ticket is not owner approval.",
      "This draft ticket is not runtime promotion authorization.",
      "Do not open a promotion PR while readyToOpenPromotionPr is false.",
      "Do not mutate protected clinical files as part of model promotion.",
    ],
  };
}

const ticket = buildTicket();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(ticket, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(ticket, null, 2));
}
