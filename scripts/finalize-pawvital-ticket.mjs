#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const memoryScript = path.join(repoRoot, "scripts", "update-pawvital-memory.mjs");
const landScript = path.join(repoRoot, "scripts", "land-pawvital-ticket.mjs");
const reviewSchemaPath = path.join(repoRoot, "scripts", "codex-review-result.schema.json");

const usage = `Finalize a PawVital ticket with shared-memory logging, WSL Codex review, and optional landing.

Usage:
  node scripts/finalize-pawvital-ticket.mjs --ticket <id> --agent <name> --branch <branch> --commit <sha> --summary <text> [--summary <text> ...] --verification <text> [--verification <text> ...] [--goal <text>] [--notes <text>] [--review-type <normal|adversarial>] [--review-prompt <text>] [--no-land] [--push|--no-push] [--skip-complete] [--json] [--dry-run]

Examples:
  node scripts/finalize-pawvital-ticket.mjs --ticket VET-709 --agent BackendReliability --branch qwen/vet-709-pending-recovery-families-v1 --commit abc123 --summary "Expanded duration and yes/no pending recovery." --verification "npx jest tests/symptom-chat.route.test.ts --silent" --verification "npm run build"
  node scripts/finalize-pawvital-ticket.mjs --ticket VET-709 --agent BackendReliability --branch qwen/vet-709-pending-recovery-families-v1 --commit abc123 --review-type adversarial --skip-complete --no-land
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
    if (["dry-run", "push", "skip-complete", "no-land", "json", "no-push"].includes(key)) {
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

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function toWslPath(value) {
  const normalized = path.resolve(value).replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return normalized;
  }
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!match) {
    fail(`Unable to convert path to WSL format: ${value}`);
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function run(command, args, cwd, { capture = true, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0 && !allowFailure) {
    const stderr = (result.stderr || result.stdout || "").trim();
    fail(`${command} ${args.join(" ")} failed${stderr ? `\n${stderr}` : ""}`);
  }

  return result;
}

function buildReviewPrompt({ ticket, commit, branch, reviewType, reviewPrompt }) {
  const modeGuidance =
    reviewType === "adversarial"
      ? "Be skeptical and actively search for hidden assumptions, subtle regressions, risky edge cases, and scope creep."
      : "Do a normal careful code review focused on correctness, regressions, and landing safety.";

  const extra = reviewPrompt ? `\nAdditional focus:\n${reviewPrompt}\n` : "";

  return `You are reviewing commit ${commit} for PawVital ticket ${ticket} on branch ${branch}.

Work in the current git repository and inspect the commit directly with git commands before deciding.

Landing rules:
- deterministic clinical logic must remain the source of truth
- user-facing payload shape should not drift without justification
- telemetry must stay internal unless explicitly intended
- compression must not become the authority over protected control state
- hidden regressions in route.ts, triage-engine.ts, symptom-memory.ts, clinical-matrix.ts, tests, deploy, and billing-sensitive code should block landing
- return "pass" only if the commit is ready to land into master with no actionable findings
- return "fail" if any fix should happen before landing

