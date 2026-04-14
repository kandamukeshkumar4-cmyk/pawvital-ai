import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const vercelProjectConfigPath = path.join(rootDir, ".vercel", "project.json");

function inferWorkspaceProjectName() {
  return path.basename(rootDir).replace(/-(codex|claude|minimax)$/i, "");
}

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
loadEnvFiles();

function readVercelProjectConfig() {
  const envProjectName = inferWorkspaceProjectName();
  if (!fs.existsSync(vercelProjectConfigPath)) {
    return { projectName: envProjectName };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(vercelProjectConfigPath, "utf8"));
    return {
      projectName: String(parsed.projectName || envProjectName).trim(),
    };
  } catch {
    return { projectName: envProjectName };
  }
}

function inferDefaultAppBaseUrl() {
  const config = readVercelProjectConfig();
  if (config?.projectName) {
    return `https://${config.projectName}.vercel.app`;
  }
  return `https://${inferWorkspaceProjectName()}.vercel.app`;
}

const APP_BASE_URL =
  (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    inferDefaultAppBaseUrl()
  ).trim();
const SIDEcar_SECRET =
  (process.env.HF_SIDECAR_API_KEY || process.env.ASYNC_REVIEW_WEBHOOK_SECRET || "").trim();
const podsPath = path.join(rootDir, "deploy", "runpod", "pods.json");
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const skipLoadTest = process.argv.includes("--skip-load-test");
const outputPath = outputArg
  ? path.resolve(rootDir, outputArg.split("=")[1])
  : path.join(rootDir, "phase5-shadow-report.md");
const jsonMode = process.argv.includes("--json");

function buildAppRouteUrl(baseUrl, routePath) {
  const routeUrl = new URL(baseUrl);
  routeUrl.pathname = routePath;
  routeUrl.search = "";
  routeUrl.hash = "";
  return routeUrl.toString();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  let body = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body, rawText };
}

function runLoadTest() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(rootDir, "scripts", "load-phase5-shadow.mjs"),
      "--json",
      `--base-url=${APP_BASE_URL}`,
    ],
    {
      cwd: rootDir,
      env: process.env,
      encoding: "utf8",
    }
  );

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() || result.stdout?.trim() || "load test failed"
    );
  }

  return JSON.parse(result.stdout || "null");
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
        turn_count: 2,
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
            strategy: "shadow",
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
            summary: "Shadow retrieval aligned with primary evidence selection.",
            disagreementCount: 0,
            recordedAt: new Date().toISOString(),
          },
        ],
        ambiguity_flags: [],
      },
    },
  };
}

