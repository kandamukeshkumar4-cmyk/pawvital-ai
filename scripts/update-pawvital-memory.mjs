#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const vaultRoot = path.join(workspaceRoot, "petviatal", "01 Projects", "PawVital AI");
const dailyRoot = path.join(workspaceRoot, "petviatal", "02 Daily");
const ticketBriefRoot = path.join(vaultRoot, "18 Ticket Briefs");
const statePath = path.join(vaultRoot, ".memory-automation.json");

const notePaths = {
  activeWork: path.join(vaultRoot, "01 Active Work.md"),
  ticketBoard: path.join(vaultRoot, "04 Ticket Board.md"),
  completedTickets: path.join(vaultRoot, "09 Completed Tickets.md"),
  agentRegistry: path.join(vaultRoot, "07 Agent Registry.md"),
  currentSprint: path.join(vaultRoot, "10 Current Sprint.md"),
  currentContextPacket: path.join(vaultRoot, "16 Current Context Packet.md"),
  activityLog: path.join(vaultRoot, "17 Activity Log.md"),
};

const MARKERS = {
  activeReviewQueue: "ACTIVE_WORK_REVIEW_QUEUE",
  boardInReview: "TICKET_BOARD_IN_REVIEW",
  boardRecentLandings: "TICKET_BOARD_RECENT_LANDINGS",
  completedAwaitingLanding: "COMPLETED_AWAITING_LANDING",
  completedRecentLandings: "COMPLETED_RECENT_LANDINGS",
  autoAgentRegistry: "AUTO_AGENT_REGISTRY",
  dailyDigest: "DAILY_DIGEST",
};

const DEFAULT_STATE = {
  inReview: [],
  landed: [],
  agents: [],
  reviews: [],
  commits: [],
  events: [],
};

