#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const finalizeScript = path.join(repoRoot, "scripts", "finalize-pawvital-ticket.mjs");

const usage = `Kilo-friendly PawVital ticket finalizer.

Usage:
  node scripts/kilo-finalize-ticket.mjs --ticket <id> --agent <name> --summary <text> [--summary <text> ...] --verification <text> [--verification <text> ...] [--notes <text>] [--goal <text>] [--review-type <normal|adversarial>] [--no-land] [--push|--no-push] [--dry-run] [--json]

What it does:
  - infers the current branch from git
  - infers the current HEAD commit from git
  - forwards everything into finalize-pawvital-ticket.mjs

Example:
  node scripts/kilo-finalize-ticket.mjs --ticket VET-710 --agent test-engineer --summary "Added replay and compression regressions." --verification "npx jest tests/symptom-chat.route.test.ts --silent" --verification "npm run build"
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    if (["dry-run", "push", "no-push", "no-land", "json"].includes(key)) {
      parsed[key] = true;
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

function getSingle(parsed, key, required = false) {
  const values = parsed[key];
  if (!values || values.length === 0) {
    if (required) {
      fail(`Missing required --${key}`);
    }
    return "";
  }
  return String(values[values.length - 1]).trim();
}

function getMany(parsed, key, required = false) {
  const values = (parsed[key] ?? []).map((value) => String(value).trim()).filter(Boolean);
  if (required && values.length === 0) {
    fail(`Missing required --${key}`);
  }
  return values;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || "").trim();
    fail(`git ${args.join(" ")} failed${stderr ? `\n${stderr}` : ""}`);
  }

  return (result.stdout || "").trim();
}

function inferReviewType(agent) {
  if (/review|skeptic|clinical|guard|deploy/i.test(agent)) {
    return "adversarial";
  }
  return "normal";
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

const parsed = parseArgs(process.argv.slice(2));

const ticket = getSingle(parsed, "ticket", true);
const agent = getSingle(parsed, "agent", true);
const summaries = getMany(parsed, "summary", true);
const verifications = getMany(parsed, "verification", true);
const notes = getSingle(parsed, "notes", false);
const goal = getSingle(parsed, "goal", false);
const reviewType = getSingle(parsed, "review-type", false) || inferReviewType(agent);

const branch = runGit(["branch", "--show-current"]);
if (!branch) {
  fail("Unable to infer current git branch. Do not run this from a detached HEAD.");
}

const commit = runGit(["rev-parse", "HEAD"]);
if (!commit) {
  fail("Unable to infer current HEAD commit.");
}

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

if (goal) {
  args.push("--goal", goal);
}

if (parsed["dry-run"]) {
  args.push("--dry-run");
}

if (parsed["json"]) {
  args.push("--json");
}

if (parsed["no-land"]) {
  args.push("--no-land");
}

if (parsed["push"]) {
  args.push("--push");
}

if (parsed["no-push"]) {
  args.push("--no-push");
}

const result = spawnSync("node", args, {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
