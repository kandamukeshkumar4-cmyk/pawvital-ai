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

function readPods() {
  if (!fs.existsSync(podsPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(podsPath, "utf8"));
}

function formatUsd(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return "$0.00";
  }
  return `$${value.toFixed(2)}`;
}

function getTrackedPodIds() {
  const pods = readPods();
  return Array.from(
    new Set(
      Object.values(pods)
        .map((pod) => pod?.pod_id)
        .filter((podId) => typeof podId === "string" && podId.length > 0)
    )
  );
}

async function fetchBillingRecordsForPod(podId, startTimeIso, endTimeIso) {
  const params = new URLSearchParams({
    bucketSize: "hour",
    grouping: "podId",
    podId,
    startTime: startTimeIso,
    endTime: endTimeIso,
  });

  const response = await fetch(`https://rest.runpod.io/v1/billing/pods?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.RUNPOD_API_KEY || ""}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Unable to read RunPod billing for ${podId}: HTTP ${response.status} ${text.slice(0, 120)}`);
  }

  try {
    const body = text ? JSON.parse(text) : null;
    return Array.isArray(body) ? body : [];
  } catch {
    throw new Error(`Unable to parse RunPod billing response for ${podId}`);
  }
}

async function getPhase5SpendSnapshot(cycleStartIso) {
  const phase5BudgetUsdRaw = process.env.RUNPOD_PHASE5_BUDGET_USD || process.env.RUNPOD_BUDGET_USD || "";
  const phase5BudgetUsd = Number(phase5BudgetUsdRaw);
  const budgetUsd = Number.isFinite(phase5BudgetUsd) && phase5BudgetUsd > 0 ? phase5BudgetUsd : 0;
  if (budgetUsd <= 0) {
    return { enabled: false, budgetUsd: 0, spentUsd: 0, remainingUsd: 0, remainingPct: 100, breakdown: [] };
  }

  const podIds = getTrackedPodIds();
  const endTimeIso = new Date().toISOString();
  const breakdown = [];
  let spentUsd = 0;

  for (const podId of podIds) {
    const records = await fetchBillingRecordsForPod(podId, cycleStartIso, endTimeIso);
    const podSpentUsd = records.reduce((sum, record) => sum + Number(record?.amount || 0), 0);
    spentUsd += podSpentUsd;
    breakdown.push({ podId, spentUsd: podSpentUsd, records: records.length });
  }

  const remainingUsd = Math.max(0, budgetUsd - spentUsd);
  const remainingPct = budgetUsd > 0 ? (remainingUsd / budgetUsd) * 100 : 0;

  return { enabled: true, budgetUsd, spentUsd, remainingUsd, remainingPct, breakdown };
}