const usage = `PawVital shared memory automation

Usage:
  node scripts/update-pawvital-memory.mjs complete --ticket <id> --agent <name> --branch <branch> --commit <sha> --summary <text> [--summary <text> ...] --verification <text> [--verification <text> ...] [--goal <text>] [--notes <text>] [--dry-run]
  node scripts/update-pawvital-memory.mjs land --ticket <id> [--agent <name>] [--branch <branch>] [--commit <sha>] [--merge-commit <sha>] [--summary <text> ...] [--verification <text> ...] [--review <text> ...] [--notes <text>] [--dry-run]
  node scripts/update-pawvital-memory.mjs review --ticket <id> --reviewer <name> --mode <normal|adversarial> --result <pass|fail> --summary <text> [--finding <text> ...] [--branch <branch>] [--commit <sha>] [--notes <text>] [--dry-run]
  node scripts/update-pawvital-memory.mjs commit --repo <path> --branch <branch> --commit <sha> --subject <text> [--author <name>] [--ticket <id>] [--notes <text>] [--dry-run]
  node scripts/update-pawvital-memory.mjs register-agent --agent <name> --kind <kind> --use-for <text> [--use-for <text> ...] [--notes <text>] [--dry-run]
  node scripts/update-pawvital-memory.mjs brief --ticket <id> --title <text> [--agent <name>] [--status <text>] --goal <text> [--why <text>] [--scope <text> ...] [--inspect <text> ...] [--build <text> ...] [--avoid <text> ...] [--verification <text> ...] [--notes <text>] [--dry-run]
  node scripts/update-pawvital-memory.mjs refresh [--dry-run]
  node scripts/update-pawvital-memory.mjs help

Commands:
  complete       Record an agent-completed ticket awaiting review/landing.
  land           Record a reviewed + landed ticket and remove it from the review queue.
  review         Record a Codex or human review result for a ticket.
  commit         Record a commit event automatically (used by git hooks).
  register-agent Register a new worker/model in the shared agent registry.
  brief          Create or update a ticket brief note.
  refresh        Regenerate the auto-managed notes from current state.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sanitizeInline(value) {
  return String(value ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeMultiline(value) {
  return String(value ?? "").replace(/\r/g, "").trim();
}

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }

    const key = token.slice(2);
    if (key === "dry-run") {
      parsed.dryRun = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }

    if (!parsed[key]) {
      parsed[key] = [];
    }

    parsed[key].push(value);
    index += 1;
  }

  return parsed;
}

function getSingle(parsed, key, { required = false, multiline = false } = {}) {
  const values = parsed[key];
  if (!values || values.length === 0) {
    if (required) {
      fail(`Missing required --${key}`);
    }
    return "";
  }

  return multiline
    ? sanitizeMultiline(values[values.length - 1])
    : sanitizeInline(values[values.length - 1]);
}

function getMany(parsed, key, { required = false, multiline = false } = {}) {
  const values = (parsed[key] ?? [])
    .map((value) => (multiline ? sanitizeMultiline(value) : sanitizeInline(value)))
    .filter(Boolean);

  if (required && values.length === 0) {
    fail(`Missing required --${key}`);
  }

  return values;
}

function limitItems(items, max) {
  return items.slice(0, max);
}

async function ensureDir(dirPath, dryRun) {
  if (dryRun) {
    return;
  }
  await fs.mkdir(dirPath, { recursive: true });
}

async function readOrEmpty(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function loadState() {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      inReview: Array.isArray(parsed.inReview) ? parsed.inReview : [],
      landed: Array.isArray(parsed.landed) ? parsed.landed : [],
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      commits: Array.isArray(parsed.commits) ? parsed.commits : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return structuredClone(DEFAULT_STATE);
    }
    throw error;
  }
}

async function saveState(state, dryRun) {
  if (dryRun) {
    return;
  }

  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function upsertByKey(items, item, keyName) {
  const nextItems = items.filter((candidate) => candidate[keyName] !== item[keyName]);
  return [item, ...nextItems];
}

function appendEvent(state, event) {
  const nextEvents = state.events.filter((existing) => existing.id !== event.id);
  return limitItems([event, ...nextEvents], 250);
}

function removeByKey(items, keyName, keyValue) {
  return items.filter((candidate) => candidate[keyName] !== keyValue);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAutoBlock(content, markerName, replacement) {
  const startMarker = `<!-- AUTO:${markerName}:START -->`;
  const endMarker = `<!-- AUTO:${markerName}:END -->`;

  if (!content.includes(startMarker) || !content.includes(endMarker)) {
    fail(`Missing automation markers for ${markerName}`);
  }

  const pattern = new RegExp(
    `${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`,
    "m",
  );

  return content.replace(
    pattern,
    `${startMarker}\n${replacement.trimEnd()}\n${endMarker}`,
  );
}

function upsertAutoSection(content, heading, markerName, replacement, description = "") {
  const startMarker = `<!-- AUTO:${markerName}:START -->`;
  const endMarker = `<!-- AUTO:${markerName}:END -->`;

  if (content.includes(startMarker) && content.includes(endMarker)) {
    return replaceAutoBlock(content, markerName, replacement);
  }

  const sectionLines = [
    heading,
    "",
  ];

  if (description) {
    sectionLines.push(description, "");
  }

  sectionLines.push(startMarker, replacement.trimEnd(), endMarker, "");
  const section = sectionLines.join("\n");

  const lines = content.split(/\r?\n/);
  const firstHeadingIndex = lines.findIndex((line) => /^#\s+/.test(line));

  if (firstHeadingIndex === -1) {
    return `${section}${content}`.trimEnd();
  }

  const before = lines.slice(0, firstHeadingIndex + 1);
  const after = lines.slice(firstHeadingIndex + 1);
  return [...before, "", section.trimEnd(), ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

function formatTimestamp(isoString) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(isoString));
}

function getLocalDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function inferTicket(...values) {
  const pattern = /\b(VET-\d+[A-Z]?)\b/i;

  for (const value of values) {
    const text = sanitizeInline(value);
    if (!text) {
      continue;
    }
    const match = text.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return "";
}

function renderList(items, emptyLine) {
  if (items.length === 0) {
    return emptyLine;
  }
  return items.join("\n");
}

function renderBulletList(items) {
  return items.map((item) => `  - ${item}`).join("\n");
}

function renderInReview(entries) {
  const blocks = entries
    .slice()
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .map((entry) => {
      const lines = [
        `### ${entry.ticket}`,
        `- Agent: \`${entry.agent}\``,
        `- Branch: \`${entry.branch}\``,
        `- Commit: \`${entry.commit}\``,
        `- Updated: \`${formatTimestamp(entry.updatedAt)}\``,
      ];

      if (entry.goal) {
        lines.push(`- Goal: ${entry.goal}`);
      }

      lines.push("- Summary:");
      lines.push(renderBulletList(entry.summaries));
      lines.push("- Verification:");
      lines.push(renderBulletList(entry.verifications));

      if (entry.latestReview) {
        lines.push(
          `- Latest review: \`${entry.latestReview.result.toUpperCase()}\` via \`${entry.latestReview.reviewer}\` (${entry.latestReview.mode}) at \`${formatTimestamp(entry.latestReview.reviewedAt)}\``,
        );
        lines.push(`- Review summary: ${entry.latestReview.summary}`);
        if (entry.latestReview.findings?.length) {
          lines.push("- Review findings:");
          lines.push(renderBulletList(entry.latestReview.findings));
        }
      }

      if (entry.notes) {
        lines.push(`- Notes: ${entry.notes}`);
      }

      return lines.join("\n");
    });

  return renderList(blocks, "- No agent completions waiting for review.");
}

