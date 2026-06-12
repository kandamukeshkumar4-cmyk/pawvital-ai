#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_INPUT = "data/latency/prod-probe.jsonl";
const DEFAULT_OUTPUT = "data/latency/prod-latency-scorecard.md";
const DEFAULT_JSON = "data/latency/prod-latency-scorecard.json";

function parseArgs(argv) {
  const options = {
    inputPath: DEFAULT_INPUT,
    jsonPath: DEFAULT_JSON,
    minSamples: Number.parseInt(
      process.env.PAWVITAL_LATENCY_SCORECARD_MIN_SAMPLES || "1",
      10
    ),
    outputPath: DEFAULT_OUTPUT,
    windowHours: Number.parseInt(
      process.env.PAWVITAL_LATENCY_SCORECARD_WINDOW_HOURS || "24",
      10
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      options.inputPath = String(argv[++index] || "").trim();
    } else if (arg === "--json") {
      options.jsonPath = String(argv[++index] || "").trim();
    } else if (arg === "--min-samples") {
      options.minSamples = Number.parseInt(String(argv[++index] || ""), 10);
    } else if (arg === "--output") {
      options.outputPath = String(argv[++index] || "").trim();
    } else if (arg === "--window-hours") {
      options.windowHours = Number.parseInt(String(argv[++index] || ""), 10);
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.minSamples) || options.minSamples < 1) {
    throw new Error("--min-samples must be at least 1");
  }
  if (!Number.isFinite(options.windowHours) || options.windowHours < 1) {
    throw new Error("--window-hours must be at least 1");
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/synthetic-latency-scorecard.mjs [options]

Builds a sanitized latency scorecard from synthetic production probe JSONL.

Options:
  --input <path>          Probe JSONL path. Default: ${DEFAULT_INPUT}
  --output <path>         Markdown scorecard path. Default: ${DEFAULT_OUTPUT}
  --json <path>           JSON scorecard path. Default: ${DEFAULT_JSON}
  --window-hours <n>      Include probes from this lookback. Default: 24
  --min-samples <n>       Fail below this sample count. Default: 1
`);
}

function readRecords(inputPath) {
  if (!fs.existsSync(inputPath)) {
    return [];
  }

  return fs
    .readFileSync(inputPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  );
  return sorted[index] ?? null;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function formatMs(value) {
  return typeof value === "number" ? `${value} ms` : "n/a";
}

function buildScorecard(records, options) {
  const now = Date.now();
  const windowStartMs = now - options.windowHours * 60 * 60 * 1000;
  const windowed = records.filter((record) => {
    const checkedAtMs = Date.parse(record.checkedAt || "");
    return Number.isFinite(checkedAtMs) && checkedAtMs >= windowStartMs;
  });
  const latencies = windowed
    .map((record) => record.latencyMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const failures = windowed.filter((record) => record.ok !== true);
  const samplesReady = windowed.length >= options.minSamples;

  return {
    generatedAt: new Date(now).toISOString(),
    maxLatencyMs:
      windowed.find((record) => typeof record.maxLatencyMs === "number")
        ?.maxLatencyMs ?? null,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    pass: samplesReady && failures.length === 0,
    sampleCount: windowed.length,
    samplesReady,
    status:
      !samplesReady
        ? "insufficient_samples"
        : failures.length > 0
          ? "failed"
          : "passed",
    failureCount: failures.length,
    failures: failures.slice(-10).map((record) => ({
      checkedAt: record.checkedAt,
      latencyMs: record.latencyMs,
      responseType: record.response?.responseType ?? null,
      status: record.status,
    })),
    windowHours: options.windowHours,
  };
}

function renderMarkdown(scorecard) {
  const lines = [
    "# PawVital Production Latency Scorecard",
    "",
    `Generated: ${scorecard.generatedAt}`,
    `Window: ${scorecard.windowHours}h`,
    `Status: ${scorecard.status}`,
    `Samples: ${scorecard.sampleCount}`,
    `Failures: ${scorecard.failureCount}`,
    `Threshold: ${formatMs(scorecard.maxLatencyMs)}`,
    `p50: ${formatMs(scorecard.p50LatencyMs)}`,
    `p95: ${formatMs(scorecard.p95LatencyMs)}`,
    "",
  ];

  if (scorecard.failures.length > 0) {
    lines.push("## Recent Failures", "");
    for (const failure of scorecard.failures) {
      lines.push(
        `- ${failure.checkedAt}: status=${failure.status ?? "n/a"}, latency=${formatMs(
          failure.latencyMs
        )}, response=${failure.responseType ?? "n/a"}`
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

const options = parseArgs(process.argv.slice(2));
const records = readRecords(options.inputPath);
const scorecard = buildScorecard(records, options);

ensureParentDir(options.outputPath);
ensureParentDir(options.jsonPath);
fs.writeFileSync(options.outputPath, renderMarkdown(scorecard));
fs.writeFileSync(options.jsonPath, `${JSON.stringify(scorecard, null, 2)}\n`);

console.log(JSON.stringify(scorecard, null, 2));
if (!scorecard.pass) {
  process.exit(1);
}
