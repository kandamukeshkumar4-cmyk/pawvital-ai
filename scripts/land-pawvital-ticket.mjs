#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const sourceRepo = repoRoot;
const targetRepo = path.join(workspaceRoot, "pawvital-ai-codex");
const memoryScript = path.join(sourceRepo, "scripts", "update-pawvital-memory.mjs");
const vercelProjectConfigPath = path.join(sourceRepo, ".vercel", "project.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    if (key === "dry-run" || key === "push" || key === "no-push" || key === "json") {
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

function getMany(parsed, key) {
  return (parsed[key] ?? []).map((value) => String(value).trim()).filter(Boolean);
}

function run(command, args, cwd, { allowFailure = false, capture = true } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });

  if (result.status !== 0 && !allowFailure) {
    const stderr = (result.stderr || result.stdout || "").trim();
    fail(`${command} ${args.join(" ")} failed${stderr ? `\n${stderr}` : ""}`);
  }

  return result;
}

function envFlagDisabled(name) {
  return /^(0|false|no|off)$/i.test(String(process.env[name] ?? "").trim());
}

function ensureCleanRepo(cwd) {
  const status = run("git", ["status", "--porcelain"], cwd);
  if (status.stdout.trim()) {
    fail(`Target repo is not clean: ${cwd}`);
  }
}

function getCommitSubject(cwd, ref) {
  return run("git", ["log", "-1", "--format=%s", ref], cwd).stdout.trim();
}

function getCommitCount(cwd, range) {
  return Number(run("git", ["rev-list", "--count", range], cwd).stdout.trim() || "0");
}

function getLandingPlan(branch, commit, ticket) {
  const branchRef = String(branch || "").trim();
  if (!branchRef) {
    return {
      mode: "cherry-pick",
      sourceRef: commit,
      commitMessage: getCommitSubject(sourceRepo, commit),
      details: `single commit ${commit}`,
    };
  }

  run("git", ["fetch", "origin", "master"], sourceRepo, { capture: false });
  run("git", ["rev-parse", "--verify", branchRef], sourceRepo);

  const mergeBase = run("git", ["merge-base", "origin/master", branchRef], sourceRepo).stdout.trim();
  if (!mergeBase) {
    return {
      mode: "cherry-pick",
      sourceRef: commit,
      commitMessage: getCommitSubject(sourceRepo, commit),
      details: `single commit ${commit}`,
    };
  }

  const range = `${mergeBase}..${commit}`;
  const commitCount = getCommitCount(sourceRepo, range);
  if (commitCount <= 0) {
    fail(`No branch-only commits found to land for ${branchRef} (${ticket}).`);
  }

  const defaultMessage =
    commitCount === 1
      ? getCommitSubject(sourceRepo, commit)
      : `feat: land ${ticket.toLowerCase()} reviewed branch delta`;

  return {
    mode: "patch",
    mergeBase,
    sourceRef: commit,
    range,
    commitCount,
    commitMessage: defaultMessage,
    details: `${branchRef} (${commitCount} commit${commitCount === 1 ? "" : "s"}) from ${mergeBase}..${commit}`,
  };
}

