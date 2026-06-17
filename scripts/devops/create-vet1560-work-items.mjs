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

function verifierExists(ticket) {
  return typeof ticket.verifier === "string" && existsSync(resolve(process.cwd(), ticket.verifier));
}

function validateLocalQueue(tickets, localItems) {
  const blockers = [];
  const seen = new Set();
  const indexByTicketId = new Map();
  let dependencyEdgeCount = 0;
  let orderedDependencyEdgeCount = 0;
  let verifierArtifactCount = 0;

  tickets.forEach((ticket, index) => {
    if (!ticket.id) {
      blockers.push(`ticket at sequence ${index + 1} is missing an id`);
      return;
    }
    if (seen.has(ticket.id)) {
      blockers.push(`duplicate ticket id: ${ticket.id}`);
      return;
    }
    seen.add(ticket.id);
    indexByTicketId.set(ticket.id, index);
  });

  tickets.forEach((ticket, index) => {
    const dependencies = Array.isArray(ticket.dependencies)
      ? ticket.dependencies
      : [];

    for (const dependency of dependencies) {
      dependencyEdgeCount += 1;
      const dependencyIndex = indexByTicketId.get(dependency);
      if (dependencyIndex === undefined) {
        blockers.push(`${ticket.id ?? `sequence ${index + 1}`} depends on missing ticket ${dependency}`);
        continue;
      }
      if (dependencyIndex >= index) {
        blockers.push(`${ticket.id} depends on ${dependency}, but ${dependency} is not queued earlier`);
        continue;
      }
      orderedDependencyEdgeCount += 1;
    }

    if (!verifierExists(ticket)) {
      blockers.push(`${ticket.id ?? `sequence ${index + 1}`} verifier artifact missing: ${ticket.verifier ?? "none"}`);
    } else {
      verifierArtifactCount += 1;
    }
  });

  if (tickets.length !== localItems.length) {
    blockers.push(`local item count ${localItems.length} does not match ticket count ${tickets.length}`);
  }

  return {
    status: blockers.length === 0 ? "passed" : "blocked",
    blockers,
    uniqueTicketCount: seen.size,
    ticketCount: tickets.length,
    dependencyEdgeCount,
    orderedDependencyEdgeCount,
    verifierArtifactCount,
  };
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
  verifierArtifactExists: verifierExists(ticket),
  status: "queued-local-project-manager",
  localUrl: `local://pawvital/project-manager/${ticket.id}`,
}));
const localQueueValidation = validateLocalQueue(tickets, localItems);

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
    ready: tickets.length > 0 && localQueueValidation.status === "passed",
    itemCount: localItems.length,
    validation: localQueueValidation,
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
        `| ${item.ticketId} | ${item.title} | ${item.dependencies.join(", ") || "none"} | ${item.verifier ?? "none"} | ${item.verifierArtifactExists} | ${item.status} |`
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
Queue validation: ${localSync.localFallback.validation.status}

## Local Queue

| Ticket | Title | Dependencies | Verifier | Verifier exists | Status |
|---|---|---|---|---|---|
${rows}

## Queue Validation

${localSync.localFallback.validation.blockers.length
    ? localSync.localFallback.validation.blockers.map((blocker) => `- ${blocker}`).join("\n")
    : "- All queued dependencies are ordered, ticket ids are unique, and verifier artifacts exist."}

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
