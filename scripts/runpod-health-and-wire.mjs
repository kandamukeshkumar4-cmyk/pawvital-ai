/**
 * runpod-health-and-wire.mjs
 *
 * Usage:
 *   node scripts/runpod-health-and-wire.mjs                 # check health only
 *   node scripts/runpod-health-and-wire.mjs --wire         # check + push passing URLs to Vercel
 *   node scripts/runpod-health-and-wire.mjs --provision-consult
 *   node scripts/runpod-health-and-wire.mjs --provision-review
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

if (!RUNPOD_API_KEY) {
  console.error("[FATAL] RUNPOD_API_KEY not set in .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load pod registry
// ---------------------------------------------------------------------------
const podsPath = path.join(rootDir, "deploy", "runpod", "pods.json");
const pods = JSON.parse(fs.readFileSync(podsPath, "utf8"));

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

async function runpodRequest(pathname, opts = {}) {
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

// ---------------------------------------------------------------------------
// Health check all known pods
// ---------------------------------------------------------------------------
async function runHealthChecks() {
  const results = {};

  for (const [role, pod] of Object.entries(pods)) {
    if (!pod.pod_id) {
      statusLine("warn", `${role}: no pod provisioned yet`);
      continue;
    }

    console.log(`\n--- ${role} (${pod.pod_id}) ---`);

    for (const svc of pod.services) {
      const [name, port] = svc.split(":");
      const url = `https://${pod.pod_id}-${port}.proxy.runpod.net/healthz`;
      const { status, body } = await checkHealth(url);

      if (status === 200) {
        statusLine("ok", `${name}:${port} healthy  ${body?.slice(0, 80) ?? ""}`);
        if (!results[role]) results[role] = {};
        results[role][port] = { url: `https://${pod.pod_id}-${port}.proxy.runpod.net`, healthy: true };
      } else if (status === 502) {
        statusLine("warn", `${name}:${port} 502 - service still starting`);
      } else if (status === null) {
        statusLine("warn", `${name}:${port} no response - pod not ready or booting`);
      } else {
        statusLine("fail", `${name}:${port} HTTP ${status}`);
      }
    }
  }

  return results;
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
  if (!VERCEL_TOKEN) {
    statusLine("warn", "VERCEL_TOKEN not set - skipping Vercel env sync");
    return;
  }

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
    return;
  }

  const baseUrl = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`;

  for (const { key, value } of toSet) {
    const r = await fetchJson(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
      body: { key, value, type: "encrypted", target: ["production", "preview"] },
    });
    if (r.status === 200 || r.status === 201) {
      statusLine("ok", `Vercel: set ${key}=${value}`);
    } else if (r.status === 409) {
      const patchUrl = VERCEL_TEAM_ID
        ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env/${r.body?.existing?.id}?teamId=${VERCEL_TEAM_ID}`
        : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env/${r.body?.existing?.id}`;
      const pr = await fetchJson(patchUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
        body: { value, type: "encrypted", target: ["production", "preview"] },
      });
      statusLine(pr.status < 300 ? "ok" : "fail", `Vercel PATCH ${key}: HTTP ${pr.status}`);
    } else {
      statusLine("fail", `Vercel set ${key}: HTTP ${r.status} - ${JSON.stringify(r.body).slice(0, 120)}`);
    }
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
curl -L --fail https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/archive/refs/heads/master.tar.gz -o /workspace/repo.tgz
tar -xzf /workspace/repo.tgz -C /workspace
mv /workspace/pawvital-ai-master /workspace/pawvital-ai
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
curl -L --fail https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/archive/refs/heads/master.tar.gz -o /workspace/repo.tgz
tar -xzf /workspace/repo.tgz -C /workspace
mv /workspace/pawvital-ai-master /workspace/pawvital-ai
cd /workspace/pawvital-ai
/usr/bin/env python3 -m venv /workspace/venvs/review
/workspace/venvs/review/bin/pip install --upgrade pip setuptools wheel > /workspace/logs/full-install.log 2>&1
/workspace/venvs/review/bin/pip install -r services/async-review-service/requirements.txt >> /workspace/logs/full-install.log 2>&1
nohup env SIDECAR_API_KEY="\${SIDECAR_API_KEY}" STUB_MODE=false HF_HOME=/workspace/model-cache/review REVIEW_MODEL_ID=Qwen/Qwen2.5-VL-32B-Instruct /workspace/venvs/review/bin/python -m uvicorn app.main:app --app-dir /workspace/pawvital-ai/services/async-review-service --host 0.0.0.0 --port 8084 > /workspace/logs/async-review.log 2>&1 &
echo "[live] async-review started in LIVE mode" >> /workspace/logs/startup.log
exec tail -F /workspace/logs/async-review.log`;
}

async function provisionConsultPod() {
  if (!HF_SIDECAR_API_KEY) {
    console.error("[FATAL] HF_SIDECAR_API_KEY not set");
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[FATAL] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    process.exit(1);
  }

  const publicKey = readRunpodPublicKey();
  const payload = {
    name: "pawvital-consult-retrieval-v6",
    cloudType: "COMMUNITY",
    computeType: "GPU",
    gpuCount: 1,
    gpuTypeIds: [
      "NVIDIA GeForce RTX 4090",
      "NVIDIA RTX A6000",
      "NVIDIA RTX 6000 Ada Generation",
      "NVIDIA L40S",
      "NVIDIA GeForce RTX 3090",
    ],
    gpuTypePriority: "custom",
    allowedCudaVersions: ["12.8", "12.6", "12.5", "12.4"],
    imageName: "runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04",
    ports: ["8081/http", "8082/http", "8083/http", "22/tcp"],
    containerDiskInGb: 40,
    volumeInGb: 80,
    volumeMountPath: "/workspace",
    env: {
      PUBLIC_KEY: publicKey,
      SIDECAR_API_KEY: HF_SIDECAR_API_KEY,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    },
    dockerStartCmd: ["bash", "-lc", buildConsultStartupScript()],
  };

  const r = await runpodRequest("/pods", { method: "POST", body: payload });
  if (r.status === 200 || r.status === 201) {
    const pod = r.body;
    statusLine("ok", `Provisioned consult/retrieval pod: ${pod.id} (${pod.name})`);
    pods.consult_retrieval.pod_id = pod.id;
    pods.consult_retrieval.name = pod.name;
    pods.consult_retrieval.proxy_base = `https://${pod.id}-{port}.proxy.runpod.net`;
    pods.consult_retrieval.status = "booting";
    pods.consult_retrieval.created = new Date().toISOString().slice(0, 10);
    writePods();
    statusLine("ok", `Updated deploy/runpod/pods.json with consult pod ${pod.id}`);
  } else {
    statusLine("fail", `Failed to provision consult pod: HTTP ${r.status} - ${JSON.stringify(r.body).slice(0, 200)}`);
    process.exit(1);
  }
}

async function provisionReviewPod() {
  if (!HF_SIDECAR_API_KEY) {
    console.error("[FATAL] HF_SIDECAR_API_KEY not set");
    process.exit(1);
  }

  const publicKey = readRunpodPublicKey();
  const payload = {
    name: "pawvital-async-review-v1",
    cloudType: "COMMUNITY",
    computeType: "GPU",
    gpuCount: 1,
    gpuTypeIds: [
      "NVIDIA A100 80GB PCIe",
      "NVIDIA A100-SXM4-80GB",
      "NVIDIA H100 NVL",
    ],
    gpuTypePriority: "custom",
    allowedCudaVersions: ["12.8", "12.6", "12.5", "12.4"],
    imageName: "runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04",
    ports: ["8084/http", "22/tcp"],
    containerDiskInGb: 40,
    volumeInGb: 120,
    volumeMountPath: "/workspace",
    env: {
      PUBLIC_KEY: publicKey,
      SIDECAR_API_KEY: HF_SIDECAR_API_KEY,
    },
    dockerStartCmd: ["bash", "-lc", buildReviewStartupScript()],
  };

  const r = await runpodRequest("/pods", { method: "POST", body: payload });
  if (r.status === 200 || r.status === 201) {
    const pod = r.body;
    statusLine("ok", `Provisioned review pod: ${pod.id} (${pod.name})`);
    pods.async_review.pod_id = pod.id;
    pods.async_review.name = pod.name;
    pods.async_review.proxy_base = `https://${pod.id}-{port}.proxy.runpod.net`;
    pods.async_review.status = "booting";
    writePods();
    statusLine("ok", `Updated deploy/runpod/pods.json with review pod ${pod.id}`);
  } else {
    statusLine("fail", `Failed to provision review pod: HTTP ${r.status} - ${JSON.stringify(r.body).slice(0, 200)}`);
    process.exit(1);
  }
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
const doWire = args.includes("--wire");
const doProvisionConsult = args.includes("--provision-consult");
const doProvisionReview = args.includes("--provision-review");
const doStopAll = args.includes("--stop-all");

if (doProvisionConsult) {
  await provisionConsultPod();
} else if (doProvisionReview) {
  await provisionReviewPod();
} else if (doStopAll) {
  await stopRegistryPods();
} else {
  const results = await runHealthChecks();

  const healthyCount = Object.values(results).flatMap((r) => Object.values(r)).filter((s) => s.healthy).length;
  console.log(`\nHealthy services: ${healthyCount}`);

  if (doWire) {
    await wireVercel(results);
  } else if (healthyCount > 0) {
    console.log("\nRun with --wire to push these URLs into Vercel.");
  }

  if (healthyCount === 0) {
    console.log("No services healthy yet. Re-run once the pod finishes booting.");
    console.log("Check boot progress:");
    for (const pod of Object.values(pods)) {
      if (pod.pod_id) {
        console.log("  ssh -i ~/.ssh/runpod_id_ed25519 -p <SSH_PORT> root@<PUBLIC_IP> 'tail -100 /workspace/logs/*.log'");
        break;
      }
    }
  }
}
