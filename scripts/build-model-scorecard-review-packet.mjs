#!/usr/bin/env node
/**
 * Build the VET-1563 extraction scorecard review packet.
 *
 * This is review-only. It does not score cases, call providers, train models,
 * reveal holdout outputs, or mutate runtime routing.
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
const capturePlanPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-capture-plan.json`
);
const outputStatusPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-status.json`
);
const candidateSelectionPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-candidate-selection-packet.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-scorecard-review-packet.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function buildCaseReview(evalCase, captureCase, statusCase, candidateIdentityResolved) {
  const outputsReady = Boolean(
    statusCase?.baseline?.schemaValid &&
      statusCase?.baseline?.sha256 &&
      statusCase?.candidate?.schemaValid &&
      statusCase?.candidate?.sha256
  );

  return {
    caseSourceId: evalCase.caseSourceId,
    split: evalCase.split,
    sourcePath: evalCase.sourcePath,
    sourceSha256: evalCase.sourceSha256,
    recordCount: evalCase.recordCount,
    baselineOutputPath: captureCase?.baseline?.outputPath ?? null,
    candidateOutputPath: captureCase?.candidate?.outputPath ?? null,
    baselineOutputReady: Boolean(statusCase?.baseline?.schemaValid && statusCase?.baseline?.sha256),
    candidateOutputReady: Boolean(statusCase?.candidate?.schemaValid && statusCase?.candidate?.sha256),
    baselineOutputBlocker: statusCase?.baseline?.blocker ?? null,
    candidateOutputBlocker: statusCase?.candidate?.blocker ?? null,
    candidateIdentityResolved,
    mayReviewNow:
      evalCase.split === "validation"
        ? outputsReady && candidateIdentityResolved
        : false,
    holdoutReleaseCondition:
      evalCase.split === "holdout"
        ? "Holdout may be reviewed only after validation candidate outputs are frozen, scored, and no further prompt/adapter/training iteration will use holdout findings."
        : null,
    scoringDimensions: Object.entries(evalCase.scores ?? {}).map(
      ([dimension, scorecard]) => ({
        dimension,
        weight: scorecard.weight,
        scoreRange: "0..5",
        requiredEvidence:
          "Cite concrete baseline vs candidate behavior, record ids or examples, and why the score is not inflated by output shape alone.",
      })
    ),
    blockingFindings: (evalCase.blockers ?? []).map((blocker) => ({
      blocker: blocker.blocker,
      requiredValue: false,
      evidenceRequired:
        "Set observed=true only with specific record/output evidence. Any observed blocker prevents promotion regardless of weighted score.",
    })),
    patchTarget: {
      scaffoldPath: `plans/VET-1563-${role}-shadow-eval-scaffold.json`,
      expectedEvidencePath: `${evalCase.split}Cases[caseSourceId=${evalCase.caseSourceId}].expectedEvidence`,
      scoresPath: `${evalCase.split}Cases[caseSourceId=${evalCase.caseSourceId}].scores`,
      blockersPath: `${evalCase.split}Cases[caseSourceId=${evalCase.caseSourceId}].blockers`,
    },
  };
}

function buildPacket() {
  const scaffold = readJson(scaffoldPath);
  const capturePlan = readJson(capturePlanPath);
  const outputStatus = readJson(outputStatusPath);
  const candidateSelection = readJson(candidateSelectionPath);
  const candidateIdentityResolved = candidateSelection.candidateIdentityResolved === true;
  const captureCases = [
    ...(capturePlan.validationCases ?? []),
    ...(capturePlan.holdoutCases ?? []),
  ];
  const statusCases = outputStatus.cases ?? [];
  const validationReviews = (scaffold.validationCases ?? []).map((evalCase) =>
    buildCaseReview(
      evalCase,
      captureCases.find((item) => item.caseSourceId === evalCase.caseSourceId),
      statusCases.find((item) => item.caseSourceId === evalCase.caseSourceId),
      candidateIdentityResolved
    )
  );
  const holdoutReviews = (scaffold.holdoutCases ?? []).map((evalCase) =>
    buildCaseReview(
      evalCase,
      captureCases.find((item) => item.caseSourceId === evalCase.caseSourceId),
      statusCases.find((item) => item.caseSourceId === evalCase.caseSourceId),
      candidateIdentityResolved
    )
  );
  const readinessBlockers = [
    ...(candidateIdentityResolved
      ? []
      : ["candidate identity is not resolved or approved"]),
    ...validationReviews.flatMap((item) =>
      item.mayReviewNow
        ? []
        : [
            `${item.caseSourceId}: baseline/candidate frozen outputs are not ready for validation review or candidate identity is unresolved`,
          ]
    ),
  ];

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only-scorecard-review-packet",
    generatedAt:
      process.env.MODEL_SCORECARD_REVIEW_PACKET_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Reviewer packet only. It prepares scoring instructions after frozen outputs exist; it does not score or authorize promotion.",
    inputArtifacts: {
      scaffold: {
        path: `plans/VET-1563-${role}-shadow-eval-scaffold.json`,
        sha256: sha256(scaffoldPath),
      },
      outputCapturePlan: {
        path: `plans/VET-1563-${role}-frozen-output-capture-plan.json`,
        sha256: sha256(capturePlanPath),
      },
      outputStatus: {
        path: `plans/VET-1563-${role}-frozen-output-status.json`,
        sha256: sha256(outputStatusPath),
      },
      candidateSelection: {
        path: `plans/VET-1563-${role}-candidate-selection-packet.json`,
        sha256: sha256(candidateSelectionPath),
      },
    },
    readiness: {
      validationCasesReadyToReview: validationReviews.filter((item) => item.mayReviewNow).length,
      validationCaseCount: validationReviews.length,
      holdoutCasesReadyToReview: 0,
      holdoutCaseCount: holdoutReviews.length,
      reviewerRequired: true,
      candidateIdentityResolved,
      readyForScoring:
        validationReviews.length > 0 &&
        validationReviews.every((item) => item.mayReviewNow) &&
        candidateIdentityResolved,
      blockers: readinessBlockers,
    },
    scoringPolicy: {
      weightedScoreMinimum: scaffold.thresholds?.weightedScoreMinimum ?? 4.2,
      ownerApprovalRequired: scaffold.thresholds?.ownerApprovalRequired === true,
      runtimeChangeAllowedHere: false,
      dimensionScoreRange: "0..5",
      requiredDimensionEvidence: true,
      noBlockingFindings: true,
      holdoutFindingsMayNotFeedIteration: true,
    },
    validationReviews,
    holdoutReviews,
    nextCommandsAfterReview: [
      "Patch the scaffold scores, evidence, expectedEvidence.observedOutputPath, and expectedEvidence.reviewer only after frozen outputs exist.",
      "Confirm the candidate-selection packet is resolved before scoring candidate outputs.",
      "npm run models:shadow-eval-score",
      "npm run models:promotion-preflight",
      "npm run models:promotion-evidence-packet",
    ],
    guardrails: [
      "Do not review holdout until validation candidate outputs are frozen and no further iteration will use holdout findings.",
      "Do not score from model self-report or training loss.",
      "Do not let JSON-shape validity compensate for clinical slot corruption.",
      "Do not mutate runtime routing or provider env while filling this packet.",
    ],
  };
}

const packet = buildPacket();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(packet, null, 2));
}
