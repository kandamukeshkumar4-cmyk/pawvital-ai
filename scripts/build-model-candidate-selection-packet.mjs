#!/usr/bin/env node
/**
 * Build the VET-1563 candidate model selection packet.
 *
 * This is review-only. It defines the evidence required before replacing the
 * output-capture candidate placeholder with a real model or adapter identity.
 * It does not train, call providers, or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const experimentPath = resolve(
  process.cwd(),
  "plans/VET-1562-offline-experiment-package.json"
);
const routingPlanPath = resolve(
  process.cwd(),
  "plans/VET-1563-model-routing-evaluation-plan.json"
);
const routingMatrixPath = resolve(
  process.cwd(),
  "plans/VET-1563-model-routing-matrix.json"
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-candidate-selection-packet.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function buildPacket() {
  const experiment = readJson(experimentPath);
  const routingPlan = readJson(routingPlanPath);
  const routingMatrix = readJson(routingMatrixPath);
  const rolePlan = routingPlan.rolePlans.find((item) => item.role === role);
  const roleRoute = routingMatrix.matrix.find((item) => item.role === role);

  if (!rolePlan || !roleRoute) {
    throw new Error(`No model routing plan found for role ${role}.`);
  }

  const candidate = {
    modelOrAdapterId: null,
    provider: null,
    artifactType: null,
    artifactSha256: null,
    baseModel: experiment.proposedExperiment?.baseModel ?? null,
    tokenizer: experiment.proposedExperiment?.tokenizer ?? null,
    contextLength: experiment.proposedExperiment?.contextLength ?? null,
    approvedBy: null,
    approvedAt: null,
    approvalRecord: null,
    captureApproval: {
      scope: "validation-output-capture-only",
      approvedBy: null,
      approvedAt: null,
      approvalRecord: null,
      promotionApproval: false,
    },
  };
  const blockers = [
    "candidate model or adapter id missing",
    "candidate provider missing",
    "candidate artifact hash missing",
    "candidate validation-output-capture approval record missing",
    "offline training/eval artifact is not populated",
  ];

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only-candidate-selection-packet",
    generatedAt:
      process.env.MODEL_CANDIDATE_SELECTION_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Candidate selection packet only. It does not train, call providers, write output captures, or mutate runtime routing.",
    status: "blocked",
    candidateIdentityResolved: false,
    candidate,
    blockers,
    inputArtifacts: {
      experimentPackage: {
        path: "plans/VET-1562-offline-experiment-package.json",
        sha256: sha256(experimentPath),
      },
      routingEvaluationPlan: {
        path: "plans/VET-1563-model-routing-evaluation-plan.json",
        sha256: sha256(routingPlanPath),
      },
      routingMatrix: {
        path: "plans/VET-1563-model-routing-matrix.json",
        sha256: sha256(routingMatrixPath),
      },
    },
    baselineRoute: {
      primaryModel: roleRoute.primaryModel,
      fallbackModel: roleRoute.fallbackModel,
      providers: roleRoute.providers,
      runtimeSurface: roleRoute.currentRuntimeSurface,
    },
    requiredBeforeCandidateCapture: [
      "Record the candidate model or adapter id exactly.",
      "Record provider and provider credential group without storing secret values.",
      "Attach adapter/checkpoint/prompt-policy artifact hash or provider model id proof.",
      "Attach offline training/eval manifest when the candidate is a weight update.",
      "Attach scoped validation-output-capture approval for evaluating this candidate against the baseline.",
      "Keep holdout sources excluded from candidate iteration.",
    ],
    promotionThresholds: rolePlan.evaluation.promotionThresholds,
    guardrails: [
      "Do not infer candidate identity from the baseline model.",
      "Do not replace the capture-runbook placeholder until this packet is approved.",
      "Do not treat validation-output-capture approval as runtime promotion approval.",
      "Do not use holdout results to choose or tune the candidate.",
      "Do not mutate runtime model routing from this packet.",
      "Do not treat candidate selection as owner approval for promotion.",
    ],
  };
}

const packet = buildPacket();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(packet, null, 2));
}
