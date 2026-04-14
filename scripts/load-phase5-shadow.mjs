import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const outputPath = path.join(rootDir, "phase5-load-test-report.json");
const rolloutThresholds = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "src", "lib", "shadow-rollout-thresholds.json"),
    "utf8"
  )
);

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
  const baselineRps = Number(process.env.PHASE5_BASELINE_RPS || 2);
  const durationSeconds = Number(process.env.PHASE5_LOAD_TEST_SECONDS || 60);
  const targetRoute =
    process.env.PHASE5_LOAD_TEST_ROUTE || "/api/ai/shadow-rollout";
  const appBaseUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const options = {
    baseUrl: appBaseUrl.trim(),
    targetRoute,
    baselineRps,
    durationSeconds,
    targetRps:
      Number(process.env.PHASE5_TARGET_RPS) ||
      baselineRps * rolloutThresholds.loadTest.minTargetRpsMultiplier,
    output: outputPath,
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length).trim();
    } else if (arg.startsWith("--target-route=")) {
      options.targetRoute = arg.slice("--target-route=".length).trim();
    } else if (arg.startsWith("--baseline-rps=")) {
      options.baselineRps = Number(arg.slice("--baseline-rps=".length));
    } else if (arg.startsWith("--target-rps=")) {
      options.targetRps = Number(arg.slice("--target-rps=".length));
    } else if (arg.startsWith("--duration-seconds=")) {
      options.durationSeconds = Number(arg.slice("--duration-seconds=".length));
    } else if (arg.startsWith("--output=")) {
      options.output = path.resolve(rootDir, arg.slice("--output=".length));
    }
  }

  return options;
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

function rate(count, total) {
  if (total <= 0) return 0;
  return count / total;
}

function buildRouteUrl(baseUrl, routePath) {
  const url = new URL(baseUrl);
  url.pathname = routePath;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function buildShadowProbePayload() {
  return {
    session: {
      known_symptoms: ["wound_skin_issue"],
      answered_questions: ["wound_location"],
      extracted_answers: { wound_location: "left hind leg" },
      red_flags_triggered: [],
      candidate_diseases: ["wound_infection"],
      body_systems_involved: ["skin"],
      case_memory: {
        turn_count: 288,
        chief_complaints: ["skin lesion"],
        active_focus_symptoms: ["wound_skin_issue"],
        confirmed_facts: { wound_location: "left hind leg" },
        image_findings: ["localized lesion on left hind leg"],
        red_flag_notes: [],
        unresolved_question_ids: [],
        timeline_notes: ["present since yesterday"],
        visual_evidence: [],
        retrieval_evidence: [],
        consult_opinions: [],
        evidence_chain: [],
        service_timeouts: [],
        service_observations: [
          {
            service: "text-retrieval-service",
            stage: "shadow_probe",
            outcome: "shadow",
            latencyMs: 1200,
            shadowMode: true,
            fallbackUsed: false,
            recordedAt: new Date().toISOString(),
          },
        ],
        shadow_comparisons: [
          {
            service: "text-retrieval-service",
            usedStrategy: "nvidia-primary",
            shadowStrategy: "hf-sidecar",
            summary:
              "Shadow retrieval aligned with primary evidence selection.",
            disagreementCount: 0,
            recordedAt: new Date().toISOString(),
          },
        ],
        ambiguity_flags: [],
      },
    },
  };
}

function buildRequestOptions(targetRoute) {
  const sidecarSecret =
    (process.env.HF_SIDECAR_API_KEY ||
      process.env.ASYNC_REVIEW_WEBHOOK_SECRET ||
      "").trim();

  if (targetRoute === "/api/ai/shadow-rollout") {
    if (!sidecarSecret) {
      throw new Error(
        "HF_SIDECAR_API_KEY or ASYNC_REVIEW_WEBHOOK_SECRET must be set for shadow-rollout load tests"
      );
    }

    return {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sidecarSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildShadowProbePayload()),
    };
  }

  if (targetRoute === "/api/ai/sidecar-readiness") {
    if (!sidecarSecret) {
      throw new Error(
        "HF_SIDECAR_API_KEY or ASYNC_REVIEW_WEBHOOK_SECRET must be set for sidecar-readiness load tests"
      );
    }

    return {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sidecarSecret}`,
      },
    };
  }

  throw new Error(
    `Unsupported load-test route '${targetRoute}'. Use /api/ai/shadow-rollout or /api/ai/sidecar-readiness.`
  );
}

async function runSingleRequest(url, requestOptions) {
  const startedAt = Date.now();
  const response = await fetch(url, requestOptions);
  await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return Date.now() - startedAt;
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  const requestUrl = buildRouteUrl(options.baseUrl, options.targetRoute);
  const requestOptions = buildRequestOptions(options.targetRoute);
  const intervalMs = 1000 / Math.max(0.1, options.targetRps);
  const startedAt = Date.now();
  const endAt = startedAt + options.durationSeconds * 1000;
  const pending = [];
  let scheduled = 0;

  while (Date.now() < endAt) {
    const targetLaunch = startedAt + scheduled * intervalMs;
    await sleep(targetLaunch - Date.now());
    pending.push(runSingleRequest(requestUrl, requestOptions));
    scheduled += 1;
  }

  const settled = await Promise.allSettled(pending);
  const latenciesMs = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failureCount = settled.filter(
    (result) => result.status === "rejected"
  ).length;
  const totalRequests = settled.length;
  const errorRate = rate(failureCount, totalRequests);
  const p50LatencyMs = percentile(latenciesMs, 0.5);
  const p95LatencyMs = percentile(latenciesMs, 0.95);
  const p99LatencyMs = percentile(latenciesMs, 0.99);
  const blockers = [];

  if (
    options.targetRps <
    options.baselineRps * rolloutThresholds.loadTest.minTargetRpsMultiplier
  ) {
    blockers.push(
      `Target RPS ${options.targetRps} is below required ${(
        options.baselineRps * rolloutThresholds.loadTest.minTargetRpsMultiplier
      ).toFixed(2)}.`
    );
  }
  if (errorRate > rolloutThresholds.loadTest.maxErrorRate) {
    blockers.push(
      `Error rate ${Math.round(errorRate * 100)}% exceeds ${Math.round(
        rolloutThresholds.loadTest.maxErrorRate * 100
      )}%.`
    );
  }
  if (
    p99LatencyMs !== null &&
    p99LatencyMs > rolloutThresholds.loadTest.maxP99LatencyMs
  ) {
    blockers.push(
      `p99 latency ${p99LatencyMs}ms exceeds ${rolloutThresholds.loadTest.maxP99LatencyMs}ms.`
    );
  }

  const summary = {
    targetRoute: options.targetRoute,
    baselineRps: options.baselineRps,
    targetRps: options.targetRps,
    durationSeconds: options.durationSeconds,
    totalRequests,
    successCount: latenciesMs.length,
    failureCount,
    errorRate,
    p50LatencyMs,
    p95LatencyMs,
    p99LatencyMs,
    passed: blockers.length === 0,
    blockers,
  };

  fs.writeFileSync(options.output, JSON.stringify(summary, null, 2));

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `Load test ${summary.passed ? "passed" : "failed"} for ${summary.targetRoute} at ${options.targetRps} RPS (${summary.totalRequests} requests).`
    );
    console.log(`Saved to ${options.output}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
