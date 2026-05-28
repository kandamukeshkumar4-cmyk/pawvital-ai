#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import gateRunnerLogic from "./shadow-readout-gate-runner-logic.cjs";

const {
  parseIssueSchedulerReports,
  parseSchedulerArtifactReport,
  summarizeGateRun,
} = gateRunnerLogic;

const DEFAULT_REPO = "kandamukeshkumar4-cmyk/pawvital-ai";
const DEFAULT_ISSUE = 495;
const DEFAULT_REF = "master";
const DEFAULT_WORKFLOW = "shadow-readout-scheduler.yml";
const DEFAULT_ARTIFACT_NAME = "vet-1492c-shadow-readout-scheduled-artifacts";
const DEFAULT_PRODUCTION_URL = "https://pawvital-ai.vercel.app";

function sanitizeForLogs(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|key)=([^&\s]+)/gi, "$1=[redacted]");
}

function takeValue(argv, index, flag) {
  const current = argv[index];
  if (current.includes("=")) return current.slice(current.indexOf("=") + 1);
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    issue: DEFAULT_ISSUE,
    ref: DEFAULT_REF,
    workflow: DEFAULT_WORKFLOW,
    artifactName: DEFAULT_ARTIFACT_NAME,
    productionUrl: DEFAULT_PRODUCTION_URL,
    vercelScope: process.env.VERCEL_SCOPE ?? null,
    commentsJson: null,
    artifactJson: null,
    output: null,
    triggerScheduler: false,
    preferArtifact: false,
    json: false,
    failOnHold: false,
    noVercel: false,
    waitSeconds: 0,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const flag = arg.split("=")[0];
    const needsValue = [
      "--repo",
      "--issue",
      "--ref",
      "--workflow",
      "--artifact-name",
      "--production-url",
      "--vercel-scope",
      "--comments-json",
      "--artifact-json",
      "--output",
      "--wait-seconds",
    ].includes(flag);

    if (needsValue) {
      const value = takeValue(argv, index, flag);
      if (!arg.includes("=")) index += 1;
      switch (flag) {
        case "--repo":
          options.repo = value;
          break;
        case "--issue":
          options.issue = Number(value);
          break;
        case "--ref":
          options.ref = value;
          break;
        case "--workflow":
          options.workflow = value;
          break;
        case "--artifact-name":
          options.artifactName = value;
          break;
        case "--production-url":
          options.productionUrl = value;
          break;
        case "--vercel-scope":
          options.vercelScope = value;
          break;
        case "--comments-json":
          options.commentsJson = value;
          break;
        case "--artifact-json":
          options.artifactJson = value;
          break;
        case "--output":
          options.output = value;
          break;
        case "--wait-seconds":
          options.waitSeconds = Number(value);
          break;
      }
      continue;
    }

    switch (arg) {
      case "--trigger-scheduler":
        options.triggerScheduler = true;
        break;
      case "--prefer-artifact":
        options.preferArtifact = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--fail-on-hold":
        options.failOnHold = true;
        break;
      case "--no-vercel":
        options.noVercel = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.issue)) {
    throw new Error("--issue must be a number");
  }
  if (!Number.isFinite(options.waitSeconds) || options.waitSeconds < 0) {
    throw new Error("--wait-seconds must be a non-negative number");
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/shadow-readout-gate-runner.mjs [options]

Options:
  --trigger-scheduler       Dispatch the Shadow Readout Scheduler workflow first
  --wait-seconds <n>        Poll the dispatched scheduler run for up to n seconds
  --prefer-artifact         Prefer the latest scheduler artifact over issue text
  --comments-json <path>    Read issue comments from a local JSON fixture
  --artifact-json <path>    Read a scheduler JSON artifact from disk
  --json                    Print machine-readable JSON
  --output <path>           Write the summary JSON to a file
  --fail-on-hold            Exit 2 when the decision is HOLD
  --no-vercel               Skip vercel inspect and use GitHub commit status only
  --repo <owner/repo>       Default: ${DEFAULT_REPO}
  --issue <number>          Default: ${DEFAULT_ISSUE}
  --ref <ref>               Default: ${DEFAULT_REF}
  --workflow <file>         Default: ${DEFAULT_WORKFLOW}
  --production-url <url>    Default: ${DEFAULT_PRODUCTION_URL}
`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`${command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${sanitizeForLogs(
        result.stderr || result.stdout
      ).slice(0, 1000)}`
    );
  }

  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runGhJson(args) {
  const result = runCommand("gh", args);
  return JSON.parse(result.stdout);
}

function flattenPaginatedResponse(value) {
  if (!Array.isArray(value)) return [];
  if (value.every((entry) => Array.isArray(entry))) return value.flat();
  return value;
}

function loadComments(options) {
  if (options.commentsJson) {
    return JSON.parse(fs.readFileSync(options.commentsJson, "utf8"));
  }

  const endpoint = `repos/${options.repo}/issues/${options.issue}/comments?per_page=100`;
  try {
    return flattenPaginatedResponse(
      runGhJson(["api", "--paginate", "--slurp", endpoint])
    );
  } catch {
    return runGhJson(["api", endpoint]);
  }
}

function parseVercelInspectOutput(stdout) {
  const status =
    stdout.match(/^\s*Status\s+(?:[^\w\r\n]+)?([A-Za-z]+)/im)?.[1] ??
    stdout.match(/^\s*state\s+(?:[^\w\r\n]+)?([A-Za-z]+)/im)?.[1] ??
    null;
  const deploymentId = stdout.match(/\b(dpl_[A-Za-z0-9]+)/)?.[1] ?? null;
  const deploymentUrl =
    stdout.match(/https:\/\/[^\s]+\.vercel\.app/)?.[0] ?? null;
  return { status, deploymentId, deploymentUrl };
}

function inspectVercel(options) {
  if (options.noVercel) return null;

  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npx";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx", "vercel", "inspect", options.productionUrl]
      : ["vercel", "inspect", options.productionUrl];
  if (options.vercelScope) {
    args.push("--scope", options.vercelScope);
  }

  const result = runCommand(command, args, { allowFailure: true });
  if (result.status !== 0) {
    return {
      status: null,
      deploymentId: null,
      deploymentUrl: options.productionUrl,
      error: sanitizeForLogs(result.stderr || result.stdout).slice(0, 500),
    };
  }

  return parseVercelInspectOutput(`${result.stdout}\n${result.stderr}`);
}

function fetchProductionStatus(options) {
  const commitStatus = runGhJson([
    "api",
    `repos/${options.repo}/commits/${options.ref}/status`,
  ]);
  const vercel = inspectVercel(options);

  return {
    sha: commitStatus.sha ?? "unknown",
    deploymentStatus: vercel?.status ?? commitStatus.state ?? "unknown",
    deploymentUrl: vercel?.deploymentUrl ?? options.productionUrl,
    deploymentId: vercel?.deploymentId ?? null,
    githubState: commitStatus.state ?? "unknown",
    vercelError: vercel?.error ?? null,
  };
}

function triggerScheduler(options) {
  runCommand("gh", [
    "workflow",
    "run",
    options.workflow,
    "--repo",
    options.repo,
    "--ref",
    options.ref,
    "-f",
    "force=true",
  ]);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function listWorkflowRuns(options) {
  return runGhJson([
    "run",
    "list",
    "--repo",
    options.repo,
    "--workflow",
    options.workflow,
    "--branch",
    options.ref,
    "--limit",
    "5",
    "--json",
    "databaseId,status,conclusion,createdAt,headSha,url",
  ]);
}

function waitForSchedulerRun(options, startedAt) {
  const deadline = Date.now() + options.waitSeconds * 1000;
  let latest = null;

  while (Date.now() <= deadline) {
    const runs = listWorkflowRuns(options);
    latest =
      runs.find((run) => Date.parse(run.createdAt) >= startedAt - 60_000) ??
      runs[0] ??
      null;

    if (latest?.status === "completed") return latest;
    sleep(10_000);
  }

  return latest;
}

function findJsonArtifactFile(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findJsonArtifactFile(fullPath);
      if (nested) return nested;
    } else if (/scheduled-readout\.json$/i.test(entry.name)) {
      return fullPath;
    }
  }
  return null;
}

function downloadSchedulerArtifact(options, runId) {
  const artifactDir = path.join(
    os.tmpdir(),
    `pawvital-shadow-readout-${runId}-${Date.now()}`
  );
  fs.mkdirSync(artifactDir, { recursive: true });
  runCommand("gh", [
    "run",
    "download",
    String(runId),
    "--repo",
    options.repo,
    "-n",
    options.artifactName,
    "-D",
    artifactDir,
  ]);

  const jsonPath = findJsonArtifactFile(artifactDir);
  if (!jsonPath) {
    throw new Error(`No scheduled-readout JSON artifact found under ${artifactDir}`);
  }
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

function loadArtifactReport(options, schedulerRun) {
  if (options.artifactJson) {
    return parseSchedulerArtifactReport(
      JSON.parse(fs.readFileSync(options.artifactJson, "utf8")),
      "artifact_file"
    );
  }

  if (!options.preferArtifact) return null;

  const run = schedulerRun ?? listWorkflowRuns(options)[0];
  if (!run?.databaseId || run.status !== "completed") return null;
  return parseSchedulerArtifactReport(
    downloadSchedulerArtifact(options, run.databaseId),
    "github_artifact"
  );
}

function reportsWithArtifact(commentsReports, artifactReport) {
  if (!artifactReport) return commentsReports;
  if (!artifactReport.generatedAt) return [...commentsReports, artifactReport];
  const artifactTime = Date.parse(artifactReport.generatedAt);
  const previousReports = commentsReports.filter((report) => {
    const reportTime = Date.parse(report.generatedAt ?? report.commentCreatedAt ?? "");
    return Number.isFinite(reportTime) ? reportTime < artifactTime : true;
  });
  return [...previousReports, artifactReport];
}

function formatHumanSummary(summary) {
  return [
    "Shadow readout gate",
    `production_sha: ${summary.production_sha}`,
    `production_deployment_status: ${summary.production_deployment_status}`,
    `production_deployment_url: ${summary.production_deployment_url ?? "n/a"}`,
    `scheduler_status: ${summary.scheduler_status ?? "n/a"}`,
    `scheduler_comment_id: ${summary.scheduler_comment_id ?? "n/a"}`,
    `scheduler_generated_at: ${summary.scheduler_generated_at ?? "n/a"}`,
    `report_count: ${summary.report_count}`,
    `previous_report_count: ${summary.previous_report_count ?? "n/a"}`,
    `report_count_delta: ${summary.report_count_delta ?? "n/a"}`,
    `latest_window_report_created_at: ${
      summary.latest_window_report_created_at ?? "n/a"
    }`,
    `observation_count: ${summary.observation_count}`,
    `second_opinion_trace: requested=${summary.second_opinion_trace.requested}, not_requested=${summary.second_opinion_trace.not_requested}`,
    `shadow_comparison_count: ${summary.shadow_comparison_count}`,
    `warning: ${summary.warning ?? "null"}`,
    `decision: ${summary.decision.text}`,
  ].join("\n");
}

function writeOutput(filePath, summary) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const schedulerStartedAt = Date.now();
  if (options.triggerScheduler) {
    triggerScheduler(options);
  }
  const schedulerRun =
    options.triggerScheduler && options.waitSeconds > 0
      ? waitForSchedulerRun(options, schedulerStartedAt)
      : null;
  if (
    options.triggerScheduler &&
    options.waitSeconds > 0 &&
    schedulerRun?.status !== "completed"
  ) {
    throw new Error("Timed out waiting for the Shadow Readout Scheduler run to complete");
  }
  if (
    options.triggerScheduler &&
    schedulerRun?.status === "completed" &&
    schedulerRun.conclusion &&
    schedulerRun.conclusion !== "success"
  ) {
    throw new Error(
      `Shadow Readout Scheduler completed with conclusion ${schedulerRun.conclusion}`
    );
  }

  const production = fetchProductionStatus(options);
  const commentsReports = parseIssueSchedulerReports(loadComments(options));
  const artifactReport = loadArtifactReport(options, schedulerRun);
  const summary = summarizeGateRun({
    production,
    reports: reportsWithArtifact(commentsReports, artifactReport),
  });

  if (production.deploymentId) {
    summary.production_deployment_id = production.deploymentId;
  }
  if (production.githubState) {
    summary.production_github_state = production.githubState;
  }
  if (production.vercelError) {
    summary.production_vercel_error = production.vercelError;
  }
  if (schedulerRun) {
    summary.scheduler_run = schedulerRun;
  }

  if (options.output) writeOutput(options.output, summary);
  console.log(options.json ? JSON.stringify(summary, null, 2) : formatHumanSummary(summary));

  if (options.failOnHold && summary.decision.status !== "GO") {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(sanitizeForLogs(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
