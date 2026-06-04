#!/usr/bin/env node
/**
 * Build frozen-output capture templates for future model/NIM review runs.
 *
 * This writes template envelopes only. It does not call providers, generate
 * outputs, train models, score outputs, or write the actual baseline/candidate
 * frozen output files.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const capturePlanPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-capture-plan.json`
);
const candidateSelectionPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-candidate-selection-packet.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-templates.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readInputSource(path) {
  const text = readFileSync(path, "utf8").trim();
  if (path.endsWith(".jsonl")) {
    return {
      cases: text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    };
  }
  return JSON.parse(text);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function inputIdsFor(evalCase) {
  const inputSource = readInputSource(resolve(process.cwd(), evalCase.inputSource.path));
  const ids = Array.isArray(inputSource.cases)
    ? inputSource.cases.map((item) => item.id)
    : Array.isArray(inputSource.caseIds)
      ? inputSource.caseIds
    : Object.keys(inputSource.case_id_ranges ?? {});
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new Error(
      `Input source ${evalCase.inputSource.path} must expose string case ids or manifest shard ids.`
    );
  }
  if (ids.length !== evalCase.inputSource.recordCount) {
    throw new Error(
      `Input source ${evalCase.inputSource.path} has ${ids.length} ids but capture plan expects ${evalCase.inputSource.recordCount}.`
    );
  }
  return ids;
}

function outputTemplate(evalCase, variant, candidateSelection) {
  const captureApproval = candidateSelection?.candidate?.captureApproval ?? {};
  const candidateReady =
    candidateSelection?.candidateIdentityResolved === true &&
    captureApproval.scope === "validation-output-capture-only" &&
    captureApproval.promotionApproval === false &&
    Boolean(captureApproval.approvedBy) &&
    Boolean(captureApproval.approvedAt) &&
    Boolean(captureApproval.approvalRecord);
  const model =
    variant === "baseline"
      ? evalCase.baseline.model
      : candidateReady
        ? candidateSelection.candidate.modelOrAdapterId
        : "<candidate-model-or-adapter>";
  const outputPath =
    variant === "baseline"
      ? evalCase.baseline.outputPath
      : evalCase.candidate.outputPath;

  return {
    variant,
    outputPath,
    captureGate:
      variant === "baseline"
        ? {
            status: "ready-for-authorized-baseline-capture",
            requiredApprovalScope: null,
            blockers: [],
          }
        : {
            status: candidateReady ? "ready-for-authorized-candidate-capture" : "blocked",
            requiredApprovalScope: "validation-output-capture-only",
            candidateSelectionArtifact: `plans/VET-1563-${role}-candidate-selection-packet.json`,
            candidateIdentityResolved:
              candidateSelection?.candidateIdentityResolved === true,
            captureApprovalComplete: candidateReady,
            blockers: candidateReady
              ? []
              : [
                  "candidate identity is not resolved",
                  "scoped validation-output-capture approval is not complete",
                ],
          },
    envelope: {
      role,
      caseSourceId: evalCase.caseSourceId,
      split: evalCase.split,
      model,
      capturedAt: "<ISO-8601 timestamp from capture run>",
      outputs: inputIdsFor(evalCase).map((inputId) => ({
        inputId,
        rawOutput: "<verbatim model output JSON/text>",
      })),
    },
  };
}

function buildTemplates() {
  const capturePlan = readJson(capturePlanPath);
  const candidateSelection = readJson(candidateSelectionPath);
  if (capturePlan.capturePolicy?.providerCallsAllowedByThisArtifact !== false) {
    throw new Error("Template builder must remain provider-call free.");
  }
  if (capturePlan.capturePolicy?.runtimeChangeAllowedHere !== false) {
    throw new Error("Template builder must not allow runtime routing changes.");
  }

  const cases = [
    ...(capturePlan.validationCases ?? []),
    ...(capturePlan.holdoutCases ?? []),
  ].map((evalCase) => ({
    caseSourceId: evalCase.caseSourceId,
    split: evalCase.split,
    phase: evalCase.phase,
    inputSource: evalCase.inputSource,
    templates: [
      outputTemplate(evalCase, "baseline", candidateSelection),
      outputTemplate(evalCase, "candidate", candidateSelection),
    ],
  }));

  return {
    ticket: "VET-1563",
    role,
    mode: "read-only-frozen-output-templates",
    generatedAt:
      process.env.MODEL_FROZEN_OUTPUT_TEMPLATES_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Template artifact only. Copy an envelope into the matching output path during a separate authorized capture run; this artifact does not populate frozen outputs.",
    inputArtifacts: {
      outputCapturePlan: {
        path: `plans/VET-1563-${role}-frozen-output-capture-plan.json`,
        sha256: sha256(capturePlanPath),
      },
      candidateSelectionPacket: {
        path: `plans/VET-1563-${role}-candidate-selection-packet.json`,
        sha256: sha256(candidateSelectionPath),
      },
    },
    capturePrerequisites: {
      candidateCaptureApprovalScope: "validation-output-capture-only",
      candidateIdentityResolved:
        candidateSelection.candidateIdentityResolved === true,
      candidateCaptureApprovalComplete:
        candidateSelection.candidateIdentityResolved === true &&
        candidateSelection.candidate?.captureApproval?.scope ===
          "validation-output-capture-only" &&
        candidateSelection.candidate?.captureApproval?.promotionApproval === false &&
        Boolean(candidateSelection.candidate?.captureApproval?.approvedBy) &&
        Boolean(candidateSelection.candidate?.captureApproval?.approvedAt) &&
        Boolean(candidateSelection.candidate?.captureApproval?.approvalRecord),
      candidateTemplateStatus:
        candidateSelection.candidateIdentityResolved === true
          ? "candidate identity present"
          : "candidate templates remain placeholders until candidate-selection approval is complete",
    },
    envelopeSchema: {
      requiredFields: ["role", "caseSourceId", "split", "model", "capturedAt", "outputs"],
      outputItemRequiredFields: ["inputId", "rawOutput"],
      recordCountRule:
        "outputs length must exactly match the inputSource.recordCount for the case.",
    },
    cases,
    nextCommands: [
      "Run an authorized review-only capture outside this template builder.",
      "Complete candidate-selection scoped validation-output-capture approval before filling candidate envelopes.",
      "Write each populated envelope to its baseline.json or candidate.json outputPath.",
      "Run npm run models:frozen-output-status to validate schema and hashes.",
      "Only after validation outputs are frozen may holdout capture run.",
    ],
    guardrails: [
      "Do not write actual frozen outputs from this template command.",
      "Do not fill candidate templates while candidate identity or scoped validation-output-capture approval is unresolved.",
      "Do not use holdout templates until validation candidate outputs are frozen.",
      "Do not tune prompts, adapters, or training from holdout outputs.",
      "Do not mutate runtime model routing from this artifact.",
    ],
  };
}

const templates = buildTemplates();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(templates, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(templates, null, 2));
}
