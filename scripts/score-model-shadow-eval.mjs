#!/usr/bin/env node
/**
 * Score a populated VET-1563 model shadow-eval scaffold.
 *
 * This is offline and review-only: it reads scorecards, computes weighted
 * scores, enforces blockers and thresholds, and writes a decision artifact. It
 * does not call providers, train, or mutate model routing.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
const inputPath = resolve(
  process.cwd(),
  inputArg?.slice("--input=".length) ??
    `plans/VET-1563-${role}-shadow-eval-scaffold.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-shadow-eval-scorecard.json`
);
const outputStatusPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-status.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validateScore(score, caseId, dimension) {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return `${caseId}:${dimension} missing numeric score`;
  }
  if (score < 0 || score > 5) {
    return `${caseId}:${dimension} score must be between 0 and 5`;
  }
  return null;
}

function frozenOutputIssues(evalCase, frozenCase) {
  const issues = [];
  if (!frozenCase) {
    return [`${evalCase.caseSourceId}:missing frozen output status`];
  }
  if (frozenCase.split !== evalCase.split) {
    issues.push(`${evalCase.caseSourceId}:frozen output split mismatch`);
  }
  if (frozenCase.inputSource?.path !== evalCase.sourcePath) {
    issues.push(`${evalCase.caseSourceId}:frozen output source path mismatch`);
  }
  for (const side of ["baseline", "candidate"]) {
    const output = frozenCase[side];
    if (!output?.schemaValid || !output?.sha256) {
      issues.push(`${evalCase.caseSourceId}:${side} frozen output is not schema-valid and hashed`);
    }
  }
  return issues;
}

function scoreCase(evalCase, frozenCase) {
  const issues = [];
  let weighted = 0;
  let weightSum = 0;

  for (const [dimension, scorecard] of Object.entries(evalCase.scores ?? {})) {
    const issue = validateScore(scorecard.score, evalCase.caseSourceId, dimension);
    if (issue) issues.push(issue);
    if (!scorecard.evidence) {
      issues.push(`${evalCase.caseSourceId}:${dimension} missing evidence`);
    }
    if (typeof scorecard.weight === "number") {
      weightSum += scorecard.weight;
      if (typeof scorecard.score === "number") {
        weighted += scorecard.score * scorecard.weight;
      }
    }
  }

  if (Math.abs(weightSum - 1) > 0.00001) {
    issues.push(`${evalCase.caseSourceId}:dimension weights must sum to 1`);
  }

  const observedBlockers = (evalCase.blockers ?? []).filter(
    (blocker) => blocker.observed === true
  );
  for (const blocker of observedBlockers) {
    issues.push(`${evalCase.caseSourceId}:blocking finding: ${blocker.blocker}`);
  }

  if (!evalCase.expectedEvidence?.observedOutputPath) {
    issues.push(`${evalCase.caseSourceId}:missing observed output path`);
  }
  if (!evalCase.expectedEvidence?.reviewer) {
    issues.push(`${evalCase.caseSourceId}:missing reviewer`);
  }
  issues.push(...frozenOutputIssues(evalCase, frozenCase));

  return {
    caseSourceId: evalCase.caseSourceId,
    split: evalCase.split,
    weightedScore: Number(weighted.toFixed(3)),
    observedBlockers: observedBlockers.map((blocker) => blocker.blocker),
    issues,
    pass: issues.length === 0,
  };
}

function average(cases) {
  if (cases.length === 0) return null;
  const sum = cases.reduce((total, item) => total + item.weightedScore, 0);
  return Number((sum / cases.length).toFixed(3));
}

function buildScorecard(scaffold, outputStatus) {
  const statusCases = outputStatus.cases ?? [];
  const validation = (scaffold.validationCases ?? []).map((evalCase) =>
    scoreCase(
      evalCase,
      statusCases.find((item) => item.caseSourceId === evalCase.caseSourceId)
    )
  );
  const holdout = (scaffold.holdoutCases ?? []).map((evalCase) =>
    scoreCase(
      evalCase,
      statusCases.find((item) => item.caseSourceId === evalCase.caseSourceId)
    )
  );
  const allCases = [...validation, ...holdout];
  const threshold = scaffold.thresholds?.weightedScoreMinimum ?? 4.2;
  const validationAverage = average(validation);
  const holdoutAverage = average(holdout);
  const issues = allCases.flatMap((item) => item.issues);

  if (validation.length === 0) issues.push("missing validation cases");
  if (holdout.length === 0) issues.push("missing holdout cases");

  if (validationAverage !== null && validationAverage < threshold) {
    issues.push(`validation average ${validationAverage} below threshold ${threshold}`);
  }
  if (holdoutAverage !== null && holdoutAverage < threshold) {
    issues.push(`holdout average ${holdoutAverage} below threshold ${threshold}`);
  }
  if (scaffold.thresholds?.runtimeChangeAllowedHere !== false) {
    issues.push("scaffold must not allow runtime change");
  }

  const offlineScorePass = issues.length === 0;

  return {
    ticket: scaffold.ticket,
    role: scaffold.role,
    mode: "review-only",
    generatedAt: "2026-05-31T00:00:00.000Z",
    note:
      "Offline scorecard only. It does not call providers, train models, or mutate runtime routing.",
    input: inputPath,
    inputArtifacts: {
      scaffold: {
        path: inputPath,
        sha256: sha256(inputPath),
      },
      frozenOutputStatus: {
        path: `plans/VET-1563-${role}-frozen-output-status.json`,
        sha256: sha256(outputStatusPath),
        readyForHumanReview: outputStatus.summary?.readyForHumanReview ?? false,
        readyCaseCount: outputStatus.summary?.readyCaseCount ?? 0,
      },
    },
    validationAverage,
    holdoutAverage,
    cases: allCases,
    promotionDecision: {
      offlineScorePass,
      runtimePromotionAllowed: false,
      allowedByThisArtifact: false,
      ownerApprovalRequired: scaffold.thresholds?.ownerApprovalRequired !== false,
      separatePromotionTicketRequired: true,
      reason: offlineScorePass
        ? "Offline score gates passed, but this scorecard cannot authorize runtime promotion. Owner approval and a separate promotion ticket are still required."
        : "Promotion remains blocked until score issues are resolved, owner approval exists, and a separate promotion ticket authorizes runtime change.",
      issues,
    },
  };
}

const scorecard = buildScorecard(readJson(inputPath), readJson(outputStatusPath));

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(scorecard, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(scorecard, null, 2));
}
