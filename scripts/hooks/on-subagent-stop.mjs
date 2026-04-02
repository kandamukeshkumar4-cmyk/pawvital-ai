#!/usr/bin/env node
/**
 * SubagentStop hook — auto-finalizes structured ticket completions.
 * Reads the current hook payload, extracts the subagent handoff, and runs
 * finalize-pawvital-ticket.mjs directly.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
    setTimeout(() => resolve(data), 3000);
  });
}

function cleanLine(line) {
  return line.replace(/^\s*[-*]\s*/, "").trim();
}

function isSectionHeader(line) {
  return /^(Agent|Ticket|Branch|Commit|Files changed|What changed|Verification|Notes)\s*:?\s*$/i.test(
    line.trim(),
  );
}

function extractSingle(text, label) {
  const lines = text.split(/\r?\n/);
  const matcher = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(matcher);
    if (!match) {
      continue;
    }

    const inline = cleanLine(match[1] || "");
    if (inline) {
      return inline;
    }

    for (let offset = index + 1; offset < lines.length; offset += 1) {
      const next = lines[offset];
      if (!next.trim()) {
        continue;
      }
      if (isSectionHeader(next)) {
        break;
      }
      return cleanLine(next);
    }
  }

  return "";
}

function extractList(text, label) {
  const lines = text.split(/\r?\n/);
  const matcher = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(matcher);
    if (!match) {
      continue;
    }

    const items = [];
    const inline = cleanLine(match[1] || "");
    if (inline) {
      items.push(inline);
    }

    for (let offset = index + 1; offset < lines.length; offset += 1) {
      const next = lines[offset];
      if (!next.trim()) {
        if (items.length > 0) {
          break;
        }
        continue;
      }
      if (isSectionHeader(next)) {
        break;
      }
      items.push(cleanLine(next));
    }

    return items.filter(Boolean);
  }

  return [];
}

function pickTicket(text) {
  const explicit = extractSingle(text, "Ticket");
  if (explicit) {
    return explicit.toUpperCase();
  }

  const completeLine = text.match(/\b(VET-\d+[A-Z]?)\b[^\n]*\bcomplete\b/i);
  if (completeLine) {
    return completeLine[1].toUpperCase();
  }

  const generic = text.match(/\b(VET-\d+[A-Z]?)\b/i);
  return generic ? generic[1].toUpperCase() : "";
}

function inferReviewType(agentType, text) {
  const sensitive =
    /clinical-matrix\.ts|triage-engine\.ts|symptom-memory\.ts|route\.ts|deploy\/|runpod|vercel|billing|auth/i;
  if (/clinical-reviewer|guard/i.test(agentType || "")) {
    return "adversarial";
  }
  return sensitive.test(text) ? "adversarial" : "normal";
}

const raw = await readStdin();
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
  process.exit(0);
}

const lastMessage =
  typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
if (!lastMessage.trim()) {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
  process.exit(0);
}

const ticket = pickTicket(lastMessage);
const branch = extractSingle(lastMessage, "Branch");
const commit = extractSingle(lastMessage, "Commit");
const summaries = extractList(lastMessage, "What changed");
const verifications = extractList(lastMessage, "Verification");
const notes = extractSingle(lastMessage, "Notes");
const agent = input.agent_type || extractSingle(lastMessage, "Agent") || "unknown-agent";

if (!ticket || !branch || !commit || summaries.length === 0 || verifications.length === 0) {
  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      systemMessage: `Auto-finalize skipped for ${agent}: completion output was missing ticket, branch, commit, summary, or verification.`,
    }),
  );
  process.exit(0);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const finalizeScript = path.join(repoRoot, "scripts", "finalize-pawvital-ticket.mjs");
const reviewType = inferReviewType(agent, lastMessage);
const args = [
  finalizeScript,
  "--ticket",
  ticket,
  "--agent",
  agent,
  "--branch",
  branch,
  "--commit",
  commit,
  "--review-type",
  reviewType,
  "--json",
];

for (const summary of summaries) {
  args.push("--summary", summary);
}

for (const verification of verifications) {
  args.push("--verification", verification);
}

if (notes) {
  args.push("--notes", notes);
}

if (process.env.PAWVITAL_HOOK_DRY_RUN === "1") {
  args.push("--dry-run");
}

const result = spawnSync("node", args, {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 600000,
});

if (result.status !== 0 && result.status !== 2) {
  const errorText = (result.stderr || result.stdout || "").trim() || "unknown error";
  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      systemMessage: `Auto-finalize failed for ${ticket}: ${errorText}`,
    }),
  );
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse((result.stdout || "").trim());
} catch {
  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      systemMessage: `Auto-finalize produced unreadable output for ${ticket}.`,
    }),
  );
  process.exit(0);
}

const message =
  payload.reviewResult === "pass"
    ? `Auto-finalized ${ticket}: ${payload.reviewType} review passed and ${payload.landingState === "landed" ? "landed to master" : payload.landingState}${payload.landing?.deployment?.status === "ready" ? " with production verified" : ""}.`
    : `Auto-finalize blocked landing for ${ticket}: ${payload.reviewSummary}`;

process.stdout.write(
  JSON.stringify({
    suppressOutput: true,
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: "SubagentStop",
      additionalContext: [
        `Auto-finalize result for ${ticket}:`,
        `Agent: ${agent}`,
        `Branch: ${branch}`,
        `Commit: ${commit}`,
        `Review type: ${payload.reviewType}`,
        `Review result: ${payload.reviewResult}`,
        `Review summary: ${payload.reviewSummary}`,
        payload.findings?.length ? `Findings: ${payload.findings.join(" | ")}` : "Findings: none",
        `Landing state: ${payload.landingState}`,
        payload.landing?.deployment?.status
          ? `Deployment: ${payload.landing.deployment.status}${payload.landing.deployment.url ? ` (${payload.landing.deployment.url})` : ""}`
          : "Deployment: not available",
      ].join("\n"),
    },
  }),
);