function renderRecentLandings(entries) {
  const blocks = entries
    .slice()
    .sort((left, right) => String(right.landedAt).localeCompare(String(left.landedAt)))
    .map((entry) => {
      const lines = [
        `### ${entry.ticket}`,
        `- Agent: \`${entry.agent}\``,
        `- Landed: \`${formatTimestamp(entry.landedAt)}\``,
        `- Merge commit: \`${entry.mergeCommit || entry.commit}\``,
      ];

      lines.push("- Summary:");
      lines.push(renderBulletList(entry.summaries));

      if (entry.reviewNotes?.length) {
        lines.push("- Review notes:");
        lines.push(renderBulletList(entry.reviewNotes));
      }

      if (entry.latestReview) {
        lines.push(
          `- Final review: \`${entry.latestReview.result.toUpperCase()}\` via \`${entry.latestReview.reviewer}\` (${entry.latestReview.mode}) at \`${formatTimestamp(entry.latestReview.reviewedAt)}\``,
        );
        lines.push(`- Review summary: ${entry.latestReview.summary}`);
      }

      if (entry.notes) {
        lines.push(`- Notes: ${entry.notes}`);
      }

      return lines.join("\n");
    });

  return renderList(blocks, "- No automated landings recorded yet.");
}

function renderAgentRegistry(entries) {
  const blocks = entries
    .slice()
    .sort((left, right) => String(right.addedAt).localeCompare(String(left.addedAt)))
    .map((entry) => {
      const lines = [
        `### ${entry.agent}`,
        `- Kind: \`${entry.kind}\``,
        `- Added: \`${formatTimestamp(entry.addedAt)}\``,
        "- Use for:",
        ...entry.useFor.map((item) => `  - ${item}`),
      ];

      if (entry.notes) {
        lines.push(`- Notes: ${entry.notes}`);
      }

      return lines.join("\n");
    });

  return renderList(blocks, "- No auto-registered workers recorded yet.");
}

function describeEvent(event) {
  const bits = [`- \`${formatTimestamp(event.timestamp)}\``, `\`${event.type}\``];

  if (event.ticket) {
    bits.push(`ticket \`${event.ticket}\``);
  }

  if (event.agent) {
    bits.push(`agent \`${event.agent}\``);
  }

  if (event.repoName) {
    bits.push(`repo \`${event.repoName}\``);
  }

  if (event.branch) {
    bits.push(`branch \`${event.branch}\``);
  }

  if (event.commit) {
    bits.push(`commit \`${event.commit}\``);
  }

  if (event.mergeCommit) {
    bits.push(`merge \`${event.mergeCommit}\``);
  }

  if (event.reviewer) {
    bits.push(`reviewer \`${event.reviewer}\``);
  }

  if (event.mode) {
    bits.push(`mode \`${event.mode}\``);
  }

  if (event.result) {
    bits.push(`result \`${event.result}\``);
  }

  if (event.subject) {
    bits.push(`subject: ${event.subject}`);
  }

  if (event.summary) {
    bits.push(`summary: ${event.summary}`);
  }

  if (event.notes) {
    bits.push(`notes: ${event.notes}`);
  }

  return bits.join(" - ");
}

