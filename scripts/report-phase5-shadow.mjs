import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadEnvFiles } from "./lib/load-env-files.mjs";

const rootDir = process.cwd();
const vercelProjectConfigPath = path.join(rootDir, ".vercel", "project.json");

function inferWorkspaceProjectName() {
  return path.basename(rootDir).replace(/-(codex|claude|minimax)$/i, "");
}

function readVercelProjectConfig() {
  const fallbackName = inferWorkspaceProjectName();
  if (!fs.existsSync(vercelProjectConfigPath)) {
    return { projectName: fallbackName };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(vercelProjectConfigPath, "utf8"));
    return { projectName: String(parsed.projectName || fallbackName).trim() };
  } catch {
    return { projectName: fallbackName };
  }
}

function inferDefaultAppBaseUrl() {
  const config = readVercelProjectConfig();
  return `https://${config.projectName || inferWorkspaceProjectName()}.vercel.app`;
}

function isTrustedAppBaseUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isTrustedVercelHost =
    hostname === "pawvital-ai.vercel.app" ||
    (hostname.endsWith(".vercel.app") && hostname.includes("pawvital"));

  if (isLocalHost) {
    return url.protocol === "http:" || url.protocol === "https:";
  }

  return url.protocol === "https:" && isTrustedVercelHost;
}

function resolveAppBaseUrl() {
  const appBaseUrl = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    inferDefaultAppBaseUrl()
  ).trim();

  if (
    process.env.ALLOW_UNTRUSTED_APP_BASE_URL?.trim() === "1" ||
    isTrustedAppBaseUrl(appBaseUrl)
  ) {
    return appBaseUrl;
  }

  throw new Error(
    `Refusing to send shadow debug credentials to untrusted APP_BASE_URL host: ${appBaseUrl}. Set ALLOW_UNTRUSTED_APP_BASE_URL=1 only if you intentionally want to override this safeguard.`
  );
}

function parseArgs(argv) {
  const outputArg = argv.find((arg) => arg.startsWith("--output="));
  return {
    json: argv.includes("--json"),
    outputPath: outputArg
      ? path.resolve(rootDir, outputArg.split("=")[1])
      : path.join(rootDir, "phase5-shadow-report.md"),
  };
}