async function main() {
  if (!APP_BASE_URL) {
    throw new Error("APP_BASE_URL or NEXT_PUBLIC_APP_URL must be set");
  }

  if (!SIDEcar_SECRET) {
    throw new Error("HF_SIDECAR_API_KEY or ASYNC_REVIEW_WEBHOOK_SECRET must be set");
  }

  const headers = {
    Authorization: `Bearer ${SIDEcar_SECRET}`,
    "Content-Type": "application/json",
  };
  const loadTest = skipLoadTest ? null : runLoadTest();

  const readinessUrl = buildAppRouteUrl(APP_BASE_URL, "/api/ai/sidecar-readiness");
  const shadowUrl = buildAppRouteUrl(APP_BASE_URL, "/api/ai/shadow-rollout");

  const [readiness, shadow] = await Promise.all([
    fetchJson(readinessUrl, { headers }),
    fetchJson(shadowUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...buildShadowProbePayload(),
        loadTest,
      }),
    }),
  ]);

  const pods = fs.existsSync(podsPath)
    ? JSON.parse(fs.readFileSync(podsPath, "utf8"))
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    appBaseUrl: APP_BASE_URL,
    readiness: {
      ok: readiness.ok,
      status: readiness.status,
      summary: readiness.body?.readiness || null,
    },
    shadow: {
      ok: shadow.ok,
      status: shadow.status,
      summary: shadow.body?.summary || null,
      observability: shadow.body?.observability || null,
    },
    loadTest,
    runpodPods: pods,
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const markdown = [
    "# Phase 5 Shadow Validation Report",
    "",
    `Generated: ${report.generatedAt}`,
    `App base URL: ${report.appBaseUrl}`,
    "",
    "## Readiness",
    "",
    `- HTTP status: ${report.readiness.status}`,
    `- OK: ${report.readiness.ok}`,
    `- Configured sidecars: ${report.readiness.summary?.configuredCount ?? "n/a"}`,
    `- Healthy sidecars: ${report.readiness.summary?.healthyCount ?? "n/a"}`,
    `- Stub sidecars: ${report.readiness.summary?.stubCount ?? "n/a"}`,
    `- Unhealthy sidecars: ${report.readiness.summary?.unhealthyCount ?? "n/a"}`,
    "",
    "## Shadow Rollout",
    "",
    `- HTTP status: ${report.shadow.status}`,
    `- OK: ${report.shadow.ok}`,
    `- Overall status: ${report.shadow.summary?.overallStatus ?? "n/a"}`,
    `- Ready services: ${report.shadow.summary?.services?.filter((service) => service.status === "ready").length ?? 0}`,
    `- Watch services: ${report.shadow.summary?.services?.filter((service) => service.status === "watch").length ?? 0}`,
    `- Blocked services: ${report.shadow.summary?.services?.filter((service) => service.status === "blocked").length ?? 0}`,
    `- Insufficient-data services: ${report.shadow.summary?.services?.filter((service) => service.status === "insufficient_data").length ?? 0}`,
    `- Recent service call count: ${report.shadow.observability?.recentServiceCallCount ?? "n/a"}`,
    `- Recent shadow comparison count: ${report.shadow.observability?.recentShadowComparisonCount ?? "n/a"}`,
    "",
    "## Load Test",
    "",
    `- Executed: ${report.loadTest ? "yes" : "no"}`,
    `- Target route: ${report.loadTest?.targetRoute ?? "n/a"}`,
    `- Baseline RPS: ${report.loadTest?.baselineRps ?? "n/a"}`,
    `- Target RPS: ${report.loadTest?.targetRps ?? "n/a"}`,
    `- Duration (seconds): ${report.loadTest?.durationSeconds ?? "n/a"}`,
    `- Total requests: ${report.loadTest?.totalRequests ?? "n/a"}`,
    `- Error rate: ${report.loadTest ? `${Math.round(report.loadTest.errorRate * 100)}%` : "n/a"}`,
    `- p99 latency: ${report.loadTest?.p99LatencyMs ?? "n/a"}`,
    `- Passed: ${report.loadTest?.passed ?? "n/a"}`,
    report.loadTest?.blockers?.length
      ? `- Blockers: ${report.loadTest.blockers.join(" | ")}`
      : "- Blockers: none",
    "",
    "## Service Gates",
    "",
    ...(report.shadow.summary?.services || []).flatMap((service) => [
      `- ${service.service}: status=${service.status}, sampleMode=${service.sampleMode}, windowSamples=${service.window?.observedWindowSamples ?? "n/a"}, healthyRatio=${service.window ? `${Math.round(service.window.healthySampleRatio * 100)}%` : "n/a"}, loadTest=${service.loadTestStatus}`,
      ...(service.blockers?.length
        ? [`  blockers: ${service.blockers.join(" | ")}`]
        : ["  blockers: none"]),
    ]),
    "",
    "## RunPod Pods",
    "",
    `\`\`\`json`,
    JSON.stringify(report.runpodPods, null, 2),
    `\`\`\``,
    "",
  ].join("\n");

  fs.writeFileSync(outputPath, markdown);
  console.log(`Wrote Phase 5 report to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
