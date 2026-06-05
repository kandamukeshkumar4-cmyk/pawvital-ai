#!/usr/bin/env node
/**
 * Build the VET-1563 candidate approval intake packet.
 *
 * This is review-only. It gives the owner/operator a concrete record template
 * for candidate identity and scoped output-capture approval. It does not grant
 * approval, call providers, write frozen outputs, or mutate runtime routing.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const candidateSelectionPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-candidate-selection-packet.json`
);
const outputCaptureAuthorizationPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-output-capture-authorization.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-candidate-approval-intake.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function field(id, label, currentValue, description) {
  return {
    id,
    label,
    required: true,
    status:
      typeof currentValue === "string" && currentValue.trim().length > 0
        ? "provided"
        : "missing",
    currentValue: currentValue ?? null,
    description,
  };
}

function buildIntake() {
  const candidateSelection = readJson(candidateSelectionPath);
  const outputCaptureAuthorization = readJson(outputCaptureAuthorizationPath);
  const candidate = candidateSelection.candidate ?? {};
  const captureApproval = candidate.captureApproval ?? {};
  const requiredFields = [
    field(
      "candidate.modelOrAdapterId",
      "Approved candidate model or adapter id",
      candidate.modelOrAdapterId,
      "Exact provider model id, adapter id, checkpoint id, or sidecar artifact id selected for validation capture."
    ),
    field(
      "candidate.provider",
      "Candidate provider or runtime surface",
      candidate.provider,
      "Provider or runtime surface used for candidate capture, recorded without secret values."
    ),
    field(
      "candidate.artifactType",
      "Candidate artifact type",
      candidate.artifactType,
      "One of provider-model-id, adapter, checkpoint, prompt-policy, or sidecar-build."
    ),
    field(
      "candidate.artifactSha256",
      "Candidate artifact hash",
      candidate.artifactSha256,
      "SHA-256 for the immutable adapter/checkpoint/prompt-policy/manifest, or a hashed provider-model identity proof."
    ),
    field(
      "candidate.offlineTrainingEvalManifest",
      "Offline training/eval manifest",
      candidate.offlineTrainingEvalManifest,
      "Required for weight-update candidates; provider-model-id candidates may record a non-applicable proof note in the approval record."
    ),
    field(
      "candidate.approvedBy",
      "Candidate approver",
      candidate.approvedBy,
      "Human approver for this exact candidate identity."
    ),
    field(
      "candidate.approvedAt",
      "Candidate approval timestamp",
      candidate.approvedAt,
      "ISO timestamp for the candidate identity approval."
    ),
    field(
      "candidate.approvalRecord",
      "Candidate approval record",
      candidate.approvalRecord,
      "Issue comment, PR, signed document, or ticket that records the candidate identity approval."
    ),
    field(
      "candidate.captureApproval.approvedBy",
      "Validation capture approver",
      captureApproval.approvedBy,
      "Human approver for validation-output-capture only."
    ),
    field(
      "candidate.captureApproval.approvedAt",
      "Validation capture approval timestamp",
      captureApproval.approvedAt,
      "ISO timestamp for scoped validation-output-capture approval."
    ),
    field(
      "candidate.captureApproval.approvalRecord",
      "Validation capture approval record",
      captureApproval.approvalRecord,
      "Issue comment, PR, signed document, or ticket that grants validation-output-capture approval."
    ),
  ];
  const missingFields = requiredFields
    .filter((item) => item.status !== "provided")
    .map((item) => item.id);

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only-candidate-approval-intake",
    generatedAt:
      process.env.MODEL_CANDIDATE_APPROVAL_INTAKE_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    status: missingFields.length === 0 ? "complete" : "blocked",
    readyForProviderCapture:
      missingFields.length === 0 &&
      outputCaptureAuthorization.readyForProviderCapture === true,
    note:
      "Candidate approval intake only. This packet does not approve a model, call providers, write frozen outputs, or mutate runtime routing.",
    inputArtifacts: {
      candidateSelectionPacket: {
        path: `plans/VET-1563-${role}-candidate-selection-packet.json`,
        sha256: sha256(candidateSelectionPath),
      },
      outputCaptureAuthorization: {
        path: `plans/VET-1563-${role}-output-capture-authorization.json`,
        sha256: sha256(outputCaptureAuthorizationPath),
      },
    },
    currentCandidateState: {
      candidateIdentityResolved:
        candidateSelection.candidateIdentityResolved === true,
      candidateSelectionStatus: candidateSelection.status,
      blockers: candidateSelection.blockers ?? [],
      outputCaptureAuthorizationReady:
        outputCaptureAuthorization.readyForProviderCapture === true,
      outputCaptureBlockers: outputCaptureAuthorization.blockers ?? [],
    },
    requiredFields,
    missingFields,
    approvalRecordTarget: `plans/VET-1563-${role}-candidate-approval-record.json`,
    approvalRecordTemplate: {
      ticket: "VET-1563",
      role,
      mode: "candidate-approval-record",
      candidate: {
        modelOrAdapterId: "<required>",
        provider: "<required>",
        artifactType: "<provider-model-id|adapter|checkpoint|prompt-policy|sidecar-build>",
        artifactSha256: "<required-sha256-or-hashed-provider-identity-proof>",
        offlineTrainingEvalManifest:
          "<required-for-weight-update-candidates-or-non-applicable-proof>",
        baseModel: candidate.baseModel ?? null,
        tokenizer: candidate.tokenizer ?? null,
        contextLength: candidate.contextLength ?? null,
        approvedBy: "<required-human-approver>",
        approvedAt: "<required-iso-timestamp>",
        approvalRecord: "<required-issue-pr-doc-or-ticket>",
        captureApproval: {
          scope: "validation-output-capture-only",
          approvedBy: "<required-human-approver>",
          approvedAt: "<required-iso-timestamp>",
          approvalRecord: "<required-issue-pr-doc-or-ticket>",
          promotionApproval: false,
        },
      },
    },
    nextActions: [
      "Create the approval record only after the owner/operator approves the exact candidate identity and validation-output-capture scope.",
      "Rerun npm run models:candidate-selection-packet after the approval record exists.",
      "Rerun npm run models:output-capture-authorization before any provider call.",
      "Do not run holdout capture until validation outputs are frozen and reviewed.",
    ],
    guardrails: [
      "Do not fill this packet with placeholder or inferred candidate values.",
      "Do not infer candidate identity from experiment manifests.",
      "Do not treat validation-output-capture approval as runtime promotion approval.",
      "Do not call providers until output-capture authorization reports the specific capture lane ready.",
      "Do not mutate runtime model routing or model flags from this intake packet.",
    ],
  };
}

const intake = buildIntake();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(intake, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(intake, null, 2));
}
