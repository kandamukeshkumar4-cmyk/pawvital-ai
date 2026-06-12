#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL =
  process.env.PAWVITAL_PROBE_BASE_URL ||
  process.env.PAWVITAL_PRODUCTION_URL ||
  "https://pawvital-ai.vercel.app";
const DEFAULT_TIMEOUT_MS = 65_000;
const DEFAULT_MAX_LATENCY_MS = 10_000;
const DEFAULT_OUTPUT = "data/latency/prod-probe-latest.json";
const DEFAULT_JSONL = "data/latency/prod-probe.jsonl";

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    dryRun: false,
    jsonlPath: DEFAULT_JSONL,
    maxLatencyMs: Number.parseInt(
      process.env.PAWVITAL_PROBE_MAX_LATENCY_MS || `${DEFAULT_MAX_LATENCY_MS}`,
      10
    ),
    message:
      process.env.PAWVITAL_PROBE_MESSAGE ||
      "My dog has been limping a little since this morning.",
    outputPath: DEFAULT_OUTPUT,
    timeoutMs: Number.parseInt(
      process.env.PAWVITAL_PROBE_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`,
      10
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      options.baseUrl = String(argv[++index] || "").trim();
    } else if (arg === "--jsonl") {
      options.jsonlPath = String(argv[++index] || "").trim();
    } else if (arg === "--max-latency-ms") {
      options.maxLatencyMs = Number.parseInt(String(argv[++index] || ""), 10);
    } else if (arg === "--message") {
      options.message = String(argv[++index] || "");
    } else if (arg === "--output") {
      options.outputPath = String(argv[++index] || "").trim();
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number.parseInt(String(argv[++index] || ""), 10);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }
  if (!Number.isFinite(options.maxLatencyMs) || options.maxLatencyMs <= 0) {
    throw new Error("--max-latency-ms must be a positive number");
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/synthetic-prod-probe.mjs [options]

Runs a synthetic symptom-chat production probe and writes sanitized latency artifacts.

Options:
  --base-url <url>          Default: PAWVITAL_PROBE_BASE_URL or production
  --timeout-ms <ms>         Fetch timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --max-latency-ms <ms>     Fail when latency exceeds this. Default: ${DEFAULT_MAX_LATENCY_MS}
  --message <text>          Synthetic owner message
  --output <path>           Latest JSON artifact path
  --jsonl <path>            Append-only JSONL artifact path
  --dry-run                 Build/write a skipped artifact without hitting production
`);
}

function buildProbeUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.pathname = "/api/ai/symptom-chat";
  url.search = "";
  return url;
}

function buildPayload(message) {
  return {
    action: "chat",
    messages: [{ role: "user", content: message }],
    pet: {
      age_years: 5,
      breed: "Mixed breed",
      name: "Synthetic",
      species: "dog",
      weight: 45,
    },
  };
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function writeArtifacts(record, options) {
  ensureParentDir(options.outputPath);
  ensureParentDir(options.jsonlPath);
  fs.writeFileSync(options.outputPath, `${JSON.stringify(record, null, 2)}\n`);
  fs.appendFileSync(options.jsonlPath, `${JSON.stringify(record)}\n`);
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { responseType: "non_object", readyForReport: null };
  }
  return {
    conversationState:
      typeof payload.conversationState === "string"
        ? payload.conversationState
        : null,
    readyForReport:
      typeof payload.ready_for_report === "boolean"
        ? payload.ready_for_report
        : null,
    responseType: typeof payload.type === "string" ? payload.type : "unknown",
  };
}

async function runProbe(options) {
  const probeUrl = buildProbeUrl(options.baseUrl);
  const startedAt = Date.now();
  const record = {
    baseUrl: new URL(options.baseUrl).origin,
    checkedAt: new Date(startedAt).toISOString(),
    endpoint: probeUrl.toString(),
    latencyMs: null,
    maxLatencyMs: options.maxLatencyMs,
    ok: false,
    response: null,
    status: null,
  };

  if (options.dryRun) {
    record.latencyMs = 0;
    record.ok = true;
    record.response = { responseType: "dry_run", readyForReport: null };
    return record;
  }

  try {
    const response = await fetch(probeUrl, {
      body: JSON.stringify(buildPayload(options.message)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const latencyMs = Date.now() - startedAt;
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    record.latencyMs = latencyMs;
    record.status = response.status;
    record.response = summarizePayload(payload);
    record.ok =
      response.ok &&
      latencyMs <= options.maxLatencyMs &&
      ["question", "ready", "emergency"].includes(record.response.responseType);
    return record;
  } catch (error) {
    record.latencyMs = Date.now() - startedAt;
    record.response = {
      error: error instanceof Error ? error.message : String(error),
      responseType: "probe_error",
    };
    return record;
  }
}

const options = parseArgs(process.argv.slice(2));
const record = await runProbe(options);
writeArtifacts(record, options);

console.log(JSON.stringify(record, null, 2));
if (!record.ok) {
  process.exit(1);
}