${modeGuidance}${extra}
Return concise findings. If there are no actionable findings, findings should be an empty array.`;
}

async function runCodexReview({ ticket, commit, branch, reviewType, reviewPrompt, dryRun }) {
  if (dryRun) {
    return {
      result: "pass",
      summary: `Dry run: would run ${reviewType} Codex review for ${ticket} (${commit}).`,
      findings: [],
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pawvital-codex-review-"));
  const promptPath = path.join(tempDir, "prompt.txt");
  const outputPath = path.join(tempDir, "result.json");

  try {
    await fs.writeFile(
      promptPath,
      `${buildReviewPrompt({ ticket, commit, branch, reviewType, reviewPrompt })}\n`,
      "utf8",
    );

    const repoRootTarget = toWslPath(repoRoot);
    const promptPathTarget = toWslPath(promptPath);
    const outputPathTarget = toWslPath(outputPath);
    const reviewSchemaPathTarget = toWslPath(reviewSchemaPath);

    const bashCommand = [
      `cd ${shQuote(repoRootTarget)}`,
      `cat ${shQuote(promptPathTarget)} | codex exec --skip-git-repo-check --output-schema ${shQuote(reviewSchemaPathTarget)} --output-last-message ${shQuote(outputPathTarget)} -`,
    ].join(" && ");

    const result =
      process.platform === "win32"
        ? run(
            "wsl.exe",
            ["-d", "Ubuntu", "--", "bash", "-lc", bashCommand],
            repoRoot,
            { capture: true, allowFailure: false },
          )
        : run("bash", ["-lc", bashCommand], repoRoot, {
            capture: true,
            allowFailure: false,
          });

    if (!(await fs.stat(outputPath).catch(() => null))) {
      const stderr = (result.stderr || result.stdout || "").trim();
      fail(`Codex review did not produce a result file.${stderr ? `\n${stderr}` : ""}`);
    }

    const raw = await fs.readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!["pass", "fail"].includes(parsed.result)) {
      fail(`Unexpected Codex review result: ${raw}`);
    }

    parsed.findings = Array.isArray(parsed.findings)
      ? parsed.findings.map((finding) => String(finding).trim()).filter(Boolean)
      : [];

    return parsed;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildCompleteArgs(parsed, dryRun) {
  const args = [
    memoryScript,
    "complete",
    "--ticket",
    getSingle(parsed, "ticket", true),
    "--agent",
    getSingle(parsed, "agent", true),
    "--branch",
    getSingle(parsed, "branch", true),
    "--commit",
    getSingle(parsed, "commit", true),
  ];

  for (const summary of getMany(parsed, "summary", true)) {
    args.push("--summary", summary);
  }

  for (const verification of getMany(parsed, "verification", true)) {
    args.push("--verification", verification);
  }

  const goal = getSingle(parsed, "goal", false);
  if (goal) {
    args.push("--goal", goal);
  }

  const notes = getSingle(parsed, "notes", false);
  if (notes) {
    args.push("--notes", notes);
  }

  if (dryRun) {
    args.push("--dry-run");
  }

  return args;
}

function buildReviewArgs({ ticket, reviewer, reviewType, reviewResult, branch, commit, notes, dryRun }) {
  const args = [
    memoryScript,
    "review",
    "--ticket",
    ticket,
    "--reviewer",
    reviewer,
    "--mode",
    reviewType,
    "--result",
    reviewResult.result,
    "--summary",
    reviewResult.summary,
  ];

  if (branch) {
    args.push("--branch", branch);
  }

  if (commit) {
    args.push("--commit", commit);
  }

  for (const finding of reviewResult.findings) {
    args.push("--finding", finding);
  }

  if (notes) {
    args.push("--notes", notes);
  }

  if (dryRun) {
    args.push("--dry-run");
  }

  return args;
}

function buildLandArgs(parsed, reviewType, reviewer, reviewResult, dryRun) {
  const args = [
    landScript,
    "--ticket",
    getSingle(parsed, "ticket", true),
    "--commit",
    getSingle(parsed, "commit", true),
    "--agent",
    getSingle(parsed, "agent", true),
    "--branch",
    getSingle(parsed, "branch", true),
    "--review",
    `${reviewer} ${reviewType} review: ${reviewResult.summary}`,
  ];

  const notes = getSingle(parsed, "notes", false);
  if (notes) {
    args.push("--notes", notes);
  }

  for (const finding of reviewResult.findings) {
    args.push("--review", `${reviewer} finding: ${finding}`);
  }

  if (parsed.push) {
    args.push("--push");
  } else if (parsed["no-push"]) {
    args.push("--no-push");
  }

  if (parsed["skip-complete"]) {
    for (const summary of getMany(parsed, "summary", false)) {
      args.push("--summary", summary);
    }

    for (const verification of getMany(parsed, "verification", false)) {
      args.push("--verification", verification);
    }
  }

  if (parsed.json) {
    args.push("--json");
  }

  if (dryRun) {
    args.push("--dry-run");
  }

  return args;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (Object.keys(parsed).length === 0) {
    console.log(usage);
    return;
  }

  const dryRun = Boolean(parsed["dry-run"]);
  const skipComplete = Boolean(parsed["skip-complete"]);
  const noLand = Boolean(parsed["no-land"]);
  const jsonMode = Boolean(parsed.json);
  const ticket = getSingle(parsed, "ticket", true);
  const agent = getSingle(parsed, "agent", true);
  const branch = getSingle(parsed, "branch", true);
  const commit = getSingle(parsed, "commit", true);
  const reviewType = (getSingle(parsed, "review-type", false) || "normal").toLowerCase();
  const reviewPrompt = getSingle(parsed, "review-prompt", false);

  if (!["normal", "adversarial"].includes(reviewType)) {
    fail("--review-type must be normal or adversarial");
  }

  if (!skipComplete) {
    getMany(parsed, "summary", true);
    getMany(parsed, "verification", true);
    run("node", buildCompleteArgs(parsed, dryRun), repoRoot, { capture: jsonMode });
  }

  const reviewer =
    getSingle(parsed, "reviewer", false) ||
    (reviewType === "adversarial" ? "codex-adversarial-reviewer" : "codex-reviewer");

  const reviewResult = await runCodexReview({
    ticket,
    commit,
    branch,
    reviewType,
    reviewPrompt,
    dryRun,
  });

  run(
    "node",
    buildReviewArgs({
      ticket,
      reviewer,
      reviewType,
      reviewResult,
      branch,
      commit,
      notes: getSingle(parsed, "notes", false),
      dryRun,
    }),
    repoRoot,
    { capture: jsonMode },
  );

  let landingResult = null;
  if (reviewResult.result === "pass" && !noLand) {
    const landProcess = run("node", buildLandArgs(parsed, reviewType, reviewer, reviewResult, dryRun), repoRoot, {
      capture: jsonMode,
    });
    if (jsonMode) {
      try {
        landingResult = JSON.parse((landProcess.stdout || "").trim());
      } catch {
        fail(`Landing output was not valid JSON for ${ticket}.`);
      }
    }
  }

  const outcome = {
    ticket,
    agent,
    branch,
    commit,
    reviewer,
    reviewType,
    reviewResult: reviewResult.result,
    reviewSummary: reviewResult.summary,
    findings: reviewResult.findings,
    dryRun,
    landed: reviewResult.result === "pass" && !noLand,
    landing: landingResult,
    landingState:
      reviewResult.result !== "pass"
        ? "blocked"
        : noLand
          ? "skipped"
          : dryRun
            ? "would-land"
            : "landed",
  };

  if (jsonMode) {
    console.log(JSON.stringify(outcome));
  } else {
    const lines = [
      `${ticket} finalization ${dryRun ? "dry run" : "complete"}`,
      "",
      `Agent: ${agent}`,
      `Branch: ${branch}`,
      `Commit: ${commit}`,
      `Reviewer: ${reviewer}`,
      `Review type: ${reviewType}`,
      `Review result: ${reviewResult.result.toUpperCase()}`,
      `Review summary: ${reviewResult.summary}`,
    ];

    if (reviewResult.findings.length) {
      lines.push("Findings:");
      for (const finding of reviewResult.findings) {
        lines.push(`- ${finding}`);
      }
    }

    if (reviewResult.result === "pass" && noLand) {
      lines.push("Landing: skipped by --no-land");
    } else if (reviewResult.result === "pass") {
      lines.push(
        `Landing: ${dryRun ? (parsed["no-push"] ? "would land automatically (push skipped)" : "would land, push, and verify production automatically") : parsed["no-push"] ? "landed automatically (push skipped)" : "landed, pushed, and verified production automatically"}`,
      );
    } else {
      lines.push("Landing: blocked by review result");
    }

    console.log(lines.join("\n"));
  }

  if (reviewResult.result !== "pass" && !dryRun) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
