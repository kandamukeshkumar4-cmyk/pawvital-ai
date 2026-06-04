#!/usr/bin/env node
/**
 * Build the VET-1563 model promotion readiness preflight.
 *
 * This is a read-only summary for the next agent. It does not call providers,
 * train models, score new outputs, or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const checklistPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-checklist.json`
);
const scorecardPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-shadow-eval-scorecard.json`
);
const outputCapturePlanPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-capture-plan.json`
);
const outputStatusPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-status.json`
);
const outputTemplatesPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-frozen-output-templates.json`
);
const promotionTicketPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-runtime-promotion-ticket.json`
);
const ownerApprovalRequestPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-owner-approval-request.json`
);
const promotionSmokeRunbookPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-smoke-runbook.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-readiness-preflight.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifact(path) {
  return {
    path,
    exists: existsSync(path),
    sha256: existsSync(path) ? sha256(path) : null,
  };
}

function downstreamArtifact(path) {
  return {
    path,
    exists: existsSync(path),
    sha256: null,
    sha256OmittedReason:
      "downstream artifact is generated from this preflight; hashing it here would make regeneration non-idempotent",
  };
}

function collectOutputHashStatus(capturePlan, outputStatus) {
  if (!capturePlan) {
    return {
      totalCases: 0,
      readyCases: 0,
      baselineHashes: 0,
      candidateHashes: 0,
      invalidJsonOutputs: 0,
      invalidSchemaOutputs: 0,
      missing: ["output capture plan missing"],
    };
  }

  const cases = [
    ...(capturePlan.validationCases ?? []),
    ...(capturePlan.holdoutCases ?? []),
  ];
  const statusCases = outputStatus?.cases ?? [];
  const statusSummary = outputStatus?.summary ?? {};
  const baselineHashes = cases.filter((item) => {
    const statusCase = statusCases.find(
      (candidate) => candidate.caseSourceId === item.caseSourceId
    );
    return Boolean(statusCase?.baseline?.schemaValid === true && statusCase?.baseline?.sha256);
  }).length;
  const candidateHashes = cases.filter((item) => {
    const statusCase = statusCases.find(
      (candidate) => candidate.caseSourceId === item.caseSourceId
    );
    return Boolean(statusCase?.candidate?.schemaValid === true && statusCase?.candidate?.sha256);
  }).length;
  const missing = [];

  if (baselineHashes < cases.length) {
    missing.push(`${cases.length - baselineHashes} baseline output hash(es) missing`);
  }
  if (candidateHashes < cases.length) {
    missing.push(`${cases.length - candidateHashes} candidate output hash(es) missing`);
  }
  if ((statusSummary.invalidJsonOutputCount ?? 0) > 0) {
    missing.push(`${statusSummary.invalidJsonOutputCount} output file(s) are not parseable JSON`);
  }
  if ((statusSummary.invalidSchemaOutputCount ?? 0) > 0) {
    missing.push(`${statusSummary.invalidSchemaOutputCount} output file schema validation error(s)`);
  }
  if (!outputStatus) {
    missing.push("frozen output status artifact missing");
  }

  return {
    totalCases: cases.length,
    readyCases: statusSummary.readyCaseCount ?? 0,
    baselineHashes,
    candidateHashes,
    invalidJsonOutputs: statusSummary.invalidJsonOutputCount ?? 0,
    invalidSchemaOutputs: statusSummary.invalidSchemaOutputCount ?? 0,
    missing,
  };
}

function collectOutputGateStatus(capturePlan, outputStatus, outputTemplates) {
  const cases = [
    ...(capturePlan?.validationCases ?? []),
    ...(capturePlan?.holdoutCases ?? []),
  ];
  const statusCases = outputStatus?.cases ?? [];
  const templateCases = outputTemplates?.cases ?? [];
  const candidateGates = cases.map((item) => {
    const statusCase = statusCases.find(
      (candidate) => candidate.caseSourceId === item.caseSourceId
    );
    const templateCase = templateCases.find(
      (candidate) => candidate.caseSourceId === item.caseSourceId
    );
    const candidateTemplate = templateCase?.templates?.find(
      (template) => template.variant === "candidate"
    );
    const captureGate = candidateTemplate?.captureGate ?? null;
    return {
      caseSourceId: item.caseSourceId,
      split: item.split,
      candidateOutputPath: item.candidate.outputPath,
      candidateOutputSha256:
        statusCase?.candidate?.schemaValid === true
          ? statusCase?.candidate?.sha256 ?? null
          : null,
      candidateOutputContentSha256: statusCase?.candidate?.contentSha256 ?? null,
      candidateSchemaValid: statusCase?.candidate?.schemaValid ?? false,
      candidateBlocker: statusCase?.candidate?.blocker ?? "output status missing",
      captureGate,
    };
  });

  return {
    candidateGateBlockedCount: candidateGates.filter(
      (item) => item.captureGate?.status === "blocked"
    ).length,
    candidateContentHashWithoutEvidenceHashCount: candidateGates.filter(
      (item) => item.candidateOutputContentSha256 && !item.candidateOutputSha256
    ).length,
    candidateGates,
  };
}

function buildPreflight() {
  const checklist = readJson(checklistPath);
  const scorecard = readJson(scorecardPath);
  const outputCapturePlan = existsSync(outputCapturePlanPath)
    ? readJson(outputCapturePlanPath)
    : null;
  const outputStatus = existsSync(outputStatusPath) ? readJson(outputStatusPath) : null;
  const outputTemplates = existsSync(outputTemplatesPath)
    ? readJson(outputTemplatesPath)
    : null;
  const outputHashStatus = collectOutputHashStatus(outputCapturePlan, outputStatus);
  const outputGateStatus = collectOutputGateStatus(
    outputCapturePlan,
    outputStatus,
    outputTemplates
  );
  const requiredEvidence = checklist.requiredEvidence ?? [];
  const blockedEvidence = requiredEvidence.filter((item) => item.status !== "ready");
  const readyEvidence = requiredEvidence.filter((item) => item.status === "ready");
  const evidenceBlockers = blockedEvidence.flatMap((item) =>
    (item.blockers ?? []).map((blocker) => `${item.id}: ${blocker}`)
  );
  const outputBlockers = outputHashStatus.missing.map((item) => `output-capture: ${item}`);
  const blockers = [...evidenceBlockers, ...outputBlockers];
  const threshold = checklist.promotionThresholds?.weightedScoreMinimum ?? 4.2;

  return {
    ticket: "VET-1563",
    role,
    mode: "read-only-preflight",
    generatedAt:
      process.env.MODEL_PROMOTION_PREFLIGHT_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    summary: {
      readyForPromotionTicket: blockers.length === 0,
      readyEvidenceCount: readyEvidence.length,
      blockedEvidenceCount: blockedEvidence.length,
      weightedScoreMinimum: threshold,
      validationAverage: scorecard.validationAverage ?? null,
      holdoutAverage: scorecard.holdoutAverage ?? null,
      outputCases: outputHashStatus.totalCases,
      outputReadyCases: outputHashStatus.readyCases,
      baselineOutputHashes: outputHashStatus.baselineHashes,
      candidateOutputHashes: outputHashStatus.candidateHashes,
      invalidJsonOutputs: outputHashStatus.invalidJsonOutputs,
      invalidSchemaOutputs: outputHashStatus.invalidSchemaOutputs,
      candidateGateBlockedCount: outputGateStatus.candidateGateBlockedCount,
      candidateContentHashWithoutEvidenceHashCount:
        outputGateStatus.candidateContentHashWithoutEvidenceHashCount,
    },
    inputArtifacts: {
      checklist: artifact(checklistPath),
      scorecard: artifact(scorecardPath),
      outputCapturePlan: artifact(outputCapturePlanPath),
      outputTemplates: artifact(outputTemplatesPath),
      outputStatus: artifact(outputStatusPath),
      promotionTicket: artifact(promotionTicketPath),
      ownerApprovalRequest: downstreamArtifact(ownerApprovalRequestPath),
      promotionSmokeRunbook: artifact(promotionSmokeRunbookPath),
    },
    requiredEvidence: requiredEvidence.map((item) => ({
      id: item.id,
      status: item.status,
      blockers: item.blockers ?? [],
    })),
    outputGateStatus,
    blockers,
    nextActions: blockedEvidence.map((item) => ({
      evidenceId: item.id,
      action: item.evidence,
      blockers: item.blockers ?? [],
    })),
    guardrails: [
      "Do not mutate runtime model routing from this preflight.",
      "Do not open a promotion PR until readyForPromotionTicket is true.",
      "Do not treat validation-only score as promotion evidence.",
      "Do not train on or tune against holdout cases.",
      "Keep protected clinical files authoritative unless a separate clinical ticket authorizes changes.",
    ],
  };
}

const preflight = buildPreflight();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(preflight, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(preflight, null, 2));
}
