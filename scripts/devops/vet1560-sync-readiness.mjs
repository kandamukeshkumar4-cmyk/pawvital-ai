#!/usr/bin/env node
/**
 * Build the VET-1560 project-manager sync readiness artifact.
 *
 * Local-only. It writes the planned project-manager ticket payload and reports
 * that live Azure sync remains blocked until env vars and owner approval exist.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const preflightPath = resolve(process.cwd(), "plans/VET-1560-azure-sync-preflight.json");
const runbookPath = resolve(process.cwd(), "plans/VET-1560-azure-live-sync-runbook.json");
const ticketsPath = resolve(process.cwd(), "plans/VET-1560-project-manager-tickets.json");
const localSyncPath = resolve(
  process.cwd(),
  "plans/VET-1560-project-manager-local-sync.json"
);
const outPath = resolve(process.cwd(), "plans/VET-1560-project-manager-sync-readiness.json");

const tickets = {
  ticket: "VET-1560",
  mode: "local-project-manager-ticket-payload",
  generatedAt:
    process.env.VET1560_PROJECT_MANAGER_TICKETS_GENERATED_AT ??
    "2026-05-31T00:00:00.000Z",
  source: {
    verdict:
      "FareedKhan scratch-training and syndicalt Tugboat techniques are translated into review-only PawVital tickets and local evidence artifacts.",
  },
  tickets: [
    {
      id: "VET-1561",
      title: "Build model dataset manifest and holdout policy",
      dependencies: [],
      acceptanceCriteria: ["dataset manifest exists", "holdout policy is explicit"],
      verifier: "plans/VET-1561-model-dataset-manifest.json",
    },
    {
      id: "VET-1562",
      title: "Package offline narrow-model experiment evidence",
      dependencies: ["VET-1561"],
      acceptanceCriteria: ["offline package exists", "runtime changes are blocked"],
      verifier: "plans/VET-1562-offline-experiment-package.json",
    },
    {
      id: "VET-1563",
      title: "Prepare model promotion evidence without changing runtime routes",
      dependencies: ["VET-1561", "VET-1562"],
      acceptanceCriteria: ["scorecard, rollback, owner approval, and smoke evidence blockers are explicit"],
      verifier: "plans/VET-1563-extraction-promotion-evidence-packet.json",
    },
    {
      id: "VET-1564",
      title: "Prepare Whoop-style product intelligence evidence contract",
      dependencies: [],
      acceptanceCriteria: ["claim guard and persistence schema readiness are explicit"],
      verifier: "plans/VET-1564-longitudinal-readiness-contract.json",
    },
    {
      id: "VET-1565",
      title: "Proposal-only Tugboat governance adoption",
      dependencies: [],
      acceptanceCriteria: ["proposal-only phases and no-auto-apply boundaries exist"],
      verifier: "plans/VET-1565-tugboat-governance-plan.json",
    },
  ],
};

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifact(path, relativePath) {
  return {
    path: relativePath,
    exists: existsSync(path),
    sha256: existsSync(path) ? sha256(path) : null,
  };
}

writeFileSync(ticketsPath, `${JSON.stringify(tickets, null, 2)}\n`);

const preflight = readJson(preflightPath);
const runbook = readJson(runbookPath);
const localSync = existsSync(localSyncPath) ? readJson(localSyncPath) : null;
const localFallbackReady = localSync?.localFallback?.ready === true;
const readiness = {
  ticket: "VET-1560",
  mode: "local-project-manager-sync-readiness",
  generatedAt:
    process.env.VET1560_SYNC_READINESS_GENERATED_AT ?? "2026-05-31T00:00:00.000Z",
  ticketCount: tickets.tickets.length,
  readyForLiveSync: preflight.readyForLiveSync === true,
  readyForExecutionSync: preflight.readyForLiveSync === true || localFallbackReady,
  executionMode:
    preflight.readyForLiveSync === true
      ? "azure-live-ready"
      : localFallbackReady
        ? "local-project-manager-fallback"
        : "blocked",
  blockedReason:
    preflight.readyForLiveSync === true || localFallbackReady
      ? null
      : `Azure DevOps live sync blocked and no local fallback artifact exists: ${preflight.missing.join(", ")}`,
  liveRunCommand:
    "Azure live creation remains disabled until a separate approved live-sync ticket implements duplicate checks, owner approval capture, and created work item evidence.",
  localFallbackCommand: "npm run devops:vet1560-local-sync",
  inputArtifacts: {
    preflight: artifact(preflightPath, "plans/VET-1560-azure-sync-preflight.json"),
    runbook: artifact(runbookPath, "plans/VET-1560-azure-live-sync-runbook.json"),
    tickets: artifact(ticketsPath, "plans/VET-1560-project-manager-tickets.json"),
    localSync: artifact(
      localSyncPath,
      "plans/VET-1560-project-manager-local-sync.json"
    ),
  },
  runbookStepCount: runbook.runSequence?.length ?? 0,
  blockers:
    preflight.readyForLiveSync === true || localFallbackReady
      ? []
      : [
          ...preflight.missing.map((name) => `${name} missing`),
          "local fallback artifact missing",
        ],
  guardrails: [
    "This readiness builder does not create Azure work items.",
    "A local fallback queue is execution-sync evidence, not Azure Boards live-sync evidence.",
    "Do not mark live sync complete without created work item ids and URLs.",
  ],
};

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(readiness, null, 2)}\n`);
  console.log(`Wrote ${ticketsPath}`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(readiness, null, 2));
}
