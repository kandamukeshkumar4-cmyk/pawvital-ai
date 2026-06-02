#!/usr/bin/env node
/**
 * Build a review-only runbook for authorized frozen-output capture.
 *
 * This does not call providers, generate outputs, train models, score outputs,
 * or mutate runtime routing. It converts the frozen-output templates and status
 * artifact into a step-by-step capture plan for a separately authorized agent.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const templatesPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-templates.json`
);
const statusPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-status.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-output-capture-runbook.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function outputStep(evalCase, template) {
  return {
    caseSourceId: evalCase.caseSourceId,
    split: evalCase.split,
    phase: evalCase.phase,
    variant: template.variant,
    inputSource: evalCase.inputSource,
    outputPath: template.outputPath,
    model: template.envelope.model,
    envelopeRequiredFields: ["role", "caseSourceId", "split", "model", "capturedAt", "outputs"],
    requiredOutputIds: template.envelope.outputs.map((item) => item.inputId),
    commandContract: {
      stdin: evalCase.inputSource.path,
      stdout: template.outputPath,
      outputFormat: "Populate the template envelope with verbatim rawOutput strings.",
      mustNotChange: [
        "role",
        "caseSourceId",
        "split",
        "model",
        "outputs[].inputId",
      ],
    },
  };
}

function buildRunbook() {
  const templates = readJson(templatesPath);
  const status = readJson(statusPath);

  if (templates.mode !== "read-only-frozen-output-templates") {
    throw new Error("Output capture runbook requires frozen output templates.");
  }
  if (status.mode !== "read-only-frozen-output-status") {
    throw new Error("Output capture runbook requires frozen output status.");
  }

  const validationCases = templates.cases.filter((item) => item.split === "validation");
  const holdoutCases = templates.cases.filter((item) => item.split === "holdout");
  const validationSteps = validationCases.flatMap((item) =>
    item.templates.map((template) => outputStep(item, template))
  );
  const holdoutSteps = holdoutCases.flatMap((item) =>
    item.templates.map((template) => outputStep(item, template))
  );

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only-output-capture-runbook",
    generatedAt:
      process.env.MODEL_OUTPUT_CAPTURE_RUNBOOK_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Runbook only. It defines how an authorized capture should populate frozen outputs; this command does not call providers or write output envelopes.",
    authorizationRequired: {
      candidateCaptureApprovalRequired: true,
      providerCredentialsRequired: true,
      runtimeRoutingChangeAllowed: false,
      requiredApprovalRecord:
        "Record scoped validation-output-capture approval in plans/VET-1563-extraction-candidate-selection-packet.json before provider capture.",
      downstreamPromotionApprovalRequired:
        "Runtime promotion owner approval remains blocked until frozen outputs, scoring, and review evidence exist.",
    },
    inputArtifacts: {
      templates: {
        path: `plans/VET-1563-${role}-frozen-output-templates.json`,
        sha256: sha256(templatesPath),
      },
      status: {
        path: `plans/VET-1563-${role}-frozen-output-status.json`,
        sha256: sha256(statusPath),
      },
    },
    currentStatus: status.summary,
    captureSequence: [
      {
        id: "validation-baseline-and-candidate",
        allowedNow: true,
        reason:
          "Validation capture may run first after scoped validation-output-capture approval, approved candidate identity, and provider credentials.",
        steps: validationSteps,
      },
      {
        id: "freeze-validation",
        allowedNow: validationSteps.length > 0,
        reason:
          "After validation outputs are written, run npm run models:frozen-output-status and do not overwrite valid hashes.",
        steps: [
          {
            command: "npm run models:frozen-output-status",
            expectedEffect:
              "records schema-valid sha256 values for validation baseline/candidate outputs",
          },
        ],
      },
      {
        id: "holdout-baseline-and-candidate",
        allowedNow: status.summary?.readyCaseCount >= validationCases.length,
        reason:
          "Holdout capture stays gated until validation outputs are schema-valid and frozen.",
        steps: holdoutSteps,
      },
    ],
    nextCommandsAfterCapture: [
      "npm run models:frozen-output-status",
      "npm run models:scorecard-review-packet",
      "Fill reviewer scores/evidence in the scorecard review packet.",
      "npm run models:shadow-eval-score",
      "npm run models:promotion-preflight",
    ],
    blockers: [
      ...(status.blockers ?? []),
      "scoped validation-output-capture approval missing",
      "approved candidate identity missing",
      "provider capture credentials and command are not supplied by this runbook",
    ],
    guardrails: [
      "Do not capture holdout outputs before validation outputs are frozen.",
      "Do not tune prompts, adapters, or training from holdout outputs.",
      "Do not mutate runtime NIM, provider env, model routing, or protected clinical files.",
      "Do not overwrite a schema-valid frozen output after human review begins.",
      "Do not treat validation-output-capture approval as runtime promotion approval.",
      "Do not treat this runbook as owner approval or promotion evidence.",
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
