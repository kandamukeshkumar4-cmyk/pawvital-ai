#!/usr/bin/env node
/**
 * Build a read-only status artifact for frozen model outputs.
 *
 * This checks the capture plan's expected baseline/candidate output files,
 * computes hashes for files that already exist, and records missing/invalid
 * output blockers. It does not call providers, generate outputs, train models,
 * score outputs, or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const capturePlanPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-capture-plan.json`
);
const templatesPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-templates.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-status.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function expectedInputIdsFor(expected) {
  const inputSourcePath = resolve(process.cwd(), expected.inputSource.path);
  if (extname(inputSourcePath) === ".jsonl") {
    const lines = readFileSync(inputSourcePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    const ids = lines.map((line) => JSON.parse(line).id);
    return ids.every((id) => typeof id === "string") ? ids : null;
  }

  const inputSource = readJson(inputSourcePath);
  const ids = Array.isArray(inputSource.cases)
    ? inputSource.cases.map((item) => item.id)
    : Object.keys(inputSource.case_id_ranges ?? {});
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return null;
  }
  return ids;
}

function validateFrozenOutputEnvelope(parsed, expected) {
  const errors = [];
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return ["output root must be an object"];
  }
  if (parsed.role !== role) {
    errors.push(`role must be ${role}`);
  }
  if (parsed.caseSourceId !== expected.caseSourceId) {
    errors.push(`caseSourceId must be ${expected.caseSourceId}`);
  }
  if (parsed.split !== expected.split) {
    errors.push(`split must be ${expected.split}`);
  }
  if (typeof parsed.model !== "string" || parsed.model.length === 0) {
    errors.push("model must be a non-empty string");
  }
  if (typeof parsed.capturedAt !== "string" || Number.isNaN(Date.parse(parsed.capturedAt))) {
    errors.push("capturedAt must be an ISO-like date string");
  }
  if (!Array.isArray(parsed.outputs)) {
    errors.push("outputs must be an array");
  } else {
    if (parsed.outputs.length !== expected.inputSource.recordCount) {
      errors.push(`outputs length must match input record count ${expected.inputSource.recordCount}`);
    }
    const expectedInputIds = expectedInputIdsFor(expected);
    if (!Array.isArray(expectedInputIds) || expectedInputIds.some((id) => typeof id !== "string")) {
      errors.push(`input source ${expected.inputSource.path} must expose case ids or manifest shard ids`);
    } else {
      const observedInputIds = parsed.outputs.map((item) => item?.inputId);
      const missingInputIds = expectedInputIds.filter((id) => !observedInputIds.includes(id));
      const unexpectedInputIds = observedInputIds.filter((id) => !expectedInputIds.includes(id));
      if (missingInputIds.length > 0) {
        errors.push(`outputs missing inputId(s): ${missingInputIds.join(", ")}`);
      }
      if (unexpectedInputIds.length > 0) {
        errors.push(`outputs include unexpected inputId(s): ${unexpectedInputIds.join(", ")}`);
      }
    }
    const malformedIndex = parsed.outputs.findIndex(
      (item) =>
        !item ||
        typeof item !== "object" ||
        typeof item.inputId !== "string" ||
        typeof item.rawOutput !== "string"
    );
    if (malformedIndex >= 0) {
      errors.push(`outputs[${malformedIndex}] must include string inputId and rawOutput`);
    }
  }
  return errors;
}

function inspectJsonOutput(relativePath, expected, captureGate = null) {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    return {
      path: relativePath,
      exists: false,
      sha256: null,
      parseableJson: false,
      schemaValid: false,
      schemaErrors: [],
      recordCount: null,
      blocker: "output file missing",
    };
  }

  try {
    const parsed = readJson(absolutePath);
    const gateErrors =
      captureGate?.status === "blocked"
        ? [
            `capture gate blocked: ${(captureGate.blockers ?? []).join("; ")}`,
          ]
        : [];
    const schemaErrors = [
      ...validateFrozenOutputEnvelope(parsed, expected),
      ...gateErrors,
    ];
    const schemaValid = schemaErrors.length === 0;
    return {
      path: relativePath,
      exists: true,
      sha256: schemaValid ? sha256(absolutePath) : null,
      contentSha256: sha256(absolutePath),
      parseableJson: true,
      schemaValid,
      schemaErrors,
      recordCount: Array.isArray(parsed.outputs) ? parsed.outputs.length : null,
      blocker: schemaValid ? null : "output file schema invalid",
    };
  } catch {
    return {
      path: relativePath,
      exists: true,
      sha256: null,
      contentSha256: sha256(absolutePath),
      parseableJson: false,
      schemaValid: false,
      schemaErrors: [],
      recordCount: null,
      blocker: "output file is not parseable JSON",
    };
  }
}

function inspectCase(item, templateCase) {
  const baselineTemplate = templateCase?.templates?.find(
    (template) => template.variant === "baseline"
  );
  const candidateTemplate = templateCase?.templates?.find(
    (template) => template.variant === "candidate"
  );
  const baseline = inspectJsonOutput(
    item.baseline.outputPath,
    item,
    baselineTemplate?.captureGate
  );
  const candidate = inspectJsonOutput(
    item.candidate.outputPath,
    item,
    candidateTemplate?.captureGate
  );
  const blockers = [
    baseline.blocker ? `baseline ${baseline.blocker}` : null,
    candidate.blocker ? `candidate ${candidate.blocker}` : null,
  ].filter(Boolean);

  return {
    caseSourceId: item.caseSourceId,
    split: item.split,
    phase: item.phase,
    inputSource: item.inputSource,
    baseline,
    candidate,
    readyForReview: blockers.length === 0,
    blockers,
  };
}

function buildStatus() {
  const capturePlan = readJson(capturePlanPath);
  const templates = readJson(templatesPath);
  if (capturePlan.capturePolicy?.providerCallsAllowedByThisArtifact !== false) {
    throw new Error("Frozen output status requires provider calls to remain disabled.");
  }
  if (capturePlan.capturePolicy?.runtimeChangeAllowedHere !== false) {
    throw new Error("Frozen output status requires runtime routing changes to remain disabled.");
  }

  const cases = [
    ...(capturePlan.validationCases ?? []),
    ...(capturePlan.holdoutCases ?? []),
  ].map((item) =>
    inspectCase(
      item,
      (templates.cases ?? []).find(
        (templateCase) => templateCase.caseSourceId === item.caseSourceId
      )
    )
  );
  const readyCases = cases.filter((item) => item.readyForReview);
  const missingBaseline = cases.filter((item) => !item.baseline.exists).length;
  const missingCandidate = cases.filter((item) => !item.candidate.exists).length;
  const invalidJson = cases.flatMap((item) =>
    [item.baseline, item.candidate].filter(
      (output) => output.exists && !output.parseableJson
    )
  ).length;
  const invalidSchema = cases.flatMap((item) =>
    [item.baseline, item.candidate].filter(
      (output) => output.exists && output.parseableJson && !output.schemaValid
    )
  ).length;

  return {
    ticket: "VET-1563",
    role,
    mode: "read-only-frozen-output-status",
    generatedAt:
      process.env.MODEL_FROZEN_OUTPUT_STATUS_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Read-only frozen output status. It checks expected output files and hashes only; it does not call providers, train models, score outputs, or mutate runtime routing.",
    inputArtifacts: {
      outputCapturePlan: {
        path: `plans/VET-1563-${role}-frozen-output-capture-plan.json`,
        sha256: sha256(capturePlanPath),
      },
      outputTemplates: {
        path: `plans/VET-1563-${role}-frozen-output-templates.json`,
        sha256: sha256(templatesPath),
      },
    },
    summary: {
      readyForHumanReview: cases.length > 0 && readyCases.length === cases.length,
      caseCount: cases.length,
      readyCaseCount: readyCases.length,
      missingBaselineOutputCount: missingBaseline,
      missingCandidateOutputCount: missingCandidate,
      invalidJsonOutputCount: invalidJson,
      invalidSchemaOutputCount: invalidSchema,
    },
    cases,
    blockers: cases.flatMap((item) =>
      item.blockers.map((blocker) => `${item.caseSourceId}: ${blocker}`)
    ),
    nextActions: [
      "Populate each missing baseline.json and candidate.json from a separate authorized review-only capture run.",
      "Resolve candidate template capture gates before candidate output hashes can count.",
      "Do not run holdout capture until validation candidate outputs are frozen.",
      "Rerun npm run models:frozen-output-status after output files are written.",
      "Use the recorded sha256 values to update the scorecard evidence before human scoring.",
    ],
    guardrails: [
      "Do not generate model outputs from this status command.",
      "Do not count candidate output hashes while candidate identity or scoped validation-output-capture approval is unresolved.",
      "Do not overwrite frozen outputs after review begins.",
      "Do not use holdout results for prompt, adapter, or training iteration.",
      "Do not mutate runtime NIM, provider env, or model routing from this artifact.",
    ],
  };
}

const status = buildStatus();

if (process.argv.includes("--write")) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(status, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(status, null, 2));
}
