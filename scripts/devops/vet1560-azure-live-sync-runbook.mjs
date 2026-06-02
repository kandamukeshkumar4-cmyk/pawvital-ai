#!/usr/bin/env node
/**
 * Build the VET-1560 Azure live-sync runbook.
 *
 * Review-only. It defines the sequence and evidence packet for a future live
 * Azure Boards sync; it does not call Azure DevOps.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const preflightPath = resolve(process.cwd(), "plans/VET-1560-azure-sync-preflight.json");
const outPath = resolve(process.cwd(), "plans/VET-1560-azure-live-sync-runbook.json");

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

const preflight = readJson(preflightPath);
const runbook = {
  ticket: "VET-1560",
  mode: "review-only-azure-live-sync-runbook",
  generatedAt:
    process.env.VET1560_AZURE_RUNBOOK_GENERATED_AT ?? "2026-05-31T00:00:00.000Z",
  readyForLiveSync: preflight.readyForLiveSync === true,
  inputArtifacts: {
    preflight: artifact(preflightPath, "plans/VET-1560-azure-sync-preflight.json"),
  },
  runSequence: [
    "Regenerate plans/VET-1560-project-manager-tickets.json.",
    "Confirm AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT are present without printing secrets.",
    "Run the approved Azure Boards creation command.",
    "Record created work item ids, urls, request timestamp, and commit/artifact hashes.",
    "Rerun project-manager sync readiness and completion audit.",
  ],
  evidencePacketTemplate: {
    liveSyncComplete: false,
    requiredAttachments: [
      "Azure organization and project names",
      "created work item ids and URLs",
      "ticket payload sha256",
      "command timestamp",
      "operator approval record",
    ],
  },
  blockers: preflight.missing.map((name) => `${name} missing`),
  liveCallMade: false,
  guardrails: [
    "Do not print or store PAT values.",
    "Do not create duplicate work items if the live sync already succeeded.",
    "Do not mark the project-manager lane ready without created Azure work item ids.",
  ],
};

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(runbook, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(runbook, null, 2));
}
