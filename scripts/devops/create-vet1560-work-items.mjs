#!/usr/bin/env node
/**
 * Create or stage VET-1560 project-manager work items.
 *
 * Default behavior is local-only fallback: it reads the ticket payload and
 * writes a durable local project-manager queue artifact. It does not call Azure
 * DevOps unless a future ticket adds an explicit live mode with owner approval.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredAzureEnv = [
  "AZURE_DEVOPS_ORG",
  "AZURE_DEVOPS_PROJECT",
  "AZURE_DEVOPS_PAT",
];

const args = process.argv.slice(2);
const outPath = resolve(
  process.cwd(),
  "plans/VET-1560-project-manager-local-sync.json"
);
const markdownOutPath = resolve(
  process.cwd(),
  "plans/VET-1560-project-manager-local-sync.md"
);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
}

const fromPath = argValue(
  "--from",
  "plans/VET-1560-project-manager-tickets.json"
);
const shouldWrite = args.includes("--write");
const requestedLive = args.includes("--live");

if (requestedLive) {
  throw new Error(
    "Live Azure work-item creation is intentionally not implemented in this fallback command. Use the local fallback until Azure credentials, owner approval, duplicate checks, and live evidence recording are added in a separate ticket."
  );
}

const sourcePath = resolve(process.cwd(), fromPath);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (!existsSync(sourcePath)) {
  throw new Error(`Ticket payload not found: ${fromPath}`);
}

const payload = readJson(sourcePath);
const tickets = Array.isArray(payload.tickets) ? payload.tickets : [];
const missingAzureEnv = requiredAzureEnv.filter((name) => !process.env[name]);

const localItems = tickets.map((ticket, index) => ({
  localId: `local-${ticket.id}`,
  sequence: index + 1,
  ticketId: ticket.id,
  title: ticket.title,
  dependencies: ticket.dependencies ?? [],
  acceptanceCriteria: ticket.acceptanceCriteria ?? [],
  verifier: ticket.verifier ?? null,
  status: "queued-local-project-manager",
  localUrl: `local://pawvital/project-manager/${ticket.id}`,
}));

const localSync = {
  ticket: "VET-1560",
  mode: "local-project-manager-fallback-sync",
  generatedAt:
    process.env.VET1560_LOCAL_SYNC_GENERATED_AT ??
    "2026-05-31T00:00:00.000Z",
  source: {
    path: fromPath,
    sha256: sha256(sourcePath),
    ticketCount: tickets.length,
  },
  azure: {
    liveCallMade: false,
    readyForLiveSync: missingAzureEnv.length === 0,
    missingEnvVars: missingAzureEnv,
    checkedEnvVars: requiredAzureEnv.map((name) => ({
      name,
      present: Boolean(process.env[name]),
    })),
  },
  localFallback: {
    ready: tickets.length > 0,
    itemCount: localItems.length,
    items: localItems,
  },
  guardrails: [
    "This artifact is local project-manager fallback evidence, not Azure Boards live-sync proof.",
    "Do not mark Azure live sync complete without created Azure work item ids and URLs.",
    "Do not print or persist AZURE_DEVOPS_PAT.",
    "Do not mutate runtime routes, model flags, provider env, or clinical logic from this sync command.",
  ],
};

function renderMarkdown() {
  const rows = localItems
    .map(
      (item) =>
        `| ${item.ticketId} | ${item.title} | ${item.dependencies.join(", ") || "none"} | ${item.verifier ?? "none"} | ${item.status} |`
    )
    .join("\n");
  const blockers = missingAzureEnv.length
    ? missingAzureEnv.map((name) => `- ${name} missing`).join("\n")
    : "- None";

  return `# VET-1560 Local Project-Manager Sync

Generated: ${localSync.generatedAt}
Mode: ${localSync.mode}
Local fallback ready: ${localSync.localFallback.ready}
Azure live call made: false

## Local Queue

| Ticket | Title | Dependencies | Verifier | Status |
|---|---|---|---|---|
${rows}

## Azure Live-Sync Blockers

${blockers}

## Guardrails

${localSync.guardrails.map((guardrail) => `- ${guardrail}`).join("\n")}
`;
}

if (shouldWrite) {
  writeFileSync(outPath, `${JSON.stringify(localSync, null, 2)}\n`);
  writeFileSync(markdownOutPath, renderMarkdown());
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownOutPath}`);
} else {
  console.log(JSON.stringify(localSync, null, 2));
}
