/**
 * RunPod Narrow Model Pack — VET-915
 *
 * Deploys a minimal GPU pod running ONLY the essential text models:
 *   - Qwen 3.5 122B (extraction)
 *   - Llama 3.3 70B (phrasing)
 *   - Nemotron Ultra 253B (diagnosis)
 *   - GLM-5 (safety)
 *
 * This excludes vision models and heavy retrieval sidecars to minimize
 * GPU memory footprint and cost while maintaining core triage functionality.
 *
 * Usage:
 *   node scripts/runpod-provision-narrow.mjs --provision     # dry-run plan
 *   node scripts/runpod-provision-narrow.mjs --provision --force  # create pod
 *   node scripts/runpod-provision-narrow.mjs --health        # health check
 *   node scripts/runpod-provision-narrow.mjs --wire          # health + push URLs to Vercel
 *   node scripts/runpod-provision-narrow.mjs --stop          # stop pod
 *
 * Reads RUNPOD_API_KEY, HF_SIDECAR_API_KEY, VERCEL_TOKEN from .env files.
 * Updates deploy/runpod/pods.json with new "narrow_model_pack" entry.
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
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || "";
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "pawvital-ai";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "";

// ---------------------------------------------------------------------------
// Load pod registry
// ---------------------------------------------------------------------------
const podsPath = path.join(rootDir, "deploy", "runpod", "pods.json");
const pods = JSON.parse(fs.readFileSync(podsPath, "utf8"));

// ---------------------------------------------------------------------------
// Narrow model pack configuration
// ---------------------------------------------------------------------------
const NARROW_PACK_ROLE = "narrow_model_pack";
const NARROW_PACK_NAME = "pawvital-narrow-model-pack-v1";
const NARROW_PACK_PORT = "8085";

// Models included in the narrow pack
const NARROW_PACK_MODELS = {
  extraction: "qwen/qwen3.5-122b-a10b",
  phrasing: "meta/llama-3.3-70b-instruct",
  diagnosis: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  safety: "z-ai/glm5",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusLine(level, msg) {
  const prefix = level === "ok" ? "[OK]  " : level === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${prefix} ${msg}`);
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

async function runpodRequest(pathname, opts = {}) {
  if (!RUNPOD_API_KEY) {
    throw new Error("RUNPOD_API_KEY not set in .env files");
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

function readRunpodPublicKey() {
  const sshPubKeyPath = path.join(process.env.USERPROFILE || process.env.HOME || "", ".ssh", "runpod_id_ed25519.pub");
  return fs.existsSync(sshPubKeyPath) ? fs.readFileSync(sshPubKeyPath, "utf8").trim() : "";
}

function writePods() {
  fs.writeFileSync(podsPath, JSON.stringify(pods, null, 2));
}

function collectProvisionPrerequisites() {
  const publicKey = readRunpodPublicKey();
  const missing = [];

  if (!RUNPOD_API_KEY) {
    missing.push("RUNPOD_API_KEY");
  }

  if (!HF_SIDECAR_API_KEY) {
    missing.push("HF_SIDECAR_API_KEY");
  }

  if (!publicKey) {
    missing.push("~/.ssh/runpod_id_ed25519.pub");
  }

  return { missing, publicKey };
}

function reportMissingProvisionPrerequisites(missing) {
  console.error(
    `[FATAL] Missing narrow-pack provisioning prerequisites: ${missing.join(", ")}`
  );
  console.error(
    "Add the required secrets to .env.sidecars, .env.local, or .env before retrying."
  );
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

async function wireVercelApi(toSet) {
  if (!VERCEL_TOKEN) {
    return wireVercelWithCli(toSet);
  }

  const baseUrl = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`;

  let allSucceeded = true;
  for (const { key, value } of toSet) {
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

  return allSucceeded;
}

// ---------------------------------------------------------------------------
// Narrow model pack startup script (runs inside the pod)
// ---------------------------------------------------------------------------
function buildNarrowPackStartupScript() {
  const modelsJson = JSON.stringify(NARROW_PACK_MODELS);
  const modelNames = Object.keys(NARROW_PACK_MODELS).join(", ");
  return `set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# Install system dependencies
apt-get update
apt-get install -y --no-install-recommends curl build-essential openssh-server

# Setup SSH
mkdir -p /var/run/sshd /root/.ssh /workspace/venvs /workspace/logs /workspace/model-cache/narrow
chmod 700 /root/.ssh
if [ -n "\${PUBLIC_KEY:-}" ]; then
  printf '%s\\n' "$PUBLIC_KEY" > /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
fi
/usr/sbin/sshd

# Clone repo
rm -rf /workspace/pawvital-ai /workspace/pawvital-ai-master /workspace/repo.tgz
curl -L --fail https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/archive/refs/heads/master.tar.gz -o /workspace/repo.tgz
tar -xzf /workspace/repo.tgz -C /workspace
mv /workspace/pawvital-ai-master /workspace/pawvital-ai
cd /workspace/pawvital-ai

# Create Python virtual environment
/usr/bin/env python3 -m venv /workspace/venvs/narrow
/workspace/venvs/narrow/bin/pip install --upgrade pip setuptools wheel > /workspace/logs/install.log 2>&1

# Install narrow model pack dependencies
# Uses vLLM and lazy-loads one text model role at a time to bound GPU memory.
/workspace/venvs/narrow/bin/pip install -r /workspace/pawvital-ai/services/narrow-model-pack/requirements.txt > /workspace/logs/install.log 2>&1

# Launch the narrow model pack server
# Serves the configured roles on a single FastAPI app at port 8085
nohup env \\
  SIDECAR_API_KEY="\${SIDECAR_API_KEY}" \\
  NVIDIA_API_KEY="\${NVIDIA_API_KEY}" \\
  NARROW_PACK_MODELS='${modelsJson}' \\
  /workspace/venvs/narrow/bin/python \\
  /workspace/pawvital-ai/services/narrow-model-pack/server.py \\
  --port 8085 \\
  > /workspace/logs/narrow-pack.log 2>&1 &

echo "[live] narrow model pack serving: ${modelNames}" >> /workspace/logs/startup.log

# Keep container alive
exec tail -F /workspace/logs/narrow-pack.log`;
}

// ---------------------------------------------------------------------------
// Health check for narrow model pack
// ---------------------------------------------------------------------------
async function runNarrowPackHealthCheck() {
  const narrowPod = pods[NARROW_PACK_ROLE];
  if (!narrowPod || !narrowPod.pod_id) {
    statusLine("warn", `narrow_model_pack: no pod provisioned. Run with --provision to create.`);
    return { healthy: false, podId: null };
  }

  if (narrowPod.status === "deleted") {
    statusLine("warn", `narrow_model_pack: pod was deleted. Run with --provision to recreate.`);
    return { healthy: false, podId: null };
  }

  const podId = narrowPod.pod_id;
  const url = `https://${podId}-${NARROW_PACK_PORT}.proxy.runpod.net/healthz`;
  console.log(`\n--- narrow_model_pack (${podId}) ---`);

  const { status, body } = await checkHealth(url);

  if (status === 200) {
    statusLine("ok", `narrow-model-pack:${NARROW_PACK_PORT} healthy  ${body?.slice(0, 80) ?? ""}`);
    return { healthy: true, podId, url: `https://${podId}-${NARROW_PACK_PORT}.proxy.runpod.net` };
  } else if (status === 502) {
    statusLine("warn", `narrow-model-pack:${NARROW_PACK_PORT} 502 - service still starting`);
    return { healthy: false, podId, status: "booting" };
  } else if (status === null) {
    statusLine("warn", `narrow-model-pack:${NARROW_PACK_PORT} no response - pod not ready or booting`);
    return { healthy: false, podId, status: "booting" };
  } else {
    statusLine("fail", `narrow-model-pack:${NARROW_PACK_PORT} HTTP ${status}`);
    return { healthy: false, podId, status: "unhealthy" };
  }
}

// ---------------------------------------------------------------------------
// Wire narrow pack URL to Vercel
// ---------------------------------------------------------------------------
async function wireNarrowPackUrl(healthResult) {
  if (!healthResult.healthy) {
    statusLine("warn", "Cannot wire unhealthy pod");
    return false;
  }

  const toSet = [
    { key: "HF_NARROW_MODEL_PACK_URL", value: `${healthResult.url}/v1` },
    { key: "NARROW_PACK_ENABLED", value: "true" },
  ];

  // Add NVIDIA API key if available locally (needed for fallback)
  if (NVIDIA_API_KEY) {
    toSet.push({ key: "NVIDIA_API_KEY", value: NVIDIA_API_KEY });
  }

  return wireVercelApi(toSet);
}

// ---------------------------------------------------------------------------
// Provision narrow model pack pod
// ---------------------------------------------------------------------------
async function provisionNarrowPackPod() {
  // Show provisioning plan
  console.log("\n=== Narrow Model Pack Provisioning Plan ===\n");
  console.log(`Pod name:     ${NARROW_PACK_NAME}`);
  console.log(`GPU type:     NVIDIA A100 40GB (or equivalent)`);
  console.log(`GPU count:    1`);
  console.log(`Port:         ${NARROW_PACK_PORT}`);
  console.log(`Models:`);
  for (const [role, model] of Object.entries(NARROW_PACK_MODELS)) {
    console.log(`  - ${role}: ${model}`);
  }
  console.log("");

  const args = process.argv.slice(2);
  if (!args.includes("--force")) {
    console.log("This will create a new RunPod pod and bill your account.");
    console.log("Run with --force to skip this confirmation.\n");
    statusLine("warn", "Dry run. Add --force to provision.");
    return;
  }

  const { missing, publicKey } = collectProvisionPrerequisites();
  if (missing.length > 0) {
    reportMissingProvisionPrerequisites(missing);
    process.exit(1);
  }

  const payload = {
    name: NARROW_PACK_NAME,
    cloudType: "COMMUNITY",
    computeType: "GPU",
    gpuCount: 1,
    gpuTypeIds: [
      "NVIDIA A100 40GB PCIe",
      "NVIDIA A100-SXM4-40GB",
      "NVIDIA A100 80GB PCIe",
      "NVIDIA A100-SXM4-80GB",
      "NVIDIA RTX 6000 Ada Generation",
    ],
    gpuTypePriority: "custom",
    allowedCudaVersions: ["12.8", "12.6", "12.5", "12.4"],
    imageName: "runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04",
    ports: [`${NARROW_PACK_PORT}/http`, "22/tcp"],
    containerDiskInGb: 30,
    volumeInGb: 60,
    volumeMountPath: "/workspace",
    env: {
      PUBLIC_KEY: publicKey,
      SIDECAR_API_KEY: HF_SIDECAR_API_KEY,
      NVIDIA_API_KEY: NVIDIA_API_KEY || "",
    },
    dockerStartCmd: ["bash", "-lc", buildNarrowPackStartupScript()],
  };

  const r = await runpodRequest("/pods", { method: "POST", body: payload });
  if (r.status === 200 || r.status === 201) {
    const pod = r.body;
    statusLine("ok", `Provisioned narrow model pack pod: ${pod.id} (${pod.name})`);
    pods[NARROW_PACK_ROLE] = {
      pod_id: pod.id,
      name: pod.name,
      gpu: "NVIDIA A100 40GB or equivalent",
      services: [`narrow-model-pack-service:${NARROW_PACK_PORT}`],
      proxy_base: `https://${pod.id}-${NARROW_PACK_PORT}.proxy.runpod.net`,
      status: "booting",
      created: new Date().toISOString().slice(0, 10),
      note: `Provisioned on ${new Date().toISOString().slice(0, 10)} for VET-915. Serves: ${Object.keys(NARROW_PACK_MODELS).join(", ")}.`,
      models: NARROW_PACK_MODELS,
    };
    writePods();
    statusLine("ok", `Updated deploy/runpod/pods.json with narrow pack pod ${pod.id}`);
    console.log("\nNext steps:");
    console.log("  1. Wait 3-5 minutes for the pod to boot and download models");
    console.log("  2. Run: node scripts/runpod-provision-narrow.mjs --health");
    console.log("  3. Run: node scripts/runpod-provision-narrow.mjs --wire");
  } else {
    statusLine("fail", `Failed to provision narrow pack pod: HTTP ${r.status} - ${JSON.stringify(r.body).slice(0, 200)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Stop narrow model pack pod
// ---------------------------------------------------------------------------
async function stopNarrowPackPod() {
  const narrowPod = pods[NARROW_PACK_ROLE];
  if (!narrowPod || !narrowPod.pod_id) {
    statusLine("warn", "No narrow model pack pod to stop");
    return;
  }

  const r = await runpodRequest(`/pods/${narrowPod.pod_id}/stop`, { method: "POST" });
  if (r.status >= 200 && r.status < 300) {
    statusLine("ok", `Stopped narrow_model_pack: ${narrowPod.pod_id}`);
    narrowPod.status = "stopped";
    writePods();
  } else {
    statusLine("warn", `Stop narrow_model_pack: HTTP ${r.status}`);
  }
}

// ---------------------------------------------------------------------------
// Print usage
// ---------------------------------------------------------------------------
function printUsage() {
  console.log(`
Usage: node scripts/runpod-provision-narrow.mjs [OPTIONS]

Options:
  --provision     Show the plan, or create the narrow model pack pod with --force
  --health        Check health of the narrow model pack pod
  --wire          Health check + push URLs to Vercel
  --stop          Stop the narrow model pack pod
  --force         Skip dry-run confirmation (used with --provision)

Environment:
  RUNPOD_API_KEY          Required for pod provisioning
  HF_SIDECAR_API_KEY      Required for pod provisioning
  NVIDIA_API_KEY          Optional, pushed to pod for fallback routing
  VERCEL_TOKEN            Optional, for API-based env sync (falls back to CLI)
  ~/.ssh/runpod_id_ed25519.pub  Required for pod provisioning SSH access

Models served:
${Object.entries(NARROW_PACK_MODELS).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

if (args.includes("--provision")) {
  await provisionNarrowPackPod();
} else if (args.includes("--stop")) {
  await stopNarrowPackPod();
} else {
  const healthResult = await runNarrowPackHealthCheck();

  if (args.includes("--wire")) {
    const wired = await wireNarrowPackUrl(healthResult);
    if (!wired) {
      process.exit(1);
    }
  } else if (healthResult.healthy) {
    console.log("\nRun with --wire to push the narrow pack URL into Vercel.");
  }
}
