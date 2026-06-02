#!/usr/bin/env node
/**
 * Build the VET-1563 model promotion smoke runbook.
 *
 * This is review-only. It defines production-like smoke evidence required for
 * a future separate runtime promotion ticket. It does not call providers,
 * mutate routing, apply env changes, or write frozen output envelopes.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const outputCaptureRunbookPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-output-capture-runbook.json`
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
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-smoke-runbook.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function buildRunbook() {
  const captureRunbook = readJson(outputCaptureRunbookPath);
  const outputStatus = readJson(outputStatusPath);
  const rollbackPlan = readJson(rollbackPlanPath);
  const protectedClinicalDiffProof = readJson(protectedClinicalDiffProofPath);

  return {
    ticket: "VET-1563P",
    parentTicket: "VET-1563",
    role,
    mode: "review-only-model-promotion-smoke-runbook",
    generatedAt:
      process.env.MODEL_PROMOTION_SMOKE_RUNBOOK_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Runbook only. It defines production-like model route smoke evidence for a future authorized promotion; this command does not call providers, write env, or change routing.",
    runtimeChangeAllowedByThisArtifact: false,
    currentStatus: {
      readyForSmoke: false,
      reason:
        "Smoke execution remains blocked until frozen outputs, scorecard review, owner approval, and the separate promotion ticket are ready.",
      frozenOutputStatus: outputStatus.summary,
      protectedClinicalProofStatus: protectedClinicalDiffProof.status,
      rollbackPlanStatus: rollbackPlan.status,
    },
    inputArtifacts: {
      outputCaptureRunbook: {
        path: `plans/VET-1563-${role}-output-capture-runbook.json`,
        sha256: sha256(outputCaptureRunbookPath),
      },
      outputStatus: {
        path: `plans/VET-1563-${role}-frozen-output-status.json`,
        sha256: sha256(outputStatusPath),
      },
      rollbackPlan: {
        path: `plans/VET-1563-${role}-model-rollback-plan.json`,
        sha256: sha256(rollbackPlanPath),
      },
      protectedClinicalDiffProof: {
        path: "plans/VET-1563-protected-clinical-diff-proof.json",
        sha256: sha256(protectedClinicalDiffProofPath),
      },
    },
    smokeRunbook: [
      {
        step: "pre-smoke-freeze-check",
        command: "npm run models:frozen-output-status",
        requiredEvidence:
          "Artifact reports every validation and holdout case has schema-valid baseline and candidate hashes before runtime smoke starts.",
        mustNotDo: [
          "Do not rerun provider capture during smoke.",
          "Do not overwrite frozen validation or holdout output files.",
        ],
      },
      {
        step: "promotion-branch-diff-check",
        command:
          "git diff -- src/lib/model-router.ts src/lib/nvidia-models.ts src/lib/nvidia-generation.ts",
        requiredEvidence:
          "The separate promotion branch contains only the explicit model route/config diff approved by the owner.",
        mustNotDo: [
          "Do not include env secret edits.",
          "Do not include unrelated provider or narrow-pack wiring.",
        ],
      },
      {
        step: "protected-clinical-authority-check",
        command:
          "git diff -- src/lib/triage-engine.ts src/lib/clinical-matrix.ts src/app/api/ai/symptom-chat/route.ts src/lib/symptom-memory.ts",
        requiredEvidence:
          "Protected deterministic clinical files have no unauthorized diff, and model output cannot override clinical state fields.",
        mustNotDo: [
          "Do not move emergency escalation into model prompts.",
          "Do not weaken answered_questions, extracted_answers, or unresolved_question_ids.",
        ],
      },
      {
        step: "validation-route-smoke",
        command:
          "Run the promoted extraction route against validation cases from the frozen output capture runbook and compare structured extraction fields to the frozen candidate outputs.",
        requiredEvidence:
          "Validation route smoke matches the approved candidate behavior and preserves deterministic emergency state.",
        requiredInputIds:
          captureRunbook.captureSequence?.[0]?.steps?.flatMap(
            (step) => step.requiredOutputIds ?? []
          ) ?? [],
        mustNotDo: [
          "Do not use holdout cases to tune prompts or routing.",
          "Do not accept a smoke pass from raw text resemblance alone.",
        ],
      },
      {
        step: "rollback-rehearsal",
        command: rollbackPlan.rollbackCommand,
        requiredEvidence:
          "Rollback command and previous route/config value are documented and can restore the prior extraction route.",
        previousRouteOrConfigValue: rollbackPlan.previousRouteOrConfigValue,
        mustNotDo: [
          "Do not promote without a known previous route/config value.",
          "Do not skip post-rollback promotion preflight regeneration.",
        ],
      },
    ],
    evidencePacketTemplate: {
      requiredAttachments: [
        "frozen output status artifact after pre-smoke freeze check",
        "approved promotion branch route diff",
        "protected clinical no-diff proof",
        "validation route smoke transcript with case ids",
        "rollback rehearsal transcript or reviewer-signed dry-run proof",
      ],
      reviewer: null,
      completedAt: null,
    },
    guardrails: [
      "This runbook is not owner approval.",
      "This runbook is not runtime promotion authorization.",
      "Smoke cannot compensate for missing frozen outputs, failed scorecard, or missing owner approval.",
      "Holdout cases are verification-only and must not be used for tuning.",
      "Deterministic clinical logic remains authoritative over model output.",
    ],
  };
}

const runbook = buildRunbook();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(runbook, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(runbook, null, 2));
}