function applyLandingPlan(plan, cwd) {
  if (plan.mode === "cherry-pick") {
    run("git", ["cherry-pick", plan.sourceRef], cwd, { capture: false });
    return run("git", ["rev-parse", "HEAD"], cwd).stdout.trim();
  }

  const patchDir = fs.mkdtempSync(path.join(os.tmpdir(), "pawvital-land-"));
  const patchPath = path.join(patchDir, "landing.patch");

  try {
    const diff = run("git", ["diff", "--binary", plan.range], sourceRepo).stdout;
    if (!diff.trim()) {
      fail(`No diff produced for landing plan ${plan.details}`);
    }

    fs.writeFileSync(patchPath, diff, "utf8");

    const applyResult = run("git", ["apply", "--3way", "--index", patchPath], cwd, {
      allowFailure: true,
    });
    if (applyResult.status !== 0) {
      const stderr = (applyResult.stderr || applyResult.stdout || "").trim();
      fail(`git apply --3way failed for ${plan.details}${stderr ? `\n${stderr}` : ""}`);
    }

    const stagedDiff = run("git", ["diff", "--cached", "--quiet"], cwd, { allowFailure: true });
    if (stagedDiff.status === 0) {
      fail(`Landing plan ${plan.details} produced no staged changes.`);
    }

    run("git", ["commit", "-m", plan.commitMessage], cwd, { capture: false });
    return run("git", ["rev-parse", "HEAD"], cwd).stdout.trim();
  } finally {
    fs.rmSync(patchDir, { recursive: true, force: true });
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toWindowsPath(value) {
  const resolved = path.resolve(value);
  if (/^[A-Za-z]:\\/.test(resolved)) {
    return resolved;
  }

  const normalized = resolved.replace(/\\/g, "/");
  const match = normalized.match(/^\/mnt\/([a-z])\/(.*)$/i);
  if (!match) {
    fail(`Unable to convert path to Windows format: ${value}`);
  }

  return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, "\\")}`;
}

function runVercel(args, { allowFailure = false } = {}) {
  if (process.platform === "win32") {
    return run("npx.cmd", ["vercel", ...args], sourceRepo, { allowFailure, capture: true });
  }

  const sourceRepoWin = toWindowsPath(sourceRepo);
  const serializedArgs = args.map((arg) => psQuote(arg)).join(", ");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `Set-Location -LiteralPath ${psQuote(sourceRepoWin)}`,
    `$argsList = @(${serializedArgs})`,
    "& npx vercel @argsList",
  ].join("; ");

  return run("powershell.exe", ["-NoProfile", "-Command", script], sourceRepo, {
    allowFailure,
    capture: true,
  });
}

function readProjectName() {
  try {
    const raw = fs.readFileSync(vercelProjectConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return String(parsed.projectName || "").trim() || "pawvital-ai";
  } catch {
    return "pawvital-ai";
  }
}

function parseFirstDeploymentUrl(text) {
  const matches = text.match(/https:\/\/[^\s]+\.vercel\.app/g) ?? [];
  return matches[0] ?? "";
}

function parseDeploymentStatus(text) {
  const match = text.match(/status\s+●\s+([A-Za-z]+)/i) || text.match(/status\s+([A-Za-z]+)/i);
  return match ? match[1].toLowerCase() : "";
}

function trimLogs(text, maxLines = 40) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return lines.slice(-maxLines).join("\n");
}

async function waitForProductionDeployment(projectName, timeoutMs = 360000, pollMs = 8000) {
  let deploymentUrl = "";
  let inspectOutput = "";

  await sleep(5000);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ls = runVercel(["ls", projectName, "--yes"], { allowFailure: true });
    const lsOutput = `${ls.stdout || ""}\n${ls.stderr || ""}`;
    const latestUrl = parseFirstDeploymentUrl(lsOutput);
    if (latestUrl) {
      deploymentUrl = latestUrl;
    }

    if (deploymentUrl) {
      const inspect = runVercel(["inspect", deploymentUrl], { allowFailure: true });
      inspectOutput = `${inspect.stdout || ""}\n${inspect.stderr || ""}`.trim();
      const status = parseDeploymentStatus(inspectOutput);

      if (status === "ready") {
        return {
          status: "ready",
          url: deploymentUrl,
          details: trimLogs(inspectOutput, 20),
        };
      }

      if (status === "error" || status === "failed" || status === "canceled") {
        const logs = runVercel(["inspect", deploymentUrl, "--logs"], { allowFailure: true });
        const logOutput = `${logs.stdout || ""}\n${logs.stderr || ""}`.trim();
        return {
          status,
          url: deploymentUrl,
          details: trimLogs(logOutput || inspectOutput, 60),
        };
      }
    }

    await sleep(pollMs);
  }

  return {
    status: "timeout",
    url: deploymentUrl,
    details: trimLogs(inspectOutput, 30),
  };
}

function buildMemoryArgs(parsed, mergeCommit, deploymentNote) {
  const args = [
    memoryScript,
    "land",
    "--ticket",
    getSingle(parsed, "ticket", true),
    "--merge-commit",
    mergeCommit,
  ];

  const passthroughSingles = ["agent", "branch", "commit"];
  for (const key of passthroughSingles) {
    const value = getSingle(parsed, key, false);
    if (value) {
      args.push(`--${key}`, value);
    }
  }

  for (const review of getMany(parsed, "review")) {
    args.push("--review", review);
  }

  for (const summary of getMany(parsed, "summary")) {
    args.push("--summary", summary);
  }

  for (const verification of getMany(parsed, "verification")) {
    args.push("--verification", verification);
  }

  const notes = [getSingle(parsed, "notes", false), deploymentNote].filter(Boolean).join(" | ");
  if (notes) {
    args.push("--notes", notes);
  }

  return args;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(parsed["dry-run"]);
  const jsonMode = Boolean(parsed.json);
  const shouldPush = parsed.push ? true : parsed["no-push"] ? false : !envFlagDisabled("PAWVITAL_AUTO_PUSH_TO_PROD");
  const ticket = getSingle(parsed, "ticket", true);
  const commit = getSingle(parsed, "commit", true);
  const branchRef = getSingle(parsed, "branch", false);
  const landingPlan = getLandingPlan(branchRef, commit, ticket);

  const dryRunResult = {
    ticket,
    mergeCommit: commit,
    pushed: shouldPush,
    strategy: landingPlan.mode,
    landingPlan: landingPlan.details,
    deployment: {
      status: shouldPush ? "would-verify" : "skipped",
      url: "",
    },
    dryRun: true,
  };

  if (dryRun) {
    if (jsonMode) {
      console.log(JSON.stringify(dryRunResult));
    } else {
      console.log(
        `Dry run: would land ${landingPlan.details} into ${targetRepo}${shouldPush ? ", push origin/master, wait for Vercel production to become ready," : " (push skipped),"} and mark ${ticket} as landed.`,
      );
    }
    return;
  }

  ensureCleanRepo(targetRepo);

  const branch = run("git", ["branch", "--show-current"], targetRepo).stdout.trim();
  if (branch !== "master") {
    fail(`Target repo must be on master before landing. Current branch: ${branch}`);
  }

  run("git", ["pull", "--ff-only", "origin", "master"], targetRepo, { capture: false });
  const mergeCommit = applyLandingPlan(landingPlan, targetRepo);

  let deployment = {
    status: shouldPush ? "pending" : "skipped",
    url: "",
    details: "",
  };

  if (shouldPush) {
    run("git", ["push", "origin", "master"], targetRepo, { capture: false });
    deployment = await waitForProductionDeployment(readProjectName());
    if (deployment.status !== "ready") {
      fail(
        `Production deployment ${deployment.status} for ${ticket}${deployment.url ? `\n${deployment.url}` : ""}${deployment.details ? `\n\n${deployment.details}` : ""}`,
      );
    }
  }

  const deploymentNote = shouldPush
    ? `Production deploy ready: ${deployment.url}`
    : "Production push skipped";
  run("node", buildMemoryArgs(parsed, mergeCommit, deploymentNote), sourceRepo, { capture: false });

  const result = {
    ticket,
    mergeCommit,
    pushed: shouldPush,
    strategy: landingPlan.mode,
    landingPlan: landingPlan.details,
    deployment,
    dryRun: false,
  };

  if (jsonMode) {
    console.log(JSON.stringify(result));
  } else {
    console.log(
      `Landed ${ticket} into master at ${mergeCommit}${shouldPush ? `, pushed origin/master, and verified Vercel production at ${deployment.url}.` : " (push skipped)."}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
