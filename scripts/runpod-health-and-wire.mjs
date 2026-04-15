/**
 * runpod-health-and-wire.mjs
 *
 * Usage:
 *   node scripts/runpod-health-and-wire.mjs                 # check health only
 *   node scripts/runpod-health-and-wire.mjs --status       # explicit status alias
 *   node scripts/runpod-health-and-wire.mjs --wire         # check + push passing URLs to Vercel
 *   node scripts/runpod-health-and-wire.mjs --plan
 *   node scripts/runpod-health-and-wire.mjs --start-consult
 *   node scripts/runpod-health-and-wire.mjs --stop-consult
 *   node scripts/runpod-health-and-wire.mjs --reconcile [--confirm]
 *   node scripts/runpod-health-and-wire.mjs --billing-audit
 *   node scripts/runpod-health-and-wire.mjs --provision-consult [--rehearsal] [--confirm]
 *   node scripts/runpod-health-and-wire.mjs --provision-review [--rehearsal] [--confirm]
 *   node scripts/runpod-health-and-wire.mjs --teardown-consult [--rehearsal] [--confirm]
 *   node scripts/runpod-health-and-wire.mjs --teardown-review [--rehearsal] [--confirm]
 *   node scripts/runpod-health-and-wire.mjs --stop-all
 *
 * Reads RUNPOD_API_KEY from .env.local / .env.sidecars / env
 * Reads HF_SIDECAR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from same
 * Reads pod IDs from deploy/runpod/pods.json
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import https from "node:https";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();

// ---------------------------------------------------------------------------
// Load env from .env files
// ---------------------------------------------------------------------------
function loadEnvFiles() {
  for (const f of [".env.sidecars", ".env.local", ".env"]) {
    const p = path.join(rootDir, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnvFiles();

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || "";
const HF_SIDECAR_API_KEY = process.env.HF_SIDECAR_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || "";
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "pawvital-ai";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "";
const RUNPOD_REPO_ARCHIVE_URL =
  String(process.env.RUNPOD_REPO_ARCHIVE_URL || "").trim() ||
  "https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/archive/refs/heads/master.tar.gz";

function readGpuTypeIdsOverride(envName, fallback) {
  const raw = String(process.env[envName] || "").trim();
  if (!raw) {
    return fallback;
  }

  const parsed = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}

function readNumberOverride(envName, fallback) {
  const raw = String(process.env[envName] || "").trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanOverride(envName) {
  const raw = String(process.env[envName] || "").trim().toLowerCase();
  if (!raw) {
    return undefined;
  }

  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Load pod registry
// ---------------------------------------------------------------------------
const podsPath = path.join(rootDir, "deploy", "runpod", "pods.json");
const sizingDocPath = path.join(rootDir, "plans", "SIDECAR_SIZING.md");
const pods = JSON.parse(fs.readFileSync(podsPath, "utf8"));

const SIZING_MARKERS = [
  "hard prerequisite for `VET-1106`",
  "consult_retrieval + async_review",
  "approved starting point",
  "20% VRAM headroom",
  "5800 ms",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusLine(level, msg) {
  const prefix = level === "ok" ? "[OK]  " : level === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${prefix} ${msg}`);
}

const ROLE_PROVISION_COMMAND = {
  consult_retrieval: "npm run runpod:provision:consult",
  async_review: "npm run runpod:provision:review",
  narrow_model_pack: "npm run runpod:provision:narrow",
};

function getRoleConfig(roleKey) {
  if (roleKey === "consult_retrieval") {
    return {
      role: roleKey,
      displayName: "consult + retrieval",
      liveName: "pawvital-consult-retrieval-v6",
      rehearsalNamePrefix: "pawvital-consult-retrieval-rehearsal",
      gpuLabel: "RTX 6000 Ada 48 GB",
      dailyCostUsd: 17.76,
      vramHeadroomTargetGb: 38.4,
      syncPathBudgetMs: 5800,
      services: [
        "text-retrieval-service:8081",
        "image-retrieval-service:8082",
        "multimodal-consult-service:8083",
      ],
      ports: ["8081/http", "8082/http", "8083/http", "22/tcp"],
      requiredEnv: [
        "HF_SIDECAR_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
      ],
      gpuTypeIds: [
        "NVIDIA GeForce RTX 4090",
        "NVIDIA RTX A6000",
        "NVIDIA RTX 6000 Ada Generation",
        "NVIDIA L40S",
        "NVIDIA GeForce RTX 3090",
      ],
      containerDiskInGb: 40,
      volumeInGb: 80,
      command: "npm run runpod:provision:consult",
      rehearsalCommand: "npm run runpod:rehearse:consult",
      teardownCommand: "npm run runpod:teardown:consult",
      buildEnv(publicKey) {
        return {
          PUBLIC_KEY: publicKey,
          SIDECAR_API_KEY: HF_SIDECAR_API_KEY,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
        };
      },
      buildStartupScript: buildConsultStartupScript,
    };
  }

  if (roleKey === "async_review") {
    const gpuTypeIds = readGpuTypeIdsOverride("RUNPOD_ASYNC_REVIEW_GPU_TYPE_IDS", [
      "NVIDIA A100 80GB PCIe",
      "NVIDIA A100-SXM4-80GB",
      "NVIDIA H100 NVL",
    ]);
    const gpuLabel =
      String(process.env.RUNPOD_ASYNC_REVIEW_GPU_LABEL || "").trim() ||
      "A100 80 GB";

    return {
      role: roleKey,
      displayName: "async review",
      liveName: "pawvital-async-review-v1",
      rehearsalNamePrefix: "pawvital-async-review-rehearsal",
      gpuLabel,
      dailyCostUsd: readNumberOverride("RUNPOD_ASYNC_REVIEW_DAILY_COST_USD", 28.56),
      vramHeadroomTargetGb: 64.0,
      syncPathBudgetMs: 250,
      services: ["async-review-service:8084"],
      ports: ["8084/http", "22/tcp"],
      requiredEnv: ["HF_SIDECAR_API_KEY"],
      gpuTypeIds,
      cloudType:
        String(process.env.RUNPOD_ASYNC_REVIEW_CLOUD_TYPE || "").trim() ||
        "COMMUNITY",
      dataCenterIds: readGpuTypeIdsOverride("RUNPOD_ASYNC_REVIEW_DATA_CENTER_IDS", []),
      globalNetworking: readBooleanOverride("RUNPOD_ASYNC_REVIEW_GLOBAL_NETWORKING"),
      publicIp: readBooleanOverride("RUNPOD_ASYNC_REVIEW_PUBLIC_IP"),
      containerDiskInGb: readNumberOverride("RUNPOD_ASYNC_REVIEW_CONTAINER_DISK_IN_GB", 40),
      volumeInGb: readNumberOverride("RUNPOD_ASYNC_REVIEW_VOLUME_IN_GB", 120),
      command: "npm run runpod:provision:review",
      rehearsalCommand: "npm run runpod:rehearse:review",
      teardownCommand: "npm run runpod:teardown:review",
      buildEnv(publicKey) {
        return {
          PUBLIC_KEY: publicKey,
          SIDECAR_API_KEY: HF_SIDECAR_API_KEY,
        };
      },
      buildStartupScript: buildReviewStartupScript,
    };
  }

  return null;
}

async function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: opts.method || "GET", headers: opts.headers || {} }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

function runCommand(command, args) {
  let finalCommand = command;
  let finalArgs = args;
  if (process.platform === "win32" && command === "npx") {
    finalCommand = "cmd.exe";
    finalArgs = ["/d", "/s", "/c", [command, ...args].join(" ")];
  }

  return spawnSync(finalCommand, finalArgs, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function commandSummary(result) {
  return (result.stderr || result.stdout || `exit ${result.status ?? "unknown"}`).trim().split("\n")[0];
}

function parseCommandJson(result) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const match = output.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function resolveGitPath(gitPathValue) {
  const trimmed = gitPathValue.trim().replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(trimmed)) {
    if (process.platform === "win32") {
      return trimmed;
    }

    const drive = trimmed[0].toLowerCase();
    return `/mnt/${drive}/${trimmed.slice(3)}`;
  }

  return path.resolve(rootDir, trimmed);
}

function readHeadRef(headPath) {
  if (!fs.existsSync(headPath)) return "";
  const head = fs.readFileSync(headPath, "utf8").trim();
  const refMatch = head.match(/^ref:\s+refs\/heads\/(.+)$/);
  if (refMatch) return refMatch[1].trim();
  return "";
}

function getCurrentGitBranch() {
  const gitMetaPath = path.join(rootDir, ".git");
  if (!fs.existsSync(gitMetaPath)) return "";

  const stat = fs.statSync(gitMetaPath);
  if (stat.isDirectory()) {
    return readHeadRef(path.join(gitMetaPath, "HEAD"));
  }

  const gitFile = fs.readFileSync(gitMetaPath, "utf8").trim();
  const gitDirMatch = gitFile.match(/^gitdir:\s+(.+)$/i);
  if (!gitDirMatch) return "";
  const gitDir = resolveGitPath(gitDirMatch[1]);
  return readHeadRef(path.join(gitDir, "HEAD"));
}

function wireVercelWithCli(toSet) {
  const npxCommand = "npx";
  const whoami = runCommand(npxCommand, ["vercel", "whoami"]);
  if (whoami.status !== 0) {
    statusLine("fail", `Vercel CLI auth unavailable: ${commandSummary(whoami)}`);
    return false;
  }

  statusLine("warn", "VERCEL_TOKEN not set - using Vercel CLI session for env sync");
  let allSucceeded = true;
  const currentBranch = getCurrentGitBranch();
  for (const { key, value } of toSet) {
    let productionResult = runCommand(npxCommand, [
      "vercel",
      "env",
      "update",
      key,
      "production",
      "--value",
      value,
      "--yes",
    ]);
    const productionUpdateJson = parseCommandJson(productionResult);
    if (productionUpdateJson?.reason === "env_not_found") {
      productionResult = runCommand(npxCommand, [
        "vercel",
        "env",
        "add",
        key,
        "production",
        "--value",
        value,
        "--yes",
      ]);
    }
    if (productionResult.status === 0) {
      statusLine("ok", `Vercel CLI set ${key} (production)`);
    } else {
      statusLine("fail", `Vercel CLI set ${key} (production) failed: ${commandSummary(productionResult)}`);
      allSucceeded = false;
    }

    const previewUpdate = runCommand(npxCommand, [
      "vercel",
      "env",
      "update",
      key,
      "preview",
      "--value",
      value,
      "--yes",
    ]);

    if (previewUpdate.status === 0) {
      statusLine("ok", `Vercel CLI set ${key} (preview)`);
      continue;
    }

    const previewUpdateJson = parseCommandJson(previewUpdate);
    if (previewUpdateJson?.reason === "env_not_found") {
      const previewAdd = runCommand(npxCommand, [
        "vercel",
        "env",
        "add",
        key,
        "preview",
        "--value",
        value,
        "--yes",
      ]);

      if (previewAdd.status === 0) {
        statusLine("ok", `Vercel CLI set ${key} (preview)`);
        continue;
      }

      const previewAddJson = parseCommandJson(previewAdd);
      if (previewAddJson?.reason === "git_branch_required") {
        if (!currentBranch) {
          statusLine(
            "fail",
            `Vercel CLI requires an explicit preview branch for ${key}, but the current git branch could not be determined`
          );
          allSucceeded = false;
          continue;
        }

        const previewBranchAdd = runCommand(npxCommand, [
          "vercel",
          "env",
          "add",
          key,
          "preview",
          currentBranch,
          "--value",
          value,
          "--yes",
        ]);

        if (previewBranchAdd.status === 0) {
          statusLine("ok", `Vercel CLI set ${key} (preview:${currentBranch})`);
          continue;
        }

        statusLine("fail", `Vercel CLI set ${key} (preview:${currentBranch}) failed: ${commandSummary(previewBranchAdd)}`);
        allSucceeded = false;
        continue;
      }

      statusLine("fail", `Vercel CLI set ${key} (preview) failed: ${commandSummary(previewAdd)}`);
      allSucceeded = false;
      continue;
    }

    statusLine("fail", `Vercel CLI set ${key} (preview) failed: ${commandSummary(previewUpdate)}`);
    allSucceeded = false;
  }

  return allSucceeded;
}

async function runpodRequest(pathname, opts = {}) {
  if (!RUNPOD_API_KEY) {
    throw new Error("RUNPOD_API_KEY not set in .env.local");
  }
  return fetchJson(`https://rest.runpod.io/v1${pathname}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${RUNPOD_API_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    body: opts.body,
  });
}

async function checkHealth(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: "GET", timeout: 12000 }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", () => resolve({ status: null, body: null }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: null, body: "timeout" });
    });
    req.end();
  });
}

function parseHealthBody(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function readRunpodPublicKey() {
  const sshPubKeyPath = path.join(process.env.USERPROFILE || process.env.HOME || "", ".ssh", "runpod_id_ed25519.pub");
  return fs.existsSync(sshPubKeyPath) ? fs.readFileSync(sshPubKeyPath, "utf8").trim() : "";
}

function writePods() {
  fs.writeFileSync(podsPath, JSON.stringify(pods, null, 2));
}

function ensureRoleState(roleKey) {
  if (!pods[roleKey]) {
    throw new Error(`Unknown role: ${roleKey}`);
  }
  if (!pods[roleKey].rehearsal || typeof pods[roleKey].rehearsal !== "object") {
    pods[roleKey].rehearsal = {
      pod_id: "",
      name: "",
      status: "not_run",
      lastDryRunAt: "",
      lastProvisionedAt: "",
      lastTeardownAt: "",
      note: "Throwaway rehearsal guard for VET-1106.",
    };
  }
  return pods[roleKey];
}

function timestamp() {
  return new Date().toISOString();
}

function readSizingDoc() {
  if (!fs.existsSync(sizingDocPath)) {
    return {
      ok: false,
      errors: [`Missing ${path.relative(rootDir, sizingDocPath)}`],
    };
  }

  const text = fs.readFileSync(sizingDocPath, "utf8");
  const missingMarkers = SIZING_MARKERS.filter((marker) => !text.includes(marker));
  return {
    ok: missingMarkers.length === 0,
    errors: missingMarkers.map(
      (marker) => `Sizing doc is missing required marker: ${marker}`
    ),
  };
}

function printSizingSummary() {
  const sizing = readSizingDoc();
  if (!sizing.ok) {
    statusLine("fail", "Sizing gate is not satisfied for VET-1106.");
    for (const error of sizing.errors) {
      statusLine("fail", error);
    }
    return false;
  }

  statusLine(
    "ok",
    "Sizing gate passed: approved topology is consult_retrieval + async_review with 20% VRAM headroom"
  );
  statusLine(
    "ok",
    `Sizing doc: ${path.relative(rootDir, sizingDocPath)} (sync-path budget 5800 ms)`
  );
  return true;
}

function rehearsalIsComplete(roleKey) {
  const pod = ensureRoleState(roleKey);
  return Boolean(
    pod.rehearsal?.lastProvisionedAt &&
      pod.rehearsal?.lastTeardownAt &&
      pod.rehearsal?.status === "torn_down"
  );
}

function validateRoleEnv(roleKey) {
  const config = getRoleConfig(roleKey);
  if (!config) return [`Unknown role: ${roleKey}`];

  const missing = [];
  for (const envName of config.requiredEnv) {
    const present =
      envName === "SUPABASE_URL"
        ? Boolean(String(SUPABASE_URL || "").trim())
        : Boolean(String(process.env[envName] || "").trim());
    if (!present) {
      missing.push(envName);
    }
  }
  if (!readRunpodPublicKey()) {
    missing.push("~/.ssh/runpod_id_ed25519.pub");
  }
  return missing;
}

function buildRolePayload(roleKey, rehearsal = false) {
  const config = getRoleConfig(roleKey);
  if (!config) {
    throw new Error(`Unknown role: ${roleKey}`);
  }

  const publicKey = readRunpodPublicKey();
  const suffix = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const name = rehearsal
    ? `${config.rehearsalNamePrefix}-${suffix}`
    : config.liveName;

  const payload = {
    name,
    cloudType: config.cloudType || "COMMUNITY",
    computeType: "GPU",
    gpuCount: 1,
    gpuTypeIds: config.gpuTypeIds,
    gpuTypePriority: "custom",
    allowedCudaVersions: ["12.8", "12.6", "12.5", "12.4"],
    imageName: "runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04",
    ports: config.ports,
    containerDiskInGb: config.containerDiskInGb,
    env: config.buildEnv(publicKey),
    dockerStartCmd: ["bash", "-lc", config.buildStartupScript()],
  };

  if (config.volumeInGb > 0) {
    payload.volumeInGb = config.volumeInGb;
    payload.volumeMountPath = "/workspace";
  }

  if (Array.isArray(config.dataCenterIds) && config.dataCenterIds.length > 0) {
    payload.dataCenterIds = config.dataCenterIds;
  }

  if (typeof config.globalNetworking === "boolean") {
    payload.globalNetworking = config.globalNetworking;
  }

  if (typeof config.publicIp === "boolean") {
    payload.publicIp = config.publicIp;
  }

  return payload;
}

function printProvisionPlan(roleKey, rehearsal = false) {
  const config = getRoleConfig(roleKey);
  const payload = buildRolePayload(roleKey, rehearsal);
  const missing = validateRoleEnv(roleKey);

  console.log("");
  console.log(`=== ${config.displayName} provisioning plan ===`);
  console.log(`Role:           ${roleKey}`);
  console.log(`Mode:           ${rehearsal ? "throwaway rehearsal" : "live"}`);
  console.log(`Pod name:       ${payload.name}`);
  console.log(`GPU target:     ${config.gpuLabel}`);
  console.log(`VRAM ceiling:   <= ${config.vramHeadroomTargetGb} GB steady-state`);
  console.log(`Daily cost:     $${config.dailyCostUsd.toFixed(2)}`);
  console.log(`Ports:          ${config.ports.join(", ")}`);
  console.log(`Services:       ${config.services.join(", ")}`);
  console.log(`Sync budget:    ${config.syncPathBudgetMs} ms`);

  if (missing.length > 0) {
    statusLine("warn", `Missing required provisioning inputs: ${missing.join(", ")}`);
  } else {
    statusLine("ok", "Required provisioning env and SSH inputs are present");
  }

  if (!rehearsal) {
    statusLine(
      rehearsalIsComplete(roleKey) ? "ok" : "warn",
      rehearsalIsComplete(roleKey)
        ? "Throwaway rehearsal already completed for this role"
        : `Live provisioning is blocked until ${config.rehearsalCommand} completes and ${config.teardownCommand} tears it down`
    );
  }

  statusLine("warn", "Dry run only. Re-run with --confirm to create the pod.");
}

// ---------------------------------------------------------------------------
// Health check all known pods
// ---------------------------------------------------------------------------
async function runHealthChecks() {
  const results = {};
  const summary = {
    missingPods: [],
    bootingPods: [],
    stoppedPods: [],
  };
  let registryChanged = false;
  let remoteById = new Map();
  let remoteByName = new Map();

  try {
    const remotePods = await listRunpodPods();
    remoteById = new Map(remotePods.map((pod) => [remotePodId(pod), pod]));
    remoteByName = new Map(
      remotePods
        .map((pod) => [remotePodName(pod), pod])
        .filter(([name]) => Boolean(name))
    );
  } catch (error) {
    statusLine(
      "warn",
      `RunPod inventory lookup failed; falling back to deploy/runpod/pods.json (${error instanceof Error ? error.message : String(error)})`
    );
  }

  for (const [role, pod] of Object.entries(pods)) {
    if (!pod.pod_id) {
      const status = pod.status || "not provisioned";
      const note = pod.note ? ` ${pod.note}` : "";
      statusLine("warn", `${role}: no pod provisioned (${status}).${note}`);
      summary.missingPods.push({
        role,
        status,
        command: ROLE_PROVISION_COMMAND[role] || "",
      });
      continue;
    }

    const remotePod =
      remoteById.get(pod.pod_id) || (pod.name ? remoteByName.get(pod.name) : null);

    if (remoteById.size > 0 || remoteByName.size > 0) {
      if (!remotePod) {
        statusLine(
          "warn",
          `${role}: pod ${pod.pod_id} is missing from current RunPod inventory; treating registry entry as stale`
        );
        pod.pod_id = "";
        pod.proxy_base = "";
        pod.status = "deleted";
        pod.note = `Cleared by health check on ${new Date().toISOString().slice(0, 10)} after RunPod reported the pod missing.`;
        summary.missingPods.push({
          role,
          status: "deleted",
          command: ROLE_PROVISION_COMMAND[role] || "",
        });
        registryChanged = true;
        continue;
      }

      const remoteId = remotePodId(remotePod);
      const remoteStatus = remotePodStatus(remotePod);

      if (remoteId && remoteId !== pod.pod_id) {
        statusLine(
          "warn",
          `${role}: updating stale pod id ${pod.pod_id} -> ${remoteId} from RunPod inventory`
        );
        pod.pod_id = remoteId;
        pod.proxy_base = `https://${remoteId}-{port}.proxy.runpod.net`;
        registryChanged = true;
      }

      if (remoteStatus && remoteStatus !== String(pod.status || "").toLowerCase()) {
        pod.status = remoteStatus;
        registryChanged = true;
      }

      if (["exited", "stopped", "terminated"].includes(remoteStatus)) {
        statusLine(
          "warn",
          `${role}: RunPod reports ${remoteStatus}; start or reprovision before health checks`
        );
        summary.stoppedPods.push({
          role,
          podId: pod.pod_id,
          status: remoteStatus,
        });
        continue;
      }
    }

    console.log(`\n--- ${role} (${pod.pod_id}) ---`);

    for (const svc of pod.services) {
      const [name, port] = svc.split(":");
      const url = `https://${pod.pod_id}-${port}.proxy.runpod.net/healthz`;
      const { status, body } = await checkHealth(url);
      const parsedBody = parseHealthBody(body);
      const mode = typeof parsedBody?.mode === "string" ? parsedBody.mode.trim() : "";

      if (status === 200 && mode === "warming") {
        statusLine("warn", `${name}:${port} warming  ${body?.slice(0, 80) ?? ""}`);
        if (!summary.bootingPods.find((entry) => entry.role === role)) {
          summary.bootingPods.push({ role, podId: pod.pod_id });
        }
      } else if (status === 200) {
        statusLine("ok", `${name}:${port} healthy  ${body?.slice(0, 80) ?? ""}`);
        if (!results[role]) results[role] = {};
        results[role][port] = { url: `https://${pod.pod_id}-${port}.proxy.runpod.net`, healthy: true };
      } else if (status === 502) {
        statusLine("warn", `${name}:${port} 502 - service still starting`);
        if (!summary.bootingPods.find((entry) => entry.role === role)) {
          summary.bootingPods.push({ role, podId: pod.pod_id });
        }
      } else if (status === null) {
        statusLine("warn", `${name}:${port} no response - pod not ready or booting`);
        if (!summary.bootingPods.find((entry) => entry.role === role)) {
          summary.bootingPods.push({ role, podId: pod.pod_id });
        }
      } else {
        statusLine("fail", `${name}:${port} HTTP ${status}`);
      }
    }
  }

  if (registryChanged) {
    writePods();
  }

  return { results, summary };
}

// ---------------------------------------------------------------------------
// Wire URLs into Vercel env vars
// ---------------------------------------------------------------------------
const PORT_TO_ENV = {
  "8081": "HF_TEXT_RETRIEVAL_URL",
  "8082": "HF_IMAGE_RETRIEVAL_URL",
  "8083": "HF_MULTIMODAL_CONSULT_URL",
  "8084": "HF_ASYNC_REVIEW_URL",
};

const PORT_TO_PATH = {
  "8081": "/search",
  "8082": "/search",
  "8083": "/consult",
  "8084": "/review",
};

async function wireVercel(healthResults) {
  const toSet = [];
  for (const role of Object.values(healthResults)) {
    for (const [port, info] of Object.entries(role)) {
      if (!info.healthy) continue;
      const envName = PORT_TO_ENV[port];
      const envPath = PORT_TO_PATH[port];
      if (!envName) continue;
      toSet.push({ key: envName, value: `${info.url}${envPath}` });
    }
  }

  if (toSet.length === 0) {
    statusLine("warn", "No healthy services to wire yet");
    return false;
  }

  if (!VERCEL_TOKEN) {
    return wireVercelWithCli(toSet);
  }

  const baseUrl = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`;
  const currentEnvList = await fetchJson(baseUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (currentEnvList.status >= 300) {
    statusLine(
      "fail",
      `Vercel env fetch failed: HTTP ${currentEnvList.status} - ${JSON.stringify(currentEnvList.body).slice(0, 120)}`
    );
    return false;
  }
  const existingByKey = new Map(
    Array.isArray(currentEnvList.body?.envs)
      ? currentEnvList.body.envs
          .filter((env) => Array.isArray(env.target) && env.target.includes("production"))
          .map((env) => [env.key, env])
      : []
  );

  let allSucceeded = true;
  for (const { key, value } of toSet) {
    const existing = existingByKey.get(key);
    if (existing?.id) {
      const patchUrl = VERCEL_TEAM_ID
        ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env/${existing.id}?teamId=${VERCEL_TEAM_ID}`
        : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env/${existing.id}`;
      const pr = await fetchJson(patchUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
        body: { value, type: "encrypted", target: ["production", "preview"] },
      });
      statusLine(pr.status < 300 ? "ok" : "fail", `Vercel PATCH ${key}: HTTP ${pr.status}`);
      if (pr.status >= 300) {
        allSucceeded = false;
      }
    } else {
      const r = await fetchJson(baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
        body: { key, value, type: "encrypted", target: ["production", "preview"] },
      });
      if (r.status === 200 || r.status === 201) {
        statusLine("ok", `Vercel: set ${key}=${value}`);
      } else {
        statusLine("fail", `Vercel set ${key}: HTTP ${r.status} - ${JSON.stringify(r.body).slice(0, 120)}`);
        allSucceeded = false;
      }
    }
  }

  return allSucceeded;
}

function printHealthNextSteps(summary) {
  if (summary.missingPods.length > 0) {
    console.log("\nNext steps for missing/deleted pods:");
    for (const missing of summary.missingPods) {
      const command = missing.command || "provision command not configured";
      console.log(`  - ${missing.role}: run \`${command}\``);
    }
  }

  if (summary.stoppedPods.length > 0) {
    console.log("\nNext steps for stopped/exited pods:");
    for (const pod of summary.stoppedPods) {
      const startCommand =
        pod.role === "async_review"
          ? "npm run runpod:start:review"
          : pod.role === "consult_retrieval"
            ? "npm run runpod:start:consult"
            : ROLE_PROVISION_COMMAND[pod.role] || "start/provision command not configured";
      console.log(
        `  - ${pod.role}: currently ${pod.status} on ${pod.podId}; run \`${startCommand}\` or reprovision if health stays bad`
      );
    }
  }

  if (summary.bootingPods.length > 0) {
    console.log("\nBoot progress tips for existing pods:");
    for (const pod of summary.bootingPods) {
      console.log(`  - ${pod.role}: watch logs once SSH is available on pod ${pod.podId}`);
    }
    console.log("  - ssh -i ~/.ssh/runpod_id_ed25519 -p <SSH_PORT> root@<PUBLIC_IP> 'tail -100 /workspace/logs/*.log'");
  }
}

// ---------------------------------------------------------------------------
// Provision pods
// ---------------------------------------------------------------------------
function buildConsultStartupScript() {
  return `set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends curl build-essential openssh-server
mkdir -p /var/run/sshd /root/.ssh /workspace/venvs /workspace/logs /workspace/model-cache/consult
chmod 700 /root/.ssh
if [ -n "\${PUBLIC_KEY:-}" ]; then
  printf '%s\\n' "$PUBLIC_KEY" > /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
fi
/usr/sbin/sshd
rm -rf /workspace/pawvital-ai /workspace/pawvital-ai-master /workspace/repo.tgz
curl -L --fail "${RUNPOD_REPO_ARCHIVE_URL}" -o /workspace/repo.tgz
tar -xzf /workspace/repo.tgz -C /workspace
REPO_ARCHIVE_DIR="$(find /workspace -maxdepth 1 -type d -name 'pawvital-ai-*' | head -n 1)"
if [ -z "$REPO_ARCHIVE_DIR" ]; then
  echo "[startup] extracted repo directory not found" >&2
  exit 1
fi
mv "$REPO_ARCHIVE_DIR" /workspace/pawvital-ai
cd /workspace/pawvital-ai
/usr/bin/env python3 -m venv /workspace/venvs/consult
/workspace/venvs/consult/bin/pip install --upgrade pip setuptools wheel > /workspace/logs/full-install.log 2>&1
/workspace/venvs/consult/bin/pip install -r services/text-retrieval-service/requirements.txt -r services/image-retrieval-service/requirements.txt -r services/multimodal-consult-service/requirements.txt >> /workspace/logs/full-install.log 2>&1
nohup env SIDECAR_API_KEY="\${SIDECAR_API_KEY}" SUPABASE_URL="\${SUPABASE_URL}" SUPABASE_SERVICE_ROLE_KEY="\${SUPABASE_SERVICE_ROLE_KEY}" STUB_MODE=false TEXT_MODEL_ENABLED=true TEXT_EMBED_MODEL_NAME=BAAI/bge-m3 TEXT_RERANK_MODEL_NAME=BAAI/bge-reranker-v2-m3 HF_HOME=/workspace/model-cache/consult /workspace/venvs/consult/bin/python -m uvicorn app.main:app --app-dir /workspace/pawvital-ai/services/text-retrieval-service --host 0.0.0.0 --port 8081 > /workspace/logs/text-retrieval.log 2>&1 &
nohup env SIDECAR_API_KEY="\${SIDECAR_API_KEY}" SUPABASE_URL="\${SUPABASE_URL}" SUPABASE_SERVICE_ROLE_KEY="\${SUPABASE_SERVICE_ROLE_KEY}" STUB_MODE=false IMAGE_MODEL_ENABLED=true IMAGE_RETRIEVAL_MODEL_NAME=microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224 HF_HOME=/workspace/model-cache/consult /workspace/venvs/consult/bin/python -m uvicorn app.main:app --app-dir /workspace/pawvital-ai/services/image-retrieval-service --host 0.0.0.0 --port 8082 > /workspace/logs/image-retrieval.log 2>&1 &
nohup env SIDECAR_API_KEY="\${SIDECAR_API_KEY}" STUB_MODE=false HF_HOME=/workspace/model-cache/consult CONSULT_MODEL_ID=Qwen/Qwen2.5-VL-7B-Instruct /workspace/venvs/consult/bin/python -m uvicorn app.main:app --app-dir /workspace/pawvital-ai/services/multimodal-consult-service --host 0.0.0.0 --port 8083 > /workspace/logs/multimodal-consult.log 2>&1 &
echo "[live] consult services started in LIVE mode" >> /workspace/logs/startup.log
exec tail -F /workspace/logs/text-retrieval.log /workspace/logs/image-retrieval.log /workspace/logs/multimodal-consult.log`;
}

function buildReviewStartupScript() {
  return `set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends curl build-essential openssh-server
mkdir -p /var/run/sshd /root/.ssh /workspace/venvs /workspace/logs /workspace/model-cache/review
chmod 700 /root/.ssh
if [ -n "\${PUBLIC_KEY:-}" ]; then
  printf '%s\\n' "$PUBLIC_KEY" > /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
fi
/usr/sbin/sshd
rm -rf /workspace/pawvital-ai /workspace/pawvital-ai-master /workspace/repo.tgz
curl -L --fail "${RUNPOD_REPO_ARCHIVE_URL}" -o /workspace/repo.tgz
tar -xzf /workspace/repo.tgz -C /workspace
REPO_ARCHIVE_DIR="$(find /workspace -maxdepth 1 -type d -name 'pawvital-ai-*' | head -n 1)"
if [ -z "$REPO_ARCHIVE_DIR" ]; then
  echo "[startup] extracted repo directory not found" >&2
  exit 1
fi
mv "$REPO_ARCHIVE_DIR" /workspace/pawvital-ai
cd /workspace/pawvital-ai
/usr/bin/env python3 -m venv /workspace/venvs/review
/workspace/venvs/review/bin/pip install --upgrade pip setuptools wheel > /workspace/logs/full-install.log 2>&1
/workspace/venvs/review/bin/pip install -r services/async-review-service/requirements.txt >> /workspace/logs/full-install.log 2>&1
nohup env SIDECAR_API_KEY="\${SIDECAR_API_KEY}" STUB_MODE=false HF_HOME=/workspace/model-cache/review REVIEW_MODEL_ID=Qwen/Qwen2.5-VL-32B-Instruct /workspace/venvs/review/bin/python -m uvicorn app.main:app --app-dir /workspace/pawvital-ai/services/async-review-service --host 0.0.0.0 --port 8084 > /workspace/logs/async-review.log 2>&1 &
echo "[live] async-review started in LIVE mode" >> /workspace/logs/startup.log
exec tail -F /workspace/logs/async-review.log`;
}

async function provisionRole(roleKey, { rehearsal = false, confirm = false } = {}) {
  const config = getRoleConfig(roleKey);
  const roleState = ensureRoleState(roleKey);
  const sizing = readSizingDoc();
  const missing = validateRoleEnv(roleKey);

  printSizingSummary();
  printProvisionPlan(roleKey, rehearsal);

  if (!confirm) {
    return;
  }

  if (!sizing.ok) {
    throw new Error(
      `VET-1106 is blocked until ${path.relative(rootDir, sizingDocPath)} passes validation`
    );
  }

  if (missing.length > 0) {
    throw new Error(`Cannot provision ${roleKey}; missing ${missing.join(", ")}`);
  }

  if (!rehearsal && roleState.pod_id) {
    throw new Error(
      `${roleKey} already has a live pod in deploy/runpod/pods.json (${roleState.pod_id}). Teardown or reconcile it first.`
    );
  }

  if (!rehearsal && !rehearsalIsComplete(roleKey)) {
    throw new Error(
      `${roleKey} live provisioning is blocked until a throwaway rehearsal is provisioned and torn down successfully`
    );
  }

  if (rehearsal && roleState.rehearsal?.pod_id) {
    throw new Error(
      `${roleKey} already has an active throwaway rehearsal pod (${roleState.rehearsal.pod_id}). Teardown it before provisioning another.`
    );
  }

  const payload = buildRolePayload(roleKey, rehearsal);
  const response = await runpodRequest("/pods", { method: "POST", body: payload });
  if (!(response.status === 200 || response.status === 201)) {
    throw new Error(
      `Failed to provision ${roleKey}: HTTP ${response.status} - ${JSON.stringify(response.body).slice(0, 200)}`
    );
  }

  const pod = response.body;
  statusLine(
    "ok",
    `Provisioned ${rehearsal ? "throwaway " : ""}${config.displayName} pod: ${pod.id} (${pod.name})`
  );

  if (rehearsal) {
    roleState.rehearsal = {
      ...(roleState.rehearsal || {}),
      pod_id: pod.id,
      name: pod.name,
      status: "booting",
      lastProvisionedAt: timestamp(),
      note: "Throwaway VET-1106 rehearsal pod. Teardown required before live provision.",
    };
  } else {
    roleState.pod_id = pod.id;
    roleState.name = pod.name;
    roleState.gpu = config.gpuLabel;
    roleState.services = [...config.services];
    roleState.proxy_base = `https://${pod.id}-{port}.proxy.runpod.net`;
    roleState.status = "booting";
    roleState.created = new Date().toISOString().slice(0, 10);
    roleState.note = `Provisioned on ${new Date().toISOString().slice(0, 10)} for VET-1106 after completed throwaway rehearsal.`;
  }

  writePods();
  statusLine(
    "ok",
    `Updated deploy/runpod/pods.json with ${rehearsal ? "rehearsal" : "live"} pod ${pod.id}`
  );
}

async function teardownRole(roleKey, { rehearsal = false, confirm = false } = {}) {
  const roleState = ensureRoleState(roleKey);
  const config = getRoleConfig(roleKey);
  const target = rehearsal ? roleState.rehearsal : roleState;

  if (!target?.pod_id) {
    statusLine(
      "warn",
      `${roleKey} has no ${rehearsal ? "rehearsal" : "live"} pod to teardown`
    );
    return;
  }

  console.log("");
  console.log(`=== ${config.displayName} teardown plan ===`);
  console.log(`Role:     ${roleKey}`);
  console.log(`Mode:     ${rehearsal ? "throwaway rehearsal" : "live"}`);
  console.log(`Pod ID:   ${target.pod_id}`);
  console.log(`Pod name: ${target.name || "unknown"}`);
  statusLine("warn", "Dry run only. Re-run with --confirm to delete this pod.");

  if (!confirm) {
    return;
  }

  const response = await runpodRequest(`/pods/${target.pod_id}`, {
    method: "DELETE",
  });
  if (![200, 202, 204, 404].includes(response.status)) {
    throw new Error(
      `Failed to teardown ${roleKey}: HTTP ${response.status} - ${JSON.stringify(response.body).slice(0, 200)}`
    );
  }

  if (rehearsal) {
    roleState.rehearsal = {
      ...(roleState.rehearsal || {}),
      pod_id: "",
      name: "",
      status: "torn_down",
      lastTeardownAt: timestamp(),
      note: "Throwaway rehearsal completed and torn down.",
    };
  } else {
    roleState.pod_id = "";
    roleState.proxy_base = "";
    roleState.status = "deleted";
    roleState.note = `Deleted on ${new Date().toISOString().slice(0, 10)} by teardown command.`;
  }

  writePods();
  statusLine(
    response.status === 404 ? "warn" : "ok",
    response.status === 404
      ? `${roleKey} pod was already absent on RunPod; registry cleared locally`
      : `Deleted ${roleKey} ${rehearsal ? "rehearsal " : ""}pod ${target.pod_id}`
  );
}

async function listRunpodPods() {
  const fixturePath = String(process.env.RUNPOD_PODS_FIXTURE_JSON || "").trim();
  if (fixturePath) {
    const resolvedPath = path.resolve(rootDir, fixturePath);
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    const podsList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.pods)
        ? parsed.pods
        : null;
    if (!Array.isArray(podsList)) {
      throw new Error(`Fixture at ${resolvedPath} must contain an array of pods`);
    }
    statusLine("warn", `Using RunPod reconcile fixture ${resolvedPath}`);
    return podsList;
  }

  const response = await runpodRequest("/pods", { method: "GET" });
  const podsList = Array.isArray(response.body)
    ? response.body
    : Array.isArray(response.body?.pods)
      ? response.body.pods
      : null;

  if (response.status !== 200 || !Array.isArray(podsList)) {
    throw new Error(
      `Unable to list RunPod pods: HTTP ${response.status} - ${JSON.stringify(response.body).slice(0, 240)}`
    );
  }

  return podsList;
}

function remotePodId(remotePod) {
  return String(
    remotePod?.id ||
      remotePod?.podId ||
      remotePod?.machineId ||
      remotePod?.pod_id ||
      ""
  ).trim();
}

function remotePodName(remotePod) {
  return String(remotePod?.name || remotePod?.podName || "").trim();
}

function remotePodStatus(remotePod) {
  return String(
    remotePod?.desiredStatus ||
      remotePod?.status ||
      remotePod?.state ||
      remotePod?.machineStatus ||
      "unknown"
  )
    .trim()
    .toLowerCase();
}

async function startRole(roleKey) {
  const pod = pods[roleKey];
  if (!pod?.pod_id) {
    statusLine("warn", `${roleKey} has no live pod to start`);
    return;
  }

  const response = await runpodRequest(`/pods/${pod.pod_id}/start`, {
    method: "POST",
  });
  if (response.status >= 200 && response.status < 300) {
    pod.status = "starting";
    writePods();
    statusLine("ok", `Started ${roleKey}: ${pod.pod_id}`);
    return;
  }

  throw new Error(
    `Failed to start ${roleKey}: HTTP ${response.status} - ${JSON.stringify(response.body).slice(0, 200)}`
  );
}

async function stopRole(roleKey) {
  const pod = pods[roleKey];
  if (!pod?.pod_id) {
    statusLine("warn", `${roleKey} has no live pod to stop`);
    return;
  }

  const response = await runpodRequest(`/pods/${pod.pod_id}/stop`, {
    method: "POST",
  });
  if (response.status >= 200 && response.status < 300) {
    pod.status = "stopped";
    writePods();
    statusLine("ok", `Stopped ${roleKey}: ${pod.pod_id}`);
    return;
  }

  throw new Error(
    `Failed to stop ${roleKey}: HTTP ${response.status} - ${JSON.stringify(response.body).slice(0, 200)}`
  );
}

function estimatedDailyCost(roleKey, pod) {
  if (!pod?.pod_id) return 0;
  if (roleKey === "consult_retrieval") return 17.76;
  if (roleKey === "async_review") {
    return String(pod.gpu || "").toLowerCase().includes("h100") ? 47.76 : 28.56;
  }
  return 0;
}

function printBillingAudit() {
  const warningThreshold = 40;
  const criticalThreshold = 50;
  const escalationThreshold = 60;
  let total = 0;

  console.log("");
  console.log("=== RunPod billing audit ===");
  for (const [role, pod] of Object.entries(pods)) {
    const estimated = estimatedDailyCost(role, pod);
    if (estimated <= 0) continue;
    total += estimated;
    const running = !["deleted", "not_provisioned", "stopped"].includes(
      String(pod.status || "").toLowerCase()
    );
    statusLine(
      running ? "ok" : "warn",
      `${role}: ${pod.gpu || "unknown GPU"} ${pod.status || "unknown"} -> estimated ${running ? "$" + estimated.toFixed(2) : "$0.00"} / day GPU spend`
    );
  }

  console.log(`Total estimated running GPU spend/day: $${total.toFixed(2)}`);
  if (total >= escalationThreshold) {
    statusLine("fail", `Estimated daily spend exceeds escalation threshold ($${escalationThreshold.toFixed(2)})`);
  } else if (total >= criticalThreshold) {
    statusLine("warn", `Estimated daily spend exceeds critical threshold ($${criticalThreshold.toFixed(2)})`);
  } else if (total >= warningThreshold) {
    statusLine("warn", `Estimated daily spend exceeds warning threshold ($${warningThreshold.toFixed(2)})`);
  } else {
    statusLine("ok", `Estimated daily spend remains below warning threshold ($${warningThreshold.toFixed(2)})`);
  }
}

async function reconcilePods(confirm = false) {
  const remotePods = await listRunpodPods();
  const remoteById = new Map(remotePods.map((pod) => [remotePodId(pod), pod]));
  const remoteByName = new Map(
    remotePods
      .map((pod) => [remotePodName(pod), pod])
      .filter(([name]) => Boolean(name))
  );
  let changes = 0;

  console.log("");
  console.log("=== RunPod registry reconcile ===");

  for (const [role, pod] of Object.entries(pods)) {
    ensureRoleState(role);
    const remoteByRegistryId = pod.pod_id ? remoteById.get(pod.pod_id) : null;
    const remoteByRegistryName = pod.name ? remoteByName.get(pod.name) : null;

    if (pod.pod_id && !remoteByRegistryId && !remoteByRegistryName) {
      statusLine(
        "warn",
        `${role}: registry points at missing pod ${pod.pod_id}`
      );
      if (confirm) {
        pod.pod_id = "";
        pod.proxy_base = "";
        pod.status = "deleted";
        pod.note = `Cleared by reconcile on ${new Date().toISOString().slice(0, 10)} after RunPod reported the pod missing.`;
        changes += 1;
      }
    } else if (!pod.pod_id && remoteByRegistryName) {
      statusLine(
        "warn",
        `${role}: registry is missing pod id, but RunPod still has ${remotePodId(remoteByRegistryName)} for ${pod.name}`
      );
      if (confirm) {
        pod.pod_id = remotePodId(remoteByRegistryName);
        pod.proxy_base = `https://${pod.pod_id}-{port}.proxy.runpod.net`;
        pod.status = remotePodStatus(remoteByRegistryName);
        pod.note = `Adopted by reconcile on ${new Date().toISOString().slice(0, 10)} from remote pod inventory.`;
        changes += 1;
      }
    } else if (pod.pod_id && remoteByRegistryName && !remoteByRegistryId) {
      statusLine(
        "warn",
        `${role}: registry pod id ${pod.pod_id} is stale; RunPod now reports ${remotePodId(remoteByRegistryName)} for ${pod.name}`
      );
      if (confirm) {
        pod.pod_id = remotePodId(remoteByRegistryName);
        pod.proxy_base = `https://${pod.pod_id}-{port}.proxy.runpod.net`;
        pod.status = remotePodStatus(remoteByRegistryName);
        pod.note = `Reconciled pod id on ${new Date().toISOString().slice(0, 10)} from remote pod inventory.`;
        changes += 1;
      }
    } else if (remoteByRegistryId) {
      const remoteStatus = remotePodStatus(remoteByRegistryId);
      if (remoteStatus && remoteStatus !== String(pod.status || "").toLowerCase()) {
        statusLine(
          "warn",
          `${role}: registry status ${pod.status || "unknown"} differs from RunPod ${remoteStatus}`
        );
        if (confirm) {
          pod.status = remoteStatus;
          changes += 1;
        }
      } else {
        statusLine("ok", `${role}: registry matches remote pod ${pod.pod_id}`);
      }
    }

    if (pod.rehearsal?.pod_id && !remoteById.has(pod.rehearsal.pod_id)) {
      statusLine(
        "warn",
        `${role}: rehearsal pod ${pod.rehearsal.pod_id} is stale in the registry`
      );
      if (confirm) {
        pod.rehearsal = {
          ...(pod.rehearsal || {}),
          pod_id: "",
          name: "",
          status: "deleted",
          note: "Cleared by reconcile after RunPod reported the rehearsal pod missing.",
        };
        changes += 1;
      }
    }
  }

  if (!confirm) {
    statusLine("warn", "Dry run only. Re-run with --confirm to write the registry changes.");
    return;
  }

  if (changes === 0) {
    statusLine("ok", "No registry changes were required.");
    return;
  }

  writePods();
  statusLine("ok", `Reconciled deploy/runpod/pods.json with ${changes} change(s).`);
}

async function stopRegistryPods() {
  for (const [role, pod] of Object.entries(pods)) {
    if (!pod.pod_id) continue;
    const r = await runpodRequest(`/pods/${pod.pod_id}/stop`, { method: "POST" });
    if (r.status >= 200 && r.status < 300) {
      statusLine("ok", `Stopped ${role}: ${pod.pod_id}`);
    } else {
      statusLine("warn", `Stop ${role}: HTTP ${r.status}`);
    }
    pod.status = "stopped";
  }
  writePods();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const doStatus = args.includes("--status");
const doWire = args.includes("--wire");
const doPlan = args.includes("--plan");
const doConfirm = args.includes("--confirm");
const doRehearsal = args.includes("--rehearsal");
const doProvisionConsult = args.includes("--provision-consult");
const doProvisionReview = args.includes("--provision-review");
const doStartConsult = args.includes("--start-consult");
const doStartReview = args.includes("--start-review");
const doStopConsult = args.includes("--stop-consult");
const doStopReview = args.includes("--stop-review");
const doTeardownConsult = args.includes("--teardown-consult");
const doTeardownReview = args.includes("--teardown-review");
const doReconcile = args.includes("--reconcile");
const doBillingAudit = args.includes("--billing-audit");
const doStopAll = args.includes("--stop-all");

if (doPlan) {
  printSizingSummary();
  printProvisionPlan("consult_retrieval", false);
  printProvisionPlan("async_review", false);
} else if (doStartConsult) {
  await startRole("consult_retrieval");
} else if (doStartReview) {
  await startRole("async_review");
} else if (doStopConsult) {
  await stopRole("consult_retrieval");
} else if (doStopReview) {
  await stopRole("async_review");
} else if (doProvisionConsult) {
  await provisionRole("consult_retrieval", {
    rehearsal: doRehearsal,
    confirm: doConfirm,
  });
} else if (doProvisionReview) {
  await provisionRole("async_review", {
    rehearsal: doRehearsal,
    confirm: doConfirm,
  });
} else if (doTeardownConsult) {
  await teardownRole("consult_retrieval", {
    rehearsal: doRehearsal,
    confirm: doConfirm,
  });
} else if (doTeardownReview) {
  await teardownRole("async_review", {
    rehearsal: doRehearsal,
    confirm: doConfirm,
  });
} else if (doReconcile) {
  await reconcilePods(doConfirm);
} else if (doBillingAudit) {
  printBillingAudit();
} else if (doStopAll) {
  await stopRegistryPods();
} else {
  printSizingSummary();
  const { results, summary } = await runHealthChecks();

  const healthyCount = Object.values(results).flatMap((r) => Object.values(r)).filter((s) => s.healthy).length;
  console.log(`\nHealthy services: ${healthyCount}`);

  if (doWire) {
    const wired = await wireVercel(results);
    if (!wired) {
      printHealthNextSteps(summary);
      process.exit(1);
    }
  } else if (healthyCount > 0 || doStatus || args.length === 0) {
    console.log("\nRun with --wire to push these URLs into Vercel.");
  }

  if (healthyCount === 0) {
    if (summary.missingPods.length > 0) {
      console.log("No services healthy because at least one required pod is not provisioned.");
    } else {
      console.log("No services healthy yet. Re-run once the pod finishes booting.");
    }
    printHealthNextSteps(summary);
  }
}
