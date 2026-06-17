#!/usr/bin/env node
/**
 * Build a review-only shadow evaluation scaffold for a model role.
 *
 * This creates case-level scorecards from the VET-1561 dataset manifest and
 * VET-1563 evaluation plan. It intentionally has no observed model outputs,
 * no provider calls, no training, and no runtime routing mutation.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const datasetManifestPath = resolve(
  process.cwd(),
  "plans/VET-1561-model-dataset-manifest.json"
);
const routingEvalPlanPath = resolve(
  process.cwd(),
  "plans/VET-1563-model-routing-evaluation-plan.json"
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-shadow-eval-scaffold.json`
);

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function pickEvaluationSources(manifest, rolePlan) {
  const validation = manifest.sources.filter(
    (source) =>
      source.split === "validation" &&
      (rolePlan.evaluation.requiredCases.mustIncludeOwnerLanguageVariants
        ? source.containsOwnerLanguage
        : true)
  );
  const holdout = manifest.sources.filter((source) => source.split === "holdout");
  return { validation, holdout };
}

function buildScoreTemplate(dimensions) {
  return Object.fromEntries(
    dimensions.map((dimension) => [
      dimension.name,
      {
        score: null,
        weight: dimension.weight,
        evidence: null,
      },
    ])
  );
}

function buildCase(source, rolePlan, split) {
  return {
    caseSourceId: source.id,
    split,
    sourcePath: source.path,
    sourceSha256: source.sha256,
    recordCount: source.recordCount,
    containsOwnerLanguage: source.containsOwnerLanguage,
    containsClinicalLabels: source.containsClinicalLabels,
    expectedEvidence: {
      inputSource: source.id,
      baselineModel: rolePlan.baseline.primaryModel,
      candidateModelOrAdapter: null,
      observedOutputPath: null,
      reviewer: null,
    },
    scores: buildScoreTemplate(rolePlan.evaluation.dimensions),
    blockers: rolePlan.evaluation.blockers.map((blocker) => ({
      blocker,
      observed: null,
      evidence: null,
    })),
    verdict: "not_run",
  };
}

function buildScaffold() {
  const manifest = readJson(datasetManifestPath);
  const evaluationPlan = readJson(routingEvalPlanPath);
  const rolePlan = evaluationPlan.rolePlans.find((candidate) => candidate.role === role);

  if (!rolePlan) {
    throw new Error(`No evaluation plan exists for role: ${role}`);
  }

  const { validation, holdout } = pickEvaluationSources(manifest, rolePlan);
  if (validation.length === 0) {
    throw new Error(`No validation sources available for role: ${role}`);
  }
  if (holdout.length === 0) {
    throw new Error(`No holdout sources available for role: ${role}`);
  }

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only",
    generatedAt: "2026-05-31T00:00:00.000Z",
    note:
      "Shadow-eval scaffold only. It has no observed model outputs, does not call providers, does not train, and does not mutate runtime routing.",
    inputs: {
      datasetManifest: {
        path: "plans/VET-1561-model-dataset-manifest.json",
        sha256: sha256File(datasetManifestPath),
      },
      routingEvaluationPlan: {
        path: "plans/VET-1563-model-routing-evaluation-plan.json",
        sha256: sha256File(routingEvalPlanPath),
      },
    },
    baseline: rolePlan.baseline,
    thresholds: rolePlan.evaluation.promotionThresholds,
    requiredCases: rolePlan.evaluation.requiredCases,
    validationCases: validation.map((source) => buildCase(source, rolePlan, "validation")),
    holdoutCases: holdout.map((source) => buildCase(source, rolePlan, "holdout")),
    promotionStatus: {
      allowed: false,
      reason:
        "No observed baseline/candidate outputs, no human scoring, no holdout verdict, and no owner approval are present.",
    },
    goodhartGuards: [
      "do not score holdout until candidate is frozen",
      "do not reuse holdout findings for prompt, adapter, or training iteration",
      "do not promote from weighted score if any blocker is observed",
      "do not optimize JSON shape while reducing clinical slot integrity",
    ],
  };
}

const scaffold = buildScaffold();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(scaffold, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(scaffold, null, 2));
}
