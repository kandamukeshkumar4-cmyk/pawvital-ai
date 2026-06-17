#!/usr/bin/env node
/**
 * Build the VET-1560 Azure Boards sync preflight.
 *
 * Local-only. It checks required env var presence and writes blocked evidence
 * when credentials are absent. It does not call Azure DevOps.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve(process.cwd(), "plans/VET-1560-azure-sync-preflight.json");
const markdownOutPath = resolve(process.cwd(), "plans/VET-1560-azure-sync-preflight.md");
const required = ["AZURE_DEVOPS_ORG", "AZURE_DEVOPS_PROJECT", "AZURE_DEVOPS_PAT"];
const missing = required.filter((name) => !process.env[name]);

const preflight = {
  ticket: "VET-1560",
  mode: "local-only-azure-sync-preflight",
  generatedAt:
    process.env.VET1560_AZURE_PREFLIGHT_GENERATED_AT ?? "2026-05-31T00:00:00.000Z",
  readyForLiveSync: missing.length === 0,
  missing,
  checkedEnvVars: required.map((name) => ({
    name,
    present: Boolean(process.env[name]),
  })),
  liveCallMade: false,
  blockedReason:
    missing.length === 0
      ? null
      : `Azure DevOps env vars missing: ${missing.join(", ")}`,
  guardrails: [
    "This preflight does not call Azure DevOps.",
    "Do not print or persist AZURE_DEVOPS_PAT.",
    "Do not create live work items until all required env vars are present and owner approval exists.",
  ],
};

function renderMarkdown() {
  return `# VET-1560 Azure Sync Preflight

Ready for live sync: ${preflight.readyForLiveSync}
Missing: ${missing.join(", ") || "none"}
Live call made: false
`;
}

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(preflight, null, 2)}\n`);
  writeFileSync(markdownOutPath, renderMarkdown());
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownOutPath}`);
} else {
  console.log(JSON.stringify(preflight, null, 2));
}
