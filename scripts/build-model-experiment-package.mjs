#!/usr/bin/env node
/**
 * Build the VET-1562 offline experiment package.
 *
 * This packages review-only narrow-model experiment prerequisites. It does not
 * train, call providers, capture outputs, or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "plans/VET-1561-model-dataset-manifest.json");
const routingMatrixPath = resolve(process.cwd(), "plans/VET-1563-model-routing-matrix.json");
const routingPlanPath = resolve(
  process.cwd(),
  "plans/VET-1563-model-routing-evaluation-plan.json"
);
const outPath = resolve(process.cwd(), "plans/VET-1562-offline-experiment-package.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

const manifest = readJson(manifestPath);
const routingMatrix = readJson(routingMatrixPath);
const routingPlan = readJson(routingPlanPath);
const extractionRoute = routingMatrix.matrix.find((item) => item.role === "extraction");
const extractionPlan = routingPlan.rolePlans.find((item) => item.role === "extraction");

if (!extractionRoute || !extractionPlan) {
  throw new Error("Offline experiment package requires an extraction routing route and plan.");
}

const packagePayload = {
  ticket: "VET-1562",
  mode: "review-only-offline-experiment-package",
  generatedAt:
    process.env.MODEL_EXPERIMENT_PACKAGE_GENERATED_AT ?? "2026-05-31T00:00:00.000Z",
  note:
    "Offline experiment package only. It does not train, call providers, capture outputs, or mutate runtime routing.",
  inputArtifacts: {
    datasetManifest: artifact(
      manifestPath,
      "plans/VET-1561-model-dataset-manifest.json"
    ),
    routingMatrix: artifact(
      routingMatrixPath,
      "plans/VET-1563-model-routing-matrix.json"
    ),
    routingEvaluationPlan: artifact(
      routingPlanPath,
      "plans/VET-1563-model-routing-evaluation-plan.json"
    ),
  },
  baselineRoute: {
    role: extractionRoute.role,
    primaryModel: extractionRoute.primaryModel,
    fallbackModel: extractionRoute.fallbackModel,
    providers: extractionRoute.providers,
    currentRuntimeSurface: extractionRoute.currentRuntimeSurface,
  },
  proposedExperiment: {
    role: "extraction",
    baseModel: "unresolved-review-only-candidate",
    tokenizer: null,
    contextLength: null,
    trainingArtifactPath: null,
    trainingArtifactSha256: null,
    adapterOrCheckpointId: null,
  },
  datasetSummary: {
    sourceCount: manifest.sources.length,
    validationSourceCount: manifest.sources.filter((item) => item.split === "validation").length,
    holdoutSourceCount: manifest.sources.filter((item) => item.split === "holdout").length,
    totalRecordCount: manifest.sources.reduce((sum, item) => sum + item.recordCount, 0),
  },
  promotionGate: {
    runtimeChangeAllowedHere: false,
    ownerApprovalRequired: true,
    frozenOutputHashesRequired: true,
    scorecardRequired: true,
    rollbackRequired: true,
    productionSmokeRequired: true,
    thresholds: extractionPlan.evaluation.promotionThresholds,
  },
  blockers: [
    "candidate model or adapter identity is unresolved",
    "offline training/eval artifact is not populated",
    "frozen baseline and candidate outputs are not captured",
    "human scorecard is not populated",
    "owner approval is not granted",
  ],
  guardrails: [
    "Do not use holdout cases for candidate iteration.",
    "Do not infer a runtime model change from this package.",
    "Do not mutate provider env or model router files.",
  ],
};

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(packagePayload, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(packagePayload, null, 2));
}
