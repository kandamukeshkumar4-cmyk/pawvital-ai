import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const podsPath = path.join(rootDir, "deploy", "runpod", "pods.json");
const nodeBin = process.execPath;
const pollIntervalMs = 20_000;
const timeoutMs = 45 * 60_000;

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, ...(options.env || {}) },
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? 1}`);
  }
}

function runNodeScript(scriptPath, args = []) {
  run(nodeBin, [scriptPath, ...args]);
}

function getCurrentGitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`git rev-parse HEAD exited with ${result.status ?? 1}`);
  }
  const sha = result.stdout.trim();
  if (!sha) {
    throw new Error("Unable to determine current git SHA");
  }
  return sha;
}

function readPods() {
  if (!fs.existsSync(podsPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(podsPath, "utf8"));
}

function buildHealthTargets() {
  const pods = readPods();
  const targets = [];

  const consult = pods.consult_retrieval;
  if (consult?.pod_id) {
    targets.push(
      { role: "text", url: `https://${consult.pod_id}-8081.proxy.runpod.net/healthz` },
      { role: "image", url: `https://${consult.pod_id}-8082.proxy.runpod.net/healthz` },
      { role: "consult", url: `https://${consult.pod_id}-8083.proxy.runpod.net/healthz` }
    );
  }

  const review = pods.async_review;
  if (review?.pod_id) {
    targets.push({ role: "review", url: `https://${review.pod_id}-8084.proxy.runpod.net/healthz` });
  }

  return targets;
}

async function checkHealth(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    const rawText = await response.text();
    return { ok: response.ok, status: response.status, body: rawText };
  } catch {
    return { ok: false, status: null, body: "" };
  }
}

async function waitForHealthy() {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const targets = buildHealthTargets();
    if (targets.length === 0) {
      throw new Error("No RunPod targets registered in deploy/runpod/pods.json");
    }

    const results = await Promise.all(
      targets.map(async (target) => ({ ...target, ...(await checkHealth(target.url)) }))
    );

    const unhealthy = results.filter((result) => !result.ok);
    const summary = results.map((result) => `${result.role}:${result.status ?? "no-response"}`).join(", ");
    console.log(`[phase5] health snapshot -> ${summary}`);

    if (unhealthy.length === 0) {
      return results;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Timed out waiting for RunPod services to become healthy");
}

async function waitForProductionDeployment() {
  const token = process.env.VERCEL_TOKEN || "";
  const projectId = process.env.VERCEL_PROJECT_ID || "pawvital-ai";
  const teamId = process.env.VERCEL_TEAM_ID || "";

  if (!token) {
    console.log("[phase5] skipping Vercel deployment wait (no VERCEL_TOKEN)");
    return;
  }

  const currentSha = getCurrentGitSha();
  const baseUrl = teamId
    ? `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5&teamId=${encodeURIComponent(teamId)}`
    : `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(baseUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const raw = await response.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }

    if (!response.ok) {
      console.log(`[phase5] deployment snapshot -> HTTP ${response.status}`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    const deployments = Array.isArray(body?.deployments) ? body.deployments : [];
    const latest = deployments[0];
    const latestSha = latest?.meta?.githubCommitSha || "";
    const latestState = latest?.state || "unknown";
    const latestReadyState = latest?.readyState || "unknown";
    console.log(`[phase5] deployment snapshot -> ${latestSha || "no-sha"}:${latestState}/${latestReadyState}`);

    if (latestSha === currentSha && latestState === "READY" && latestReadyState === "READY") {
      return latest;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Timed out waiting for Vercel production deployment to become ready");
}

async function main() {
  loadEnvFiles();

  const currentTargets = buildHealthTargets();
  const currentHealth = await Promise.all(
    currentTargets.map(async (target) => ({ ...target, ...(await checkHealth(target.url)) }))
  );
  const isFullyHealthy = currentHealth.length > 0 && currentHealth.every((result) => result.ok);
  const consultHealthy = currentHealth.some((result) =>
    result.role === "text" || result.role === "image" || result.role === "consult"
  )
    ? currentHealth.filter((result) => ["text", "image", "consult"].includes(result.role)).every((result) => result.ok)
    : false;
  const reviewHealthy = currentHealth.some((result) => result.role === "review")
    ? currentHealth.filter((result) => result.role === "review").every((result) => result.ok)
    : false;

  try {
    if (!isFullyHealthy) {
      if (!consultHealthy) {
        console.log("[phase5] provisioning consult pod");
        runNodeScript("scripts/runpod-health-and-wire.mjs", ["--provision-consult"]);
      }
      if (!reviewHealthy) {
        console.log("[phase5] provisioning review pod");
        runNodeScript("scripts/runpod-health-and-wire.mjs", ["--provision-review"]);
      }

      console.log("[phase5] waiting for pod health");
      await waitForHealthy();
    } else {
      console.log("[phase5] pods already healthy, skipping provisioning");
    }

    console.log("[phase5] wiring live pod URLs into Vercel");
    runNodeScript("scripts/runpod-health-and-wire.mjs", ["--wire"]);

    console.log("[phase5] waiting for Vercel production deployment");
    await waitForProductionDeployment();

    console.log("[phase5] running shadow validation report");
    runNodeScript("scripts/report-phase5-shadow.mjs");

    console.log("[phase5] phase 5 cycle complete");
  } finally {
    console.log("[phase5] stopping pods");
    try {
      runNodeScript("scripts/runpod-health-and-wire.mjs", ["--stop-all"]);
    } catch (error) {
      console.error("[phase5] stop failed:", error instanceof Error ? error.message : String(error));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
