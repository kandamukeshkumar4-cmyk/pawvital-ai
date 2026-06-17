#!/usr/bin/env node
/**
 * Build the VET-1563 owner approval request packet.
 *
 * This is review-only. It creates an explicit approval form/packet for a
 * future human decision. It does not grant approval.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const promotionTicketPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-runtime-promotion-ticket.json`
);
const evidencePacketPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-readiness-preflight.json`
);
const promotionEvidencePacketPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-evidence-packet.json`
);
const promotionSmokeRunbookPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-promotion-smoke-runbook.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-owner-approval-request.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function cyclicArtifactReference(path) {
  return {
    path,
    sha256: null,
    sha256OmittedReason:
      "promotion evidence packet reads this owner approval request; hashing it here would make regeneration non-idempotent",
  };
}

function buildApprovalRequest() {
  const promotionTicket = readJson(promotionTicketPath);
  const preflight = readJson(evidencePacketPath);
  const promotionEvidencePacket = readJson(promotionEvidencePacketPath);
  const promotionSmokeRunbook = readJson(promotionSmokeRunbookPath);
  const approvalBlockers = [
    ...(promotionTicket.readiness?.readyToOpenPromotionPr === true
      ? []
      : (promotionTicket.readiness?.blockers ?? ["promotion ticket is not ready"])),
    ...(preflight.summary?.readyForPromotionTicket === true
      ? []
      : (preflight.blockers ?? ["promotion preflight is not ready"])),
    ...(promotionEvidencePacket.frozenOutputStatus?.readyForHumanReview === true
      ? []
      : ["frozen output status is not ready for human review"]),
    ...(promotionSmokeRunbook.currentStatus?.readyForSmoke === true
      ? []
      : ["promotion smoke runbook is not ready for execution"]),
  ];
  const approvalRequestReady = approvalBlockers.length === 0;

  return {
    ticket: "VET-1563",
    promotionTicket: promotionTicket.ticket,
    role,
    mode: "review-only-owner-approval-request",
    generatedAt:
      process.env.MODEL_OWNER_APPROVAL_REQUEST_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    status: approvalRequestReady
      ? "ready-for-owner-decision"
      : "blocked-before-owner-approval",
    approvalRequestReady,
    approvalGranted: false,
    decision: {
      approver: null,
      approvedAt: null,
      approvalRecord: null,
      decisionNotes: null,
    },
    requestedDecision:
      "Approve or reject a future extraction model runtime promotion only after all attached evidence is populated and reviewed.",
    approvalBlockers,
    evidenceRequiredBeforeApproval: [
      "Promotion preflight reports readyForPromotionTicket=true.",
      "Promotion preflight reports candidateGateBlockedCount=0 and no diagnostic candidate content hashes without evidence hashes.",
      "Frozen output status reports every validation and holdout case ready for human review.",
      "Evidence packet has populated scorecard, output hashes, reviewer, rollback, and protected clinical proof.",
      "Promotion ticket draft reports readyToOpenPromotionPr=true.",
      "Production-like smoke plan is attached for the proposed route change.",
    ],
    currentBlockingSummary: {
      promotionTicketReady: promotionTicket.readiness.readyToOpenPromotionPr,
      promotionTicketBlockers: promotionTicket.readiness.blockers,
      preflightReady: preflight.summary.readyForPromotionTicket,
      preflightBlockers: preflight.blockers,
      preflightOutputGateStatus: {
        candidateGateBlockedCount:
          preflight.summary?.candidateGateBlockedCount ?? null,
        candidateContentHashWithoutEvidenceHashCount:
          preflight.summary?.candidateContentHashWithoutEvidenceHashCount ?? null,
        candidateGates: preflight.outputGateStatus?.candidateGates ?? [],
      },
      frozenOutputStatus: promotionEvidencePacket.frozenOutputStatus,
      promotionSmokeRunbook: {
        readyForSmoke: promotionSmokeRunbook.currentStatus.readyForSmoke,
        evidenceStepCount: promotionSmokeRunbook.smokeRunbook.length,
        requiredAttachmentCount:
          promotionSmokeRunbook.evidencePacketTemplate.requiredAttachments.length,
      },
      evidencePacketBlockers: promotionEvidencePacket.readiness.blockers,
    },
    inputArtifacts: {
      promotionTicket: {
        path: `plans/VET-1563-${role}-runtime-promotion-ticket.json`,
        sha256: sha256(promotionTicketPath),
      },
      preflight: {
        path: `plans/VET-1563-${role}-promotion-readiness-preflight.json`,
        sha256: sha256(evidencePacketPath),
      },
      promotionEvidencePacket: cyclicArtifactReference(
        `plans/VET-1563-${role}-promotion-evidence-packet.json`
      ),
      promotionSmokeRunbook: {
        path: `plans/VET-1563-${role}-promotion-smoke-runbook.json`,
        sha256: sha256(promotionSmokeRunbookPath),
      },
    },
    guardrails: [
      "This packet does not grant approval.",
      "Owner approval must be an explicit human decision artifact.",
      "Approval cannot override failing holdout, missing frozen outputs, missing rollback, or protected clinical drift.",
      "Approval cannot authorize changes outside the separate promotion ticket.",
    ],
  };
}

const request = buildApprovalRequest();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(request, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(request, null, 2));
}