function buildRouteUrl(baseUrl, routePath) {
  const url = new URL(baseUrl);
  url.pathname = routePath;
  url.search = "";
  url.hash = "";
  return url.toString();
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

function formatMs(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : "n/a";
}

function formatPct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function buildServiceMarkdown(service, metrics) {
  const blockers =
    Array.isArray(service.blockers) && service.blockers.length > 0
      ? service.blockers.map((item) => `  - ${item}`).join("\n")
      : "  - none";

  return [
    `### ${service.service}`,
    `- Promotion status: ${service.status}`,
    `- Sample mode: ${service.sampleMode}`,
    `- Window samples: ${service.window?.observedWindowSamples ?? 0}/${service.window?.requiredHealthySamples ?? "n/a"} ` +
      `(healthy ${(service.window?.healthySampleRatio * 100 || 0).toFixed(1)}%)`,
    `- p95 latency: ${formatMs(metrics?.p95LatencyMs ?? null)}`,
    `- Average latency: ${formatMs(service.averageLatencyMs)}`,
    `- Timeout rate: ${formatPct(metrics?.timeoutRate ?? null)}`,
    `- Error rate: ${formatPct(metrics?.errorRate ?? null)}`,
    `- Fallback rate: ${formatPct(metrics?.fallbackRate ?? null)}`,
    `- Disagreement rate: ${formatPct(metrics?.disagreementRate ?? null)}`,
    `- Load test: ${service.loadTestStatus}`,
    "- Blockers:",
    blockers,
  ].join("\n");
}

async function main() {
  loadEnvFiles(rootDir);
  const args = parseArgs(process.argv.slice(2));
  const appBaseUrl = resolveAppBaseUrl();
  const sidecarSecret = (
    process.env.HF_SIDECAR_API_KEY ||
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET ||
    ""
  ).trim();

  if (!sidecarSecret) {
    throw new Error("HF_SIDECAR_API_KEY or ASYNC_REVIEW_WEBHOOK_SECRET must be set");
  }

  const headers = { Authorization: `Bearer ${sidecarSecret}` };
  const readinessUrl = buildRouteUrl(appBaseUrl, "/api/ai/sidecar-readiness");
  const shadowUrl = buildRouteUrl(appBaseUrl, "/api/ai/shadow-rollout");

  const [readiness, shadow] = await Promise.all([
    fetchJson(readinessUrl, { headers }),
    fetchJson(shadowUrl, { headers }),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    appBaseUrl,
    readiness: readiness.body?.readiness || null,
    shadowSummary: shadow.body?.summary || null,
    baseline: shadow.body?.baseline || null,
    loadTest:
      shadow.body?.summary?.loadTest || shadow.body?.baseline?.loadTest || null,
    readinessHttp: { ok: readiness.ok, status: readiness.status },
    shadowHttp: { ok: shadow.ok, status: shadow.status },
  };

  if (!readiness.ok || !shadow.ok) {
    const readinessError =
      readiness.body?.error || readiness.rawText || "unknown readiness error";
    const shadowError =
      shadow.body?.error || shadow.rawText || "unknown shadow error";
    throw new Error(
      `Phase 5 report routes failed: readiness HTTP ${readiness.status} (${String(
        readinessError
      ).slice(0, 160)}); shadow HTTP ${shadow.status} (${String(
        shadowError
      ).slice(0, 160)})`
    );
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const serviceMetrics = new Map(
    Array.isArray(report.baseline?.serviceMetrics)
      ? report.baseline.serviceMetrics.map((entry) => [entry.service, entry])
      : []
  );
  const services = Array.isArray(report.shadowSummary?.services)
    ? report.shadowSummary.services
    : [];

  const markdown = [
    "# Phase 5 Shadow Baseline",
    "",
    `Generated: ${report.generatedAt}`,
    `App base URL: ${report.appBaseUrl}`,
    "",
    "## Readiness",
    "",
    `- HTTP: ${report.readinessHttp.status} (${report.readinessHttp.ok ? "ok" : "error"})`,
    `- Configured sidecars: ${report.readiness?.configuredCount ?? "n/a"}`,
    `- Healthy sidecars: ${report.readiness?.healthyCount ?? "n/a"}`,
    `- Stub sidecars: ${report.readiness?.stubCount ?? "n/a"}`,
    `- Unhealthy sidecars: ${report.readiness?.unhealthyCount ?? "n/a"}`,
    `- Unreachable sidecars: ${report.readiness?.unreachableCount ?? "n/a"}`,
    "",
    "## Baseline Window",
    "",
    `- HTTP: ${report.shadowHttp.status} (${report.shadowHttp.ok ? "ok" : "error"})`,
    `- Overall status: ${report.shadowSummary?.overallStatus ?? "n/a"}`,
    `- Rolling window: ${report.shadowSummary?.gateConfig?.windowHours ?? report.baseline?.windowHours ?? "n/a"} hours`,
    `- Sample interval: ${report.shadowSummary?.gateConfig?.sampleIntervalMinutes ?? "n/a"} minutes`,
    `- Required healthy samples: ${report.shadowSummary?.gateConfig?.requiredHealthySamples ?? "n/a"}`,
    `- Required healthy ratio: ${formatPct(report.shadowSummary?.gateConfig?.requiredHealthyRatio ?? null)}`,
    `- Parsed reports in window: ${report.baseline?.parsedReportCount ?? "n/a"}/${report.baseline?.reportCount ?? "n/a"}`,
    `- Malformed reports skipped: ${report.baseline?.malformedReportCount ?? "n/a"}`,
    `- Aggregated service observations: ${report.baseline?.observationCount ?? "n/a"}`,
    `- Aggregated shadow comparisons: ${report.baseline?.shadowComparisonCount ?? "n/a"}`,
    report.baseline?.warning ? `- Warning: ${report.baseline.warning}` : null,
    `- Persisted load test: ${
      report.loadTest
        ? report.loadTest.passed
          ? "passed"
          : "failed"
        : "missing"
    }`,
    report.loadTest
      ? `- Load test target: ${report.loadTest.targetRoute} @ ${report.loadTest.targetRps} RPS`
      : null,
    report.loadTest
      ? `- Load test p99 latency: ${formatMs(report.loadTest.p99LatencyMs ?? null)}`
      : null,
    report.loadTest
      ? `- Load test error rate: ${formatPct(report.loadTest.errorRate ?? null)}`
      : null,
    "",
    "## Services",
    "",
    ...services.flatMap((service, index) => [
      buildServiceMarkdown(service, serviceMetrics.get(service.service) || null),
      index === services.length - 1 ? "" : "",
    ]),
  ]
    .filter(Boolean)
    .join("\n");

  fs.writeFileSync(args.outputPath, markdown);
  console.log(`Wrote Phase 5 report to ${args.outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
