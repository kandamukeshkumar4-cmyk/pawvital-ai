#!/usr/bin/env node
/**
 * Build the VET-1563 frozen output capture plan.
 *
 * This is a review-only bridge between the empty shadow-eval scaffold and a
 * populated scorecard. It defines where baseline/candidate outputs must be
 * frozen and hashed before human scoring. It does not call providers, train,
 * score, or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const scaffoldPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-shadow-eval-scaffold.json`
);
const experimentPath = resolve(
  process.cwd(),
  "plans/VET-1562-offline-experiment-package.json"
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-capture-plan.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifactPath(caseSourceId, variant) {
  return `artifacts/model-shadow-eval/${role}/${caseSourceId}/${variant}.json`;
}

function buildCaseCapture(evalCase, phase) {
  const baselineOutputPath = artifactPath(evalCase.caseSourceId, "baseline");
  const candidateOutputPath = artifactPath(evalCase.caseSourceId, "candidate");

  return {
    caseSourceId: evalCase.caseSourceId,
    split: evalCase.split,
    phase,
    inputSource: {
      path: evalCase.sourcePath,
      sha256: evalCase.sourceSha256,
      recordCount: evalCase.recordCount,
    },
    baseline: {
      model: evalCase.expectedEvidence.baselineModel,
      outputPath: baselineOutputPath,
      outputSha256: null,
    },
    candidate: {
      modelOrAdapter: evalCase.expectedEvidence.candidateModelOrAdapter,
      outputPath: candidateOutputPath,
      outputSha256: null,
    },
    scorecardPatch: {
      expectedEvidence: {
        observedOutputPath: candidateOutputPath,
        reviewer: null,
      },
      reviewerInstruction:
        "After outputs are frozen and hashed, score every dimension with evidence and mark each blocker observed=true/false.",
    },
    blockersUntilPopulated: [
      "baseline output hash missing",
      "candidate output hash missing",
      "reviewer missing",
      "dimension scores missing",
      "blocker observations missing",
    ],
  };
}

function buildPlan() {
  const scaffold = readJson(scaffoldPath);
  const experiment = readJson(experimentPath);

  if (scaffold.mode !== "review-only") {
    throw new Error("Shadow-eval scaffold must remain review-only.");
  }
  if (experiment.promotionGate?.runtimeChangeAllowedHere !== false) {
    throw new Error("Experiment package must not allow runtime changes.");
  }

  const validationCases = (scaffold.validationCases ?? []).map((evalCase) =>
    buildCaseCapture(evalCase, "validation-first")
  );
  const holdoutCases = (scaffold.holdoutCases ?? []).map((evalCase) =>
    buildCaseCapture(evalCase, "holdout-after-candidate-freeze")
  );

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only",
    generatedAt:
      process.env.MODEL_OUTPUT_CAPTURE_PLAN_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Frozen output capture plan only. It does not call providers, train models, score outputs, or mutate runtime routing.",
    inputArtifacts: {
      shadowEvalScaffold: {
        path: `plans/VET-1563-${role}-shadow-eval-scaffold.json`,
        sha256: sha256(scaffoldPath),
      },
      experimentPackage: {
        path: "plans/VET-1562-offline-experiment-package.json",
        sha256: sha256(experimentPath),
      },
    },
    baselineRoute: experiment.baselineRoute,
    capturePolicy: {
      validationBeforeHoldout: true,
      holdoutMayRunOnlyAfterCandidateFrozen: true,
      runtimeChangeAllowedHere: false,
      providerCallsAllowedByThisArtifact: false,
      outputHashRequired: true,
      reviewerRequiredBeforeScoring: true,
    },
    validationCases,
    holdoutCases,
    promotionDecision: {
      allowed: false,
      reason:
        "This plan only defines output capture paths. Promotion remains blocked until outputs are populated, hashes are recorded, human review is complete, scorecard thresholds pass, owner approval exists, and a separate promotion ticket authorizes runtime changes.",
    },
    nextCommands: [
      "npm run models:shadow-eval-scaffold",
      "npm run models:output-capture-plan",
      "populate artifacts/model-shadow-eval/<role>/<caseSourceId>/baseline.json and candidate.json in a separate review-only run",
      "record sha256 hashes in the populated scorecard",
      "npm run models:shadow-eval-score",
      "npm run models:promotion-checklist",
    ],
    goodhartGuard: [
      "Do not score holdout before candidate output is frozen.",
      "Do not overwrite frozen outputs after reviewing scores.",
      "Do not use holdout findings for prompt, adapter, or training iteration.",
      "Do not promote output-shape improvements that weaken clinical slot integrity.",
    ],
  };
}

const plan = buildPlan();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(plan, null, 2));
}