function renderEventBullets(events, emptyLine, limit = 12) {
  if (events.length === 0) {
    return emptyLine;
  }

  return events
    .slice()
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)))
    .slice(0, limit)
    .map(describeEvent)
    .join("\n");
}

function renderCommitBullets(commits, emptyLine, limit = 12) {
  if (commits.length === 0) {
    return emptyLine;
  }

  return commits
    .slice()
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)))
    .slice(0, limit)
    .map((commit) => {
      const bits = [
        `- \`${formatTimestamp(commit.timestamp)}\``,
        commit.ticket ? `ticket \`${commit.ticket}\`` : "ticket `none`",
        `repo \`${commit.repoName}\``,
        `branch \`${commit.branch || "unknown"}\``,
        `commit \`${commit.commit}\``,
        commit.subject ? `subject: ${commit.subject}` : "",
      ].filter(Boolean);

      return bits.join(" - ");
    })
    .join("\n");
}

function extractSectionByPrefix(content, headingPrefix) {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim().startsWith(headingPrefix));

  if (startIndex === -1) {
    return "";
  }

  const collected = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n").trim();
}

function renderCurrentContextPacket(activeWork, ticketBoard, currentSprint, state, ticketBriefLinks) {
  const nowSection = extractSectionByPrefix(activeWork, "## Now");
  const nextTicketSection = extractSectionByPrefix(activeWork, "## Next Ticket");
  const sprintFocus = extractSectionByPrefix(currentSprint, "## Sprint Focus");
  const priorities = extractSectionByPrefix(currentSprint, "## Current Priorities");
  const pendingWork = extractSectionByPrefix(ticketBoard, "## Pending / Unblocked Work");

  return `# Current Context Packet

Auto-generated by \`node pawvital-ai/scripts/update-pawvital-memory.mjs refresh\`.
Read this first when you need the fastest possible project snapshot.

## Immediate Snapshot

${nowSection || "- Snapshot unavailable."}

## Next Ticket

${nextTicketSection || "- No next ticket section found."}

## Sprint Focus

${sprintFocus || "- Sprint focus unavailable."}

## Current Priorities

${priorities || "- Sprint priorities unavailable."}

## Review Queue

${renderInReview(state.inReview)}

## Recent Landings

${renderRecentLandings(state.landed)}

## Pending / Unblocked Work

${pendingWork || "- No pending/unblocked work recorded."}

## Recent Activity

${renderEventBullets(state.events, "- No recent activity recorded yet.", 10)}

## Recent Commits

${renderCommitBullets(state.commits, "- No recent commits recorded yet.", 10)}

## Ticket Briefs

${ticketBriefLinks.length > 0 ? ticketBriefLinks.join("\n") : "- No ticket briefs created yet."}

## Core Notes

- [[00 Home]]
- [[00 Project Home]]
- [[01 Active Work]]
- [[04 Ticket Board]]
- [[10 Current Sprint]]
- [[17 Activity Log]]
- [[18 Ticket Briefs/README]]
`;
}

function renderActivityLog(state) {
  return `# Activity Log

Auto-generated by \`node pawvital-ai/scripts/update-pawvital-memory.mjs\`.
This is the raw shared-memory stream for commits, completions, landings, and new workers.

## Recent Events

${renderEventBullets(state.events, "- No events recorded yet.", 40)}

## Recent Commits

${renderCommitBullets(state.commits, "- No commits recorded yet.", 40)}
`;
}

function renderDailyDigest(state, dateKey) {
  const todaysEvents = state.events.filter(
    (event) => getLocalDateKey(new Date(event.timestamp)) === dateKey,
  );
  const todaysCommits = state.commits.filter(
    (commit) => getLocalDateKey(new Date(commit.timestamp)) === dateKey,
  );
  const uniqueTickets = [...new Set(todaysEvents.map((event) => event.ticket).filter(Boolean))];
  const landedToday = todaysEvents.filter((event) => event.type === "land");
  const completedToday = todaysEvents.filter((event) => event.type === "complete");

  const summaryLines = [
    `- Events today: \`${todaysEvents.length}\``,
    `- Commits today: \`${todaysCommits.length}\``,
    `- Tickets touched: ${uniqueTickets.length > 0 ? uniqueTickets.map((ticket) => `\`${ticket}\``).join(", ") : "none"}`,
    `- Tickets completed: \`${completedToday.length}\``,
    `- Tickets landed: \`${landedToday.length}\``,
  ];

  return `${summaryLines.join("\n")}

### Today In Review

${renderInReview(state.inReview)}

### Recent Events Today

${renderEventBullets(todaysEvents, "- No events recorded today.", 20)}

### Recent Commits Today

${renderCommitBullets(todaysCommits, "- No commits recorded today.", 20)}
`;
}

