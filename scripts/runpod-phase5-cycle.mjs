import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const nodeBin = process.execPath;
const defaultTimeoutMs = 45 * 60_000;

function loadEnvFiles() {
  for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) continue;

    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function parseArgs(argv) {
  const options = {
    confirm: argv.includes("--confirm"),
    dryRun: argv.includes("--dry-run"),
    keepRunning: argv.includes("--keep-running"),
    skipLoadTest: argv.includes("--skip-load-test"),
    watch: argv.includes("--watch"),
    timeoutMs: defaultTimeoutMs,
    watchIntervalMs: 5 * 60_000,
    baselineOutputPath: path.join(rootDir, "plans", "phase5-shadow-baseline.md"),
  };

  options.stopAfter = argv.includes("--stop-after") || !options.keepRunning;

  for (const arg of argv) {
    if (arg.startsWith("--timeout-minutes=")) {
      options.timeoutMs = Math.max(
        1,
        Number(arg.slice("--timeout-minutes=".length)) || 45
      ) * 60_000;
    } else if (arg.startsWith("--watch-interval-seconds=")) {
      options.watchIntervalMs = Math.max(
        5,
        Number(arg.slice("--watch-interval-seconds=".length)) || 300
      ) * 1000;
    } else if (arg.startsWith("--baseline-output=")) {
      options.baselineOutputPath = path.resolve(
        rootDir,
        arg.slice("--baseline-output=".length)
      );
    }
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    shell: false,
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    const stderr = options.capture ? result.stderr || "" : "";
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status ?? 1}${stderr ? `: ${stderr.trim()}` : ""}`
    );
  }

  return result;
}

function runNodeScript(scriptPath, args = [], capture = false) {
  return run(nodeBin, [scriptPath, ...args], { capture });
}

function readPods() {
  const podsPath = path.join(rootDir, "deploy", "runpod", "pods.json");
  if (!fs.existsSync(podsPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(podsPath, "utf8"));
}

function hasRegisteredPod(roleKey) {
  return Boolean(String(readPods()?.[roleKey]?.pod_id || "").trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getVercelTeamContext(token) {
  const userResponse = await fetch("https://api.vercel.com/v2/user", {
    headers: { Authorization: `Bearer ${token}` },
    method: "GET",
  });
  const userText = await userResponse.text();
  if (!userResponse.ok) {
    throw new Error(`Unable to read Vercel user info: HTTP ${userResponse.status} ${userText.slice(0, 120)}`);
  }

  const userBody = userText ? JSON.parse(userText) : null;
  const teamId =
    process.env.VERCEL_TEAM_ID?.trim() ||
    userBody?.user?.defaultTeamId ||
    "";
  if (!teamId) {
    throw new Error("Unable to determine Vercel team id");
  }

  const teamResponse = await fetch(`https://api.vercel.com/v2/teams/${teamId}`, {
    headers: { Authorization: `Bearer ${token}` },
    method: "GET",
  });
  const teamText = await teamResponse.text();
  if (!teamResponse.ok) {
    throw new Error(`Unable to read Vercel team info: HTTP ${teamResponse.status} ${teamText.slice(0, 120)}`);
  }

  const teamBody = teamText ? JSON.parse(teamText) : null;
  const teamSlug = teamBody?.slug || "";
  if (!teamSlug) {
    throw new Error("Unable to determine Vercel team slug");
  }

  return { teamId, teamSlug };
}

async function fetchVercelDeployments(token) {
  const projectId = process.env.VERCEL_PROJECT_ID || "pawvital-ai";
  const teamId = process.env.VERCEL_TEAM_ID || "";
  const url = teamId
    ? `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5&teamId=${encodeURIComponent(teamId)}`
    : `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    method: "GET",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Unable to read Vercel deployments: HTTP ${response.status} ${text.slice(0, 120)}`);
  }

  const body = text ? JSON.parse(text) : null;
  return Array.isArray(body?.deployments) ? body.deployments : [];
}

async function redeployLatestProductionDeployment() {
  const token = (process.env.VERCEL_TOKEN || "").trim();
  if (!token) {
    console.log("[phase5] skipping production redeploy (no VERCEL_TOKEN)");
    return null;
  }

  const { teamId, teamSlug } = await getVercelTeamContext(token);
  const deployments = await fetchVercelDeployments(token);
  const latest = deployments[0];
  if (!latest?.uid) {
    throw new Error("Unable to find a deployment to redeploy");
  }

  const response = await fetch(
    `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(teamId)}&slug=${encodeURIComponent(teamSlug)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        deploymentId: latest.uid,
        name: latest.name || "pawvital-ai",
        project: latest.name || "pawvital-ai",
        target: "production",
        withLatestCommit: true,
      }),
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Unable to request production redeploy: HTTP ${response.status} ${text.slice(0, 160)}`);
  }

  return text ? JSON.parse(text) : null;
}