async function maybeStopForBudget(stage, cycleStartIso) {
  const phase5BudgetUsdRaw = process.env.RUNPOD_PHASE5_BUDGET_USD || process.env.RUNPOD_BUDGET_USD || "";
  const phase5BudgetUsd = Number(phase5BudgetUsdRaw);
  const phase5StopAtRemainingPctRaw =
    process.env.RUNPOD_STOP_AT_REMAINING_PCT || process.env.RUNPOD_PHASE5_STOP_AT_REMAINING_PCT || "1";
  const phase5StopAtRemainingPct = Number(phase5StopAtRemainingPctRaw);

  if (!Number.isFinite(phase5BudgetUsd) || phase5BudgetUsd <= 0) {
    if (stage === "preflight") {
      console.log("[phase5] budget guard disabled (set RUNPOD_PHASE5_BUDGET_USD or RUNPOD_BUDGET_USD to enable)");
    }
    return false;
  }

  const snapshot = await getPhase5SpendSnapshot(cycleStartIso);
  const breakdown = snapshot.breakdown.length
    ? snapshot.breakdown.map((entry) => `${entry.podId}:${formatUsd(entry.spentUsd)}`).join(", ")
    : "no-active-pods";

  console.log(
    `[phase5] budget snapshot @ ${stage} -> spent ${formatUsd(snapshot.spentUsd)} / ${formatUsd(snapshot.budgetUsd)} ` +
      `(remaining ${formatUsd(snapshot.remainingUsd)}; ${snapshot.remainingPct.toFixed(1)}%) [${breakdown}]`
  );

  if (snapshot.remainingPct <= phase5StopAtRemainingPct) {
    console.warn(
      `[phase5] remaining budget at or below ${phase5StopAtRemainingPct.toFixed(1)}% - stopping RunPod now`
    );
    try {
      runNodeScript("scripts/runpod-health-and-wire.mjs", ["--stop-all"]);
    } catch (error) {
      console.error("[phase5] budget stop failed:", error instanceof Error ? error.message : String(error));
    }
    return true;
  }

  return false;
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

async function getVercelTeamContext(token) {
  const userResponse = await fetch(`https://api.vercel.com/v2/user`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const userText = await userResponse.text();
  if (!userResponse.ok) {
    throw new Error(`Unable to read Vercel user info: HTTP ${userResponse.status} ${userText.slice(0, 120)}`);
  }

  let userBody = null;
  try {
    userBody = userText ? JSON.parse(userText) : null;
  } catch {
    throw new Error("Unable to parse Vercel user response");
  }

  const teamId = userBody?.user?.defaultTeamId || "";
  if (!teamId) {
    throw new Error("Unable to determine Vercel default team id");
  }

  const teamResponse = await fetch(`https://api.vercel.com/v2/teams/${teamId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const teamText = await teamResponse.text();
  if (!teamResponse.ok) {
    throw new Error(`Unable to read Vercel team info: HTTP ${teamResponse.status} ${teamText.slice(0, 120)}`);
  }

  let teamBody = null;
  try {
    teamBody = teamText ? JSON.parse(teamText) : null;
  } catch {
    throw new Error("Unable to parse Vercel team response");
  }

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
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Unable to read Vercel deployments: HTTP ${response.status} ${text.slice(0, 120)}`);
  }

  try {
    const body = text ? JSON.parse(text) : null;
    return Array.isArray(body?.deployments) ? body.deployments : [];
  } catch {
    throw new Error("Unable to parse Vercel deployments response");
  }
}

async function redeployLatestProductionDeployment() {
  const token = process.env.VERCEL_TOKEN || "";
  if (!token) {
    console.log("[phase5] skipping Vercel redeploy (no VERCEL_TOKEN)");
    return null;
  }

  const { teamId, teamSlug } = await getVercelTeamContext(token);
  const deployments = await fetchVercelDeployments(token);
  const latest = deployments[0];
  if (!latest?.uid) {
    throw new Error("Unable to find a production deployment to redeploy");
  }

  const redeployUrl = `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(teamId)}&slug=${encodeURIComponent(teamSlug)}`;
  const response = await fetch(redeployUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deploymentId: latest.uid,
      name: latest.name || "pawvital-ai",
      project: latest.name || "pawvital-ai",
      target: "production",
      withLatestCommit: true,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Unable to request Vercel redeploy: HTTP ${response.status} ${text.slice(0, 160)}`);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Unable to parse Vercel redeploy response");
  }
}

async function waitForProductionDeployment(targetDeploymentId) {
  const token = process.env.VERCEL_TOKEN || "";

  if (!token) {
    console.log("[phase5] skipping Vercel deployment wait (no VERCEL_TOKEN)");
    return;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const deployments = await fetchVercelDeployments(token);
    const target = deployments.find((deployment) => deployment?.uid === targetDeploymentId);
    const latest = deployments[0];
    const latestDescriptor = `${latest?.uid || "no-id"}:${latest?.state || "unknown"}/${latest?.readyState || "unknown"}`;
    const targetDescriptor = target
      ? `${target.uid}:${target.state || "unknown"}/${target.readyState || "unknown"}`
      : `missing:${targetDeploymentId}`;
    console.log(`[phase5] deployment snapshot -> latest ${latestDescriptor}; target ${targetDescriptor}`);

    if (target && target.state === "READY" && target.readyState === "READY") {
      return target;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Timed out waiting for Vercel production deployment to become ready");
}

async function main() {
  loadEnvFiles();
  const cycleStartIso = new Date().toISOString();

  if (await maybeStopForBudget("preflight", cycleStartIso)) {
    return;
  }

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

    if (await maybeStopForBudget("post-health", cycleStartIso)) {
      return;
    }

    console.log("[phase5] wiring live pod URLs into Vercel");
    runNodeScript("scripts/runpod-health-and-wire.mjs", ["--wire"]);

    if (await maybeStopForBudget("post-wire", cycleStartIso)) {
      return;
    }

    console.log("[phase5] requesting Vercel production redeploy");
    const redeploy = await redeployLatestProductionDeployment();

    console.log("[phase5] waiting for Vercel production deployment");
    await waitForProductionDeployment(redeploy?.id || "");

    if (await maybeStopForBudget("post-redeploy", cycleStartIso)) {
      return;
    }

    console.log("[phase5] running shadow validation report");
    runNodeScript("scripts/report-phase5-shadow.mjs");

    await maybeStopForBudget("post-report", cycleStartIso);

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
