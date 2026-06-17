#!/usr/bin/env node
/**
 * Build the VET-1561 review-only model dataset manifest.
 *
 * This records local benchmark inputs for later shadow evaluation. It does not
 * train, call providers, score outputs, or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve(process.cwd(), "plans/VET-1561-model-dataset-manifest.json");

const SOURCE_DEFS = [
  {
    id: "dog-triage-gold-v1-validation",
    split: "validation",
    path: "data/benchmarks/dog-triage/gold-v1-enriched.jsonl",
    containsOwnerLanguage: true,
    containsClinicalLabels: true,
  },
  {
    id: "dog-triage-sample-cases-validation",
    split: "validation",
    path: "data/benchmarks/dog-triage/sample-cases.json",
    containsOwnerLanguage: true,
    containsClinicalLabels: true,
  },
  {
    id: "dog-triage-wave3-freeze-holdout",
    split: "holdout",
    path: "data/benchmarks/dog-triage/wave3-freeze-manifest.json",
    containsOwnerLanguage: true,
    containsClinicalLabels: true,
  },
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function recordCount(absolutePath) {
  const text = readFileSync(absolutePath, "utf8").trim();
  if (!text) return 0;
  if (absolutePath.endsWith(".jsonl")) return text.split(/\r?\n/).filter(Boolean).length;
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed.length;
  if (Array.isArray(parsed.caseIds)) return parsed.caseIds.length;
  if (Array.isArray(parsed.cases)) return parsed.cases.length;
  for (const value of Object.values(parsed)) {
    if (Array.isArray(value)) return value.length;
  }
  return 1;
}

function source(def) {
  const absolutePath = resolve(process.cwd(), def.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing dataset source: ${def.path}`);
  }
  return {
    ...def,
    sha256: sha256(absolutePath),
    recordCount: recordCount(absolutePath),
  };
}

const manifest = {
  ticket: "VET-1561",
  mode: "review-only-dataset-manifest",
  generatedAt:
    process.env.MODEL_DATASET_MANIFEST_GENERATED_AT ?? "2026-05-31T00:00:00.000Z",
  note:
    "Dataset manifest only. It records local benchmark inputs and does not train, call providers, or mutate runtime routing.",
  sources: SOURCE_DEFS.map(source),
  holdoutPolicy: {
    holdoutMayBeScoredOnlyAfterCandidateFrozen: true,
    holdoutMayNotBeUsedForPromptOrAdapterIteration: true,
  },
  guardrails: [
    "Do not use holdout sources to choose or tune the candidate.",
    "Do not infer promotion readiness from this manifest alone.",
    "Do not mutate protected clinical files from this artifact.",
  ],
};

if (!manifest.sources.some((item) => item.split === "validation")) {
  throw new Error("Dataset manifest must include validation sources.");
}
if (!manifest.sources.some((item) => item.split === "holdout")) {
  throw new Error("Dataset manifest must include holdout sources.");
}

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(manifest, null, 2));
}