async function waitForProductionDeployment(targetDeploymentId, timeoutMs) {
  const token = (process.env.VERCEL_TOKEN || "").trim();
  if (!token || !targetDeploymentId) {
    return;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deployments = await fetchVercelDeployments(token);
    const target = deployments.find((deployment) => deployment?.uid === targetDeploymentId);
    if (target && target.state === "READY" && target.readyState === "READY") {
      return target;
    }
    await sleep(20_000);
  }

  throw new Error("Timed out waiting for the production redeploy to become ready");
}

function printPlan(options) {
  const plan = [
    "[phase5] plan",
    "- run RunPod health status",
    "- provision missing consult/retrieval and async-review pods if needed",
    "- wire healthy pod URLs into Vercel",
    "- request a production redeploy",
    options.skipLoadTest
      ? "- skip synthetic load test (per flag)"
      : "- run the synthetic phase5 load test",
    options.watch
      ? `- poll persisted shadow baseline every ${Math.round(options.watchIntervalMs / 1000)}s`
      : "- capture a one-shot persisted shadow baseline snapshot",
    `- write baseline report to ${options.baselineOutputPath}`,
    options.stopAfter
      ? "- stop pods after the cycle finishes"
      : "- leave pods running for continued shadow collection",
  ];
  console.log(plan.join("\n"));
}

function readJsonFromScript(scriptPath, args = []) {
  const result = runNodeScript(scriptPath, args, true);
  return JSON.parse(result.stdout || "{}");
}

function hasPromotionEligibleService(report) {
  const summary = report?.shadowSummary;
  if (!summary?.gateConfig || !Array.isArray(summary.services)) {
    return false;
  }

  return summary.services.some((service) => {
    const sampleCount = service?.window?.observedWindowSamples ?? 0;
    return (
      sampleCount >= summary.gateConfig.requiredHealthySamples &&
      service.status === "ready"
    );
  });
}

async function waitForBaseline(options) {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    const report = readJsonFromScript("scripts/report-phase5-shadow.mjs", [
      "--json",
    ]);
    const overallStatus = report?.shadowSummary?.overallStatus || "unknown";
    const services = Array.isArray(report?.shadowSummary?.services)
      ? report.shadowSummary.services
      : [];
    const descriptor = services
      .map((service) => {
        const sampleCount = service?.window?.observedWindowSamples ?? 0;
        return `${service.service}:${service.status}:${sampleCount}`;
      })
      .join(", ");

    console.log(`[phase5] persisted baseline -> ${overallStatus} [${descriptor}]`);

    if (hasPromotionEligibleService(report)) {
      return report;
    }

    await sleep(options.watchIntervalMs);
  }

  throw new Error("Timed out waiting for a promotion-eligible Phase 5 baseline");
}

async function main() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));

  if (options.dryRun) {
    printPlan(options);
    runNodeScript("scripts/runpod-health-and-wire.mjs", ["--status"]);
    return;
  }

  if (!options.confirm) {
    throw new Error("Use --dry-run first, then rerun with --confirm to mutate RunPod or Vercel.");
  }

  let report = null;

  try {
    runNodeScript("scripts/runpod-health-and-wire.mjs", ["--status"]);

    if (hasRegisteredPod("consult_retrieval")) {
      console.log("[phase5] starting existing consult/retrieval pod");
      runNodeScript("scripts/runpod-health-and-wire.mjs", ["--start-consult"]);
    } else {
      console.log("[phase5] ensuring consult/retrieval pod is present");
      runNodeScript("scripts/runpod-health-and-wire.mjs", ["--provision-consult", "--confirm"]);
    }

    if (hasRegisteredPod("async_review")) {
      console.log("[phase5] starting existing async-review pod");
      runNodeScript("scripts/runpod-health-and-wire.mjs", ["--start-review"]);
    } else {
      console.log("[phase5] ensuring async-review pod is present");
      runNodeScript("scripts/runpod-health-and-wire.mjs", ["--provision-review", "--confirm"]);
    }

    console.log("[phase5] wiring pod URLs into Vercel");
    runNodeScript("scripts/runpod-health-and-wire.mjs", ["--wire"]);

    console.log("[phase5] requesting production redeploy");
    const redeploy = await redeployLatestProductionDeployment();
    await waitForProductionDeployment(redeploy?.id || "", options.timeoutMs);

    if (!options.skipLoadTest) {
      console.log("[phase5] running synthetic load test");
      runNodeScript("scripts/load-phase5-shadow.mjs", []);
    }

    report = options.watch
      ? await waitForBaseline(options)
      : readJsonFromScript("scripts/report-phase5-shadow.mjs", ["--json"]);

    console.log("[phase5] writing baseline report");
    runNodeScript("scripts/report-phase5-shadow.mjs", [
      `--output=${options.baselineOutputPath}`,
    ]);
  } finally {
    if (options.stopAfter) {
      console.log("[phase5] stopping pods after capture");
      runNodeScript("scripts/runpod-health-and-wire.mjs", ["--stop-all"]);
    } else {
      console.log("[phase5] leaving pods running for continued shadow collection");
    }
  }

  console.log(
    `[phase5] cycle complete with overall status ${report?.shadowSummary?.overallStatus || "unknown"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