async function ensureDailyNote(dateKey, state, dryRun) {
  await ensureDir(dailyRoot, dryRun);

  const dailyPath = path.join(dailyRoot, `${dateKey}.md`);
  const existing = await readOrEmpty(dailyPath);
  const digestBody = renderDailyDigest(state, dateKey);
  const description =
    "This section is auto-managed by `node pawvital-ai/scripts/update-pawvital-memory.mjs`.";

  const baseContent =
    existing ||
    `---
tags: [daily]
date: ${dateKey}
---

# ${dateKey}

## Focus

- 

## In Progress

- 

## Blockers

- 

## Decisions

- 

## Next Step

- 
`;

  const nextContent = upsertAutoSection(
    baseContent,
    "## Auto Digest",
    MARKERS.dailyDigest,
    digestBody,
    description,
  );

  if (!dryRun) {
    await fs.writeFile(dailyPath, `${nextContent.trimEnd()}\n`, "utf8");
  }
}

async function listTicketBriefLinks() {
  try {
    const files = await fs.readdir(ticketBriefRoot, { withFileTypes: true });
    return files
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
      .map((entry) => entry.name.replace(/\.md$/i, ""))
      .sort()
      .map((name) => `- [[18 Ticket Briefs/${name}]]`);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function renderNotes(state, dryRun) {
  await ensureDir(ticketBriefRoot, dryRun);

  const activeWork = await fs.readFile(notePaths.activeWork, "utf8");
  const ticketBoard = await fs.readFile(notePaths.ticketBoard, "utf8");
  const completedTickets = await fs.readFile(notePaths.completedTickets, "utf8");
  const agentRegistry = await fs.readFile(notePaths.agentRegistry, "utf8");
  const currentSprint = await fs.readFile(notePaths.currentSprint, "utf8");
  const ticketBriefLinks = await listTicketBriefLinks();

  const nextActiveWork = replaceAutoBlock(
    activeWork,
    MARKERS.activeReviewQueue,
    renderInReview(state.inReview),
  );

  const nextTicketBoard = replaceAutoBlock(
    replaceAutoBlock(ticketBoard, MARKERS.boardInReview, renderInReview(state.inReview)),
    MARKERS.boardRecentLandings,
    renderRecentLandings(state.landed),
  );

  const nextCompletedTickets = replaceAutoBlock(
    replaceAutoBlock(
      completedTickets,
      MARKERS.completedAwaitingLanding,
      renderInReview(state.inReview),
    ),
    MARKERS.completedRecentLandings,
    renderRecentLandings(state.landed),
  );

  const nextAgentRegistry = replaceAutoBlock(
    agentRegistry,
    MARKERS.autoAgentRegistry,
    renderAgentRegistry(state.agents),
  );

  const nextContextPacket = renderCurrentContextPacket(
    nextActiveWork,
    nextTicketBoard,
    currentSprint,
    state,
    ticketBriefLinks,
  );

  const nextActivityLog = renderActivityLog(state);
  const dateKey = getLocalDateKey();

  if (dryRun) {
    console.log("Dry run complete. No files were written.");
    return;
  }

  await fs.writeFile(notePaths.activeWork, `${nextActiveWork.trimEnd()}\n`, "utf8");
  await fs.writeFile(notePaths.ticketBoard, `${nextTicketBoard.trimEnd()}\n`, "utf8");
  await fs.writeFile(notePaths.completedTickets, `${nextCompletedTickets.trimEnd()}\n`, "utf8");
  await fs.writeFile(notePaths.agentRegistry, `${nextAgentRegistry.trimEnd()}\n`, "utf8");
  await fs.writeFile(notePaths.currentContextPacket, `${nextContextPacket.trimEnd()}\n`, "utf8");
  await fs.writeFile(notePaths.activityLog, `${nextActivityLog.trimEnd()}\n`, "utf8");
  await ensureDailyNote(dateKey, state, dryRun);
}

function buildCompleteEntry(parsed) {
  const ticket = getSingle(parsed, "ticket", { required: true }) || inferTicket(getSingle(parsed, "branch"));
  if (!ticket) {
    fail("Unable to determine ticket for complete command.");
  }

  return {
    ticket,
    agent: getSingle(parsed, "agent", { required: true }),
    branch: getSingle(parsed, "branch", { required: true }),
    commit: getSingle(parsed, "commit", { required: true }),
    goal: getSingle(parsed, "goal"),
    summaries: getMany(parsed, "summary", { required: true }),
    verifications: getMany(parsed, "verification", { required: true }),
    notes: getSingle(parsed, "notes", { multiline: true }),
    updatedAt: new Date().toISOString(),
  };
}

function buildLandedEntry(parsed, existingEntry) {
  const ticket = getSingle(parsed, "ticket", { required: true });
  const baseEntry =
    existingEntry ??
    (() => {
      const agent = getSingle(parsed, "agent", { required: true });
      const branch = getSingle(parsed, "branch", { required: true });
      const commit = getSingle(parsed, "commit", { required: true });
      const summaries = getMany(parsed, "summary", { required: true });
      const verifications = getMany(parsed, "verification", { required: true });

      return {
        ticket,
        agent,
        branch,
        commit,
        goal: getSingle(parsed, "goal"),
    summaries,
    verifications,
    notes: "",
    latestReview: null,
      };
    })();

  const mergeCommit =
    getSingle(parsed, "merge-commit") ||
    getSingle(parsed, "commit") ||
    baseEntry.commit;

  return {
    ...baseEntry,
    ticket,
    notes: getSingle(parsed, "notes", { multiline: true }) || baseEntry.notes || "",
    mergeCommit,
    reviewNotes: getMany(parsed, "review"),
    latestReview: baseEntry.latestReview ?? null,
    landedAt: new Date().toISOString(),
  };
}

function buildReviewEntry(parsed) {
  const result = getSingle(parsed, "result", { required: true }).toLowerCase();
  if (!["pass", "fail"].includes(result)) {
    fail("--result must be pass or fail");
  }

  const mode = getSingle(parsed, "mode", { required: true }).toLowerCase();
  if (!["normal", "adversarial"].includes(mode)) {
    fail("--mode must be normal or adversarial");
  }

  return {
    ticket: getSingle(parsed, "ticket", { required: true }).toUpperCase(),
    reviewer: getSingle(parsed, "reviewer", { required: true }),
    mode,
    result,
    summary: getSingle(parsed, "summary", { required: true, multiline: true }),
    findings: getMany(parsed, "finding", { multiline: true }),
    branch: getSingle(parsed, "branch"),
    commit: getSingle(parsed, "commit"),
    notes: getSingle(parsed, "notes", { multiline: true }),
    reviewedAt: new Date().toISOString(),
  };
}

function buildAgentEntry(parsed) {
  return {
    agent: getSingle(parsed, "agent", { required: true }),
    kind: getSingle(parsed, "kind", { required: true }),
    useFor: getMany(parsed, "use-for", { required: true }),
    notes: getSingle(parsed, "notes", { multiline: true }),
    addedAt: new Date().toISOString(),
  };
}

function buildCommitEntry(parsed) {
  const branch = getSingle(parsed, "branch", { required: true });
  const subject = getSingle(parsed, "subject", { required: true });
  const repoPath = getSingle(parsed, "repo", { required: true });
  const ticket = getSingle(parsed, "ticket") || inferTicket(branch, subject, repoPath);

  return {
    id: `commit:${getSingle(parsed, "commit", { required: true })}`,
    type: "commit",
    ticket,
    repoPath,
    repoName: path.basename(repoPath),
    branch,
    commit: getSingle(parsed, "commit", { required: true }),
    subject,
    author: getSingle(parsed, "author"),
    notes: getSingle(parsed, "notes", { multiline: true }),
    timestamp: new Date().toISOString(),
  };
}

function buildBriefEntry(parsed) {
  const ticket = getSingle(parsed, "ticket", { required: true }).toUpperCase();
  const agent = getSingle(parsed, "agent");
  const title = getSingle(parsed, "title") || ticket;
  const branchHint =
    getSingle(parsed, "branch") ||
    (agent ? `<branch for ${agent}>` : "<branch>");

  return {
    ticket,
    title,
    agent,
    status: getSingle(parsed, "status") || "ready",
    goal: getSingle(parsed, "goal", { required: true, multiline: true }),
    why: getSingle(parsed, "why", { multiline: true }),
    scope: getMany(parsed, "scope", { multiline: true }),
    inspect: getMany(parsed, "inspect", { multiline: true }),
    build: getMany(parsed, "build", { multiline: true }),
    avoid: getMany(parsed, "avoid", { multiline: true }),
    verification: getMany(parsed, "verification", { multiline: true }),
    notes: getSingle(parsed, "notes", { multiline: true }),
    branchHint,
  };
}

function renderTicketBrief(entry) {
  const completionAgent = entry.agent || "<agent>";
  return `# ${entry.ticket} - ${entry.title}

## Status

- \`${entry.status}\`

## Owner

- ${entry.agent ? `\`${entry.agent}\`` : "TBD"}

## Goal

${entry.goal}

## Why It Matters

${entry.why || "Document the reason for this ticket here so new agents understand why it matters."}

## Shared Context

- [[16 Current Context Packet]]
- [[01 Active Work]]
- [[04 Ticket Board]]
- [[10 Current Sprint]]

## Files In Scope

${entry.scope.length > 0 ? entry.scope.map((item) => `- ${item}`).join("\n") : "- Add the primary files for this ticket."}

## Inspect First

${entry.inspect.length > 0 ? entry.inspect.map((item) => `- ${item}`).join("\n") : "- Add the first functions, notes, or files to inspect."}

## What To Build

${entry.build.length > 0 ? entry.build.map((item) => `- ${item}`).join("\n") : "- Add the concrete outcomes this ticket should deliver."}

## What Not To Do

${entry.avoid.length > 0 ? entry.avoid.map((item) => `- ${item}`).join("\n") : "- Add the guardrails and scope boundaries here."}

## Verification

${entry.verification.length > 0 ? entry.verification.map((item) => `- ${item}`).join("\n") : "- Add the required verification commands and expected results."}

## Completion Command

\`\`\`bash
node pawvital-ai/scripts/update-pawvital-memory.mjs complete --ticket ${entry.ticket} --agent ${completionAgent} --branch ${entry.branchHint} --commit <sha> --summary "<summary>" --verification "<verification>"
\`\`\`

## Automatic Finalize Command (Preferred)

\`\`\`bash
node pawvital-ai/scripts/finalize-pawvital-ticket.mjs --ticket ${entry.ticket} --agent ${completionAgent} --branch ${entry.branchHint} --commit <sha> --summary "<summary>" --verification "<verification>"
\`\`\`

## Landing Command

\`\`\`bash
node pawvital-ai/scripts/land-pawvital-ticket.mjs --ticket ${entry.ticket} --commit <sha>
\`\`\`

## Notes

${entry.notes || "- Add any extra context, review expectations, or caveats here."}
`;
}

async function writeTicketBrief(entry, dryRun) {
  await ensureDir(ticketBriefRoot, dryRun);
  const briefPath = path.join(ticketBriefRoot, `${entry.ticket}.md`);
  const content = renderTicketBrief(entry);

  if (!dryRun) {
    await fs.writeFile(briefPath, `${content.trimEnd()}\n`, "utf8");
  }

  return briefPath;
}

function buildEventFromComplete(entry) {
  return {
    id: `complete:${entry.ticket}:${entry.updatedAt}`,
    type: "complete",
    ticket: entry.ticket,
    agent: entry.agent,
    branch: entry.branch,
    commit: entry.commit,
    notes: entry.notes,
    timestamp: entry.updatedAt,
  };
}

function buildEventFromLand(entry) {
  return {
    id: `land:${entry.ticket}:${entry.landedAt}`,
    type: "land",
    ticket: entry.ticket,
    agent: entry.agent,
    branch: entry.branch,
    commit: entry.commit,
    mergeCommit: entry.mergeCommit,
    notes: entry.notes,
    timestamp: entry.landedAt,
  };
}

function buildEventFromAgent(entry) {
  return {
    id: `register-agent:${entry.agent}:${entry.addedAt}`,
    type: "register-agent",
    agent: entry.agent,
    notes: `${entry.kind}${entry.notes ? ` - ${entry.notes}` : ""}`,
    timestamp: entry.addedAt,
  };
}

function buildEventFromBrief(entry) {
  const timestamp = new Date().toISOString();
  return {
    id: `brief:${entry.ticket}:${timestamp}`,
    type: "brief",
    ticket: entry.ticket,
    agent: entry.agent,
    notes: `${entry.title} (${entry.status})`,
    timestamp,
  };
}

function buildEventFromReview(entry) {
  return {
    id: `review:${entry.ticket}:${entry.reviewedAt}`,
    type: "review",
    ticket: entry.ticket,
    reviewer: entry.reviewer,
    mode: entry.mode,
    result: entry.result,
    branch: entry.branch,
    commit: entry.commit,
    summary: entry.summary,
    notes: entry.notes,
    timestamp: entry.reviewedAt,
  };
}

function attachLatestReview(items, ticket, review) {
  return items.map((item) =>
    item.ticket === ticket
      ? {
          ...item,
          latestReview: review,
        }
      : item,
  );
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }

  const parsed = parseArgs(argv);
  const dryRun = Boolean(parsed.dryRun);
  const state = await loadState();

  if (command === "complete") {
    const entry = buildCompleteEntry(parsed);
    state.inReview = upsertByKey(state.inReview, entry, "ticket");
    state.events = appendEvent(state, buildEventFromComplete(entry));

    await saveState(state, dryRun);
    await renderNotes(state, dryRun);
    console.log(`Recorded ${entry.ticket} as awaiting review for ${entry.agent}.`);
    return;
  }

  if (command === "land") {
    const ticket = getSingle(parsed, "ticket", { required: true });
    const existingEntry = state.inReview.find((entry) => entry.ticket === ticket) ?? null;
    const landedEntry = buildLandedEntry(parsed, existingEntry);

    state.inReview = removeByKey(state.inReview, "ticket", ticket);
    state.landed = upsertByKey(state.landed, landedEntry, "ticket");
    state.events = appendEvent(state, buildEventFromLand(landedEntry));

    await saveState(state, dryRun);
    await renderNotes(state, dryRun);
    console.log(`Recorded ${ticket} as landed.`);
    return;
  }

  if (command === "review") {
    const entry = buildReviewEntry(parsed);
    state.reviews = limitItems(upsertByKey(state.reviews, entry, "ticket"), 100);
    state.inReview = attachLatestReview(state.inReview, entry.ticket, entry);
    state.landed = attachLatestReview(state.landed, entry.ticket, entry);
    state.events = appendEvent(state, buildEventFromReview(entry));

    await saveState(state, dryRun);
    await renderNotes(state, dryRun);
    console.log(`Recorded ${entry.mode} review for ${entry.ticket} as ${entry.result}.`);
    return;
  }

  if (command === "commit") {
    const entry = buildCommitEntry(parsed);
    state.commits = limitItems(upsertByKey(state.commits, entry, "commit"), 200);
    state.events = appendEvent(state, entry);

    await saveState(state, dryRun);
    await renderNotes(state, dryRun);
    console.log(`Recorded commit ${entry.commit} for ${entry.repoName}.`);
    return;
  }

  if (command === "register-agent") {
    const entry = buildAgentEntry(parsed);
    state.agents = upsertByKey(state.agents, entry, "agent");
    state.events = appendEvent(state, buildEventFromAgent(entry));

    await saveState(state, dryRun);
    await renderNotes(state, dryRun);
    console.log(`Registered ${entry.agent} in the shared agent registry.`);
    return;
  }

  if (command === "brief") {
    const entry = buildBriefEntry(parsed);
    const briefPath = await writeTicketBrief(entry, dryRun);
    state.events = appendEvent(state, buildEventFromBrief(entry));

    await saveState(state, dryRun);
    await renderNotes(state, dryRun);
    console.log(`Updated ticket brief ${briefPath}.`);
    return;
  }

  if (command === "refresh") {
    await saveState(state, dryRun);
    await renderNotes(state, dryRun);
    console.log("Refreshed the auto-managed PawVital memory notes.");
    return;
  }

  fail(`Unknown command: ${command}\n\n${usage}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
