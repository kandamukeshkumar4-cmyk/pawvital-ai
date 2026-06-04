#!/usr/bin/env node
/**
 * Build the VET-1563 frozen-output capture authorization preflight.
 *
 * This is review-only. It checks whether a future provider capture is allowed
 * without reading or printing secret values, calling providers, or writing
 * frozen output envelopes.
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
const ownerApprovalRequestPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-owner-approval-request.json`
);
const routingMatrixPath = resolve(
  process.cwd(),
  "plans/VET-1563-model-routing-matrix.json"
);
const candidateSelectionPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-candidate-selection-packet.json`
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-output-capture-authorization.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function envPresent(names) {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function unique(values) {
  return [...new Set(values)];
}

function buildAuthorization() {
  const runbook = readJson(outputCaptureRunbookPath);
  const ownerApproval = readJson(ownerApprovalRequestPath);
  const routingMatrix = readJson(routingMatrixPath);
  const candidateSelection = readJson(candidateSelectionPath);
  const roleRoute = routingMatrix.matrix.find((item) => item.role === role);
  const steps = runbook.captureSequence?.flatMap((phase) => phase.steps ?? []) ?? [];
  const candidateModels = unique(
    steps
      .filter((step) => step.variant === "candidate")
      .map((step) => step.model)
      .filter(Boolean)
  );
  const baselineModels = unique(
    steps
      .filter((step) => step.variant === "baseline")
      .map((step) => step.model)
      .filter(Boolean)
  );
  const hasCandidatePlaceholder = candidateModels.some((model) =>
    model.includes("<")
  );
  const ownerDecision = ownerApproval.decision ?? {};
  const promotionOwnerApprovalDecisionComplete =
    ownerApproval.approvalGranted === true &&
    ownerApproval.approvalRequestReady === true &&
    Boolean(ownerDecision.approver) &&
    Boolean(ownerDecision.approvedAt) &&
    Boolean(ownerDecision.approvalRecord);
  const captureApproval = candidateSelection.candidate?.captureApproval ?? {};
  const candidateApprovalComplete =
    candidateSelection.candidateIdentityResolved === true &&
    captureApproval.scope === "validation-output-capture-only" &&
    captureApproval.promotionApproval === false &&
    Boolean(captureApproval.approvedBy) &&
    Boolean(captureApproval.approvedAt) &&
    Boolean(captureApproval.approvalRecord);
  const candidateIdentityResolved =
    candidateSelection.candidateIdentityResolved === true &&
    Boolean(candidateSelection.candidate?.modelOrAdapterId) &&
    !hasCandidatePlaceholder;
  const credentialGroups = [
    {
      id: "baseline-nvidia-extraction",
      purpose: "Capture current baseline extraction outputs through the existing NVIDIA/Qwen route.",
      acceptedEnvNames: ["NVIDIA_QWEN_API_KEY", "NVIDIA_API_KEY"],
      present: envPresent(["NVIDIA_QWEN_API_KEY", "NVIDIA_API_KEY"]),
    },
    {
      id: "narrow-pack-sidecar",
      purpose: "Capture or compare narrow-pack extraction behavior when the authorized candidate uses sidecar routing.",
      acceptedEnvNames: ["HF_SIDECAR_API_KEY"],
      present: envPresent(["HF_SIDECAR_API_KEY"]),
    },
    {
      id: "candidate-provider",
      purpose: "Capture candidate model or adapter outputs after the approved candidate identity is known.",
      acceptedEnvNames: [
        "NVIDIA_QWEN_API_KEY",
        "NVIDIA_API_KEY",
        "HF_SIDECAR_API_KEY",
        "RUNPOD_API_KEY",
      ],
      present: envPresent([
        "NVIDIA_QWEN_API_KEY",
        "NVIDIA_API_KEY",
        "HF_SIDECAR_API_KEY",
        "RUNPOD_API_KEY",
      ]),
    },
  ];
  const baselineCredentialPresent =
    credentialGroups.find((group) => group.id === "baseline-nvidia-extraction")
      ?.present === true;
  const candidateCredentialPresent =
    candidateIdentityResolved &&
    credentialGroups.find((group) => group.id === "candidate-provider")?.present ===
      true;
  const blockers = [
    ...(candidateApprovalComplete
      ? []
      : ["candidate capture approval is not complete"]),
    ...(ownerApproval.approvalRequestReady === false
      ? []
      : ["promotion owner approval request should remain blocked until frozen outputs are captured and reviewed"]),
    ...(runbook.authorizationRequired?.providerCredentialsRequired === true &&
    !baselineCredentialPresent
      ? ["baseline provider credential group is not present in the current process environment"]
      : []),
    ...(runbook.authorizationRequired?.providerCredentialsRequired === true &&
    !candidateCredentialPresent
      ? ["candidate provider credential group is not present in the current process environment"]
      : []),
    ...(!candidateIdentityResolved
      ? ["candidate model or adapter identity has not been approved"]
      : []),
    ...(runbook.authorizationRequired?.runtimeRoutingChangeAllowed === false
      ? []
      : ["capture runbook unexpectedly allows runtime routing changes"]),
  ];

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only-output-capture-authorization",
    generatedAt:
      process.env.MODEL_OUTPUT_CAPTURE_AUTHORIZATION_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    note:
      "Authorization preflight only. It does not read secret values, call providers, write output envelopes, or mutate runtime routing.",
    readyForProviderCapture: blockers.length === 0,
    blockers,
    inputArtifacts: {
      outputCaptureRunbook: {
        path: `plans/VET-1563-${role}-output-capture-runbook.json`,
        sha256: sha256(outputCaptureRunbookPath),
      },
      ownerApprovalRequest: {
        path: `plans/VET-1563-${role}-owner-approval-request.json`,
        sha256: sha256(ownerApprovalRequestPath),
      },
      routingMatrix: {
        path: "plans/VET-1563-model-routing-matrix.json",
        sha256: sha256(routingMatrixPath),
      },
      candidateSelectionPacket: {
        path: `plans/VET-1563-${role}-candidate-selection-packet.json`,
        sha256: sha256(candidateSelectionPath),
      },
    },
    approvalGate: {
      requiredForProviderCapture: false,
      requestReady: ownerApproval.approvalRequestReady === true,
      approvalGranted: ownerApproval.approvalGranted === true,
      decisionComplete: promotionOwnerApprovalDecisionComplete,
      approver: ownerDecision.approver ?? null,
      approvedAt: ownerDecision.approvedAt ?? null,
      approvalRecord: ownerDecision.approvalRecord ?? null,
      sourceArtifact: `plans/VET-1563-${role}-owner-approval-request.json`,
      note:
        "Runtime promotion approval is intentionally downstream of frozen output capture and review; it does not authorize provider capture.",
    },
    captureApprovalGate: {
      required: true,
      scope: captureApproval.scope ?? null,
      promotionApproval: captureApproval.promotionApproval ?? null,
      decisionComplete: candidateApprovalComplete,
      approver: captureApproval.approvedBy ?? null,
      approvedAt: captureApproval.approvedAt ?? null,
      approvalRecord: captureApproval.approvalRecord ?? null,
      sourceArtifact: `plans/VET-1563-${role}-candidate-selection-packet.json`,
    },
    credentialGate: {
      providerCredentialsRequired:
        runbook.authorizationRequired?.providerCredentialsRequired === true,
      reportsPresenceOnly: true,
      baselineCredentialPresent,
      candidateCredentialPresent,
      groups: credentialGroups,
    },
    routeContext: {
      currentRuntimeSurface: roleRoute?.currentRuntimeSurface ?? null,
      providers: roleRoute?.providers ?? [],
      baselineModels,
      candidateModels,
      candidateIdentityResolved,
      candidateSelectionStatus: candidateSelection.status,
      candidateSelectionArtifact: `plans/VET-1563-${role}-candidate-selection-packet.json`,
      runtimeRoutingChangeAllowed:
        runbook.authorizationRequired?.runtimeRoutingChangeAllowed === true,
    },
    allowedNextActions: blockers.length === 0
      ? [
          "Run the validation baseline/candidate capture sequence from the output-capture runbook.",
          "Regenerate npm run models:frozen-output-status immediately after capture.",
          "Do not release holdout capture until validation outputs are frozen and reviewer iteration has stopped.",
        ]
      : [
          "Record explicit candidate capture approval before provider capture.",
          "Provide provider credentials through the authorized environment without writing secret values to artifacts.",
          "Replace the candidate model placeholder with the approved candidate model or adapter identity.",
          "Rerun npm run models:output-capture-authorization before any provider call.",
        ],
    guardrails: [
      "Do not print secret values; this artifact records presence booleans only.",
      "Do not call providers or write frozen output files from this preflight.",
      "Do not mutate runtime model routing during capture authorization.",
      "Do not use holdout cases for prompt, adapter, or training iteration.",
      "Do not treat provider credentials as owner approval.",
    ],
  };
}

const authorization = buildAuthorization();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(authorization, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(authorization, null, 2));
}
