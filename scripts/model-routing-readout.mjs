#!/usr/bin/env node
/**
 * Build the VET-1563 static model routing matrix.
 *
 * This is review-only documentation of current and candidate-evaluation routes.
 * It does not call providers and does not mutate runtime routing or env values.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const matrixOutPath = resolve(process.cwd(), "plans/VET-1563-model-routing-matrix.json");
const markdownOutPath = resolve(
  process.cwd(),
  "plans/VET-1563-model-routing-evaluation-matrix.md"
);

const matrix = [
  {
    role: "extraction",
    roleLabel: "Owner-language answer extraction",
    primaryModel: "current-runtime-extraction-route",
    fallbackModel: "deterministic extraction fallback",
    providers: ["current PawVital runtime provider chain"],
    timeoutMs: 8000,
    concurrencyLimit: 4,
    currentRuntimeSurface: "src/lib/symptom-chat/answer-extraction.ts",
    firstValidExperiment: "VET-1562 offline narrow-pack experiment only",
    promotionGate: "separate VET-1563 promotion ticket after scorecard, hashes, owner approval, and smoke",
  },
  {
    role: "phrasing",
    roleLabel: "Owner-facing follow-up phrasing",
    primaryModel: "current-runtime-phrasing-route",
    fallbackModel: "deterministic clinical question wording",
    providers: ["current PawVital runtime provider chain"],
    timeoutMs: 8000,
    concurrencyLimit: 4,
    currentRuntimeSurface: "src/lib/symptom-chat/question-phrasing.ts",
    firstValidExperiment: "review-only copy and safety eval",
    promotionGate: "separate promotion ticket with owner-facing claim review",
  },
  {
    role: "phrasing_verifier",
    roleLabel: "Question phrasing safety verifier",
    primaryModel: "current-runtime-verifier-route",
    fallbackModel: "deterministic required-question checks",
    providers: ["current PawVital runtime provider chain"],
    timeoutMs: 8000,
    concurrencyLimit: 4,
    currentRuntimeSurface: "src/lib/symptom-chat/final-safety-verifier.ts",
    firstValidExperiment: "review-only blocker catch-rate eval",
    promotionGate: "separate promotion ticket with blocker false-pass proof",
  },
  {
    role: "diagnosis",
    roleLabel: "Report narrative support",
    primaryModel: "current-runtime-report-route",
    fallbackModel: "deterministic clinical matrix report support",
    providers: ["current PawVital runtime provider chain"],
    timeoutMs: 12000,
    concurrencyLimit: 2,
    currentRuntimeSurface: "src/lib/symptom-chat/report-pipeline.ts",
    firstValidExperiment: "review-only narrative grounding eval",
    promotionGate: "separate promotion ticket; clinical matrix remains authority",
  },
  {
    role: "safety",
    roleLabel: "Unsafe reassurance and unsupported claim guard",
    primaryModel: "current-runtime-safety-route",
    fallbackModel: "deterministic safety copy guard",
    providers: ["current PawVital runtime provider chain"],
    timeoutMs: 8000,
    concurrencyLimit: 4,
    currentRuntimeSurface: "src/lib/symptom-chat/final-safety-verifier.ts",
    firstValidExperiment: "review-only unsafe-claim catch-rate eval",
    promotionGate: "separate promotion ticket with emergency no-downgrade proof",
  },
  {
    role: "vision_fast",
    roleLabel: "Fast image evidence assist",
    primaryModel: "current-runtime-vision-fast-route",
    fallbackModel: "text-only clinical triage",
    providers: ["current PawVital runtime provider chain"],
    timeoutMs: 10000,
    concurrencyLimit: 2,
    currentRuntimeSurface: "src/lib/nvidia-models.ts",
    firstValidExperiment: "research/review-only image evidence eval",
    promotionGate: "separate vision-sidecar promotion ticket; text gates remain authority",
  },
  {
    role: "vision_detailed",
    roleLabel: "Detailed image evidence assist",
    primaryModel: "current-runtime-vision-detailed-route",
    fallbackModel: "text-only clinical triage",
    providers: ["current PawVital runtime provider chain"],
    timeoutMs: 16000,
    concurrencyLimit: 1,
    currentRuntimeSurface: "src/lib/nvidia-models.ts",
    firstValidExperiment: "research/review-only image evidence eval",
    promotionGate: "separate vision-sidecar promotion ticket; text gates remain authority",
  },
  {
    role: "vision_deep",
    roleLabel: "Deep image evidence assist",
    primaryModel: "current-runtime-vision-deep-route",
    fallbackModel: "text-only clinical triage",
    providers: ["current PawVital runtime provider chain"],
    timeoutMs: 24000,
    concurrencyLimit: 1,
    currentRuntimeSurface: "src/lib/nvidia-models.ts",
    firstValidExperiment: "research/review-only image evidence eval",
    promotionGate: "separate vision-sidecar promotion ticket; text gates remain authority",
  },
];

const payload = {
  ticket: "VET-1563",
  mode: "review-only-routing-readout",
  generatedAt:
    process.env.MODEL_ROUTING_READOUT_GENERATED_AT ?? "2026-05-31T00:00:00.000Z",
  note:
    "Static routing readout only. It does not call providers, train models, mutate runtime routing, or change env values.",
  matrix,
  routes: matrix.map((route) => ({
    role: route.role,
    primaryModel: route.primaryModel,
    fallbackModel: route.fallbackModel,
    runtimeSurface: route.currentRuntimeSurface,
  })),
  guardrails: [
    "deterministic clinical logic remains authoritative",
    "no runtime NIM or provider route change in this ticket",
    "no model promotion without frozen output hashes, scorecard pass, owner approval, rollback, and production smoke",
  ],
};

function renderMarkdown() {
  const rows = matrix
    .map(
      (route) =>
        `| ${route.role} | ${route.primaryModel} | ${route.fallbackModel} | ${route.currentRuntimeSurface} | ${route.promotionGate} |`
    )
    .join("\n");
  return `# VET-1563 Model Routing Evaluation Matrix

Mode: ${payload.mode}

| Role | Current primary | Fallback | Runtime surface | Promotion gate |
|---|---|---|---|---|
${rows}

This artifact is review-only and does not authorize runtime routing changes.
`;
}

if (process.argv.includes("--write")) {
  writeFileSync(matrixOutPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(markdownOutPath, renderMarkdown());
  console.log(`Wrote ${matrixOutPath}`);
  console.log(`Wrote ${markdownOutPath}`);
} else {
  console.log(JSON.stringify(payload, null, 2));
}
