import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

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

function readVercelProjectConfigBase() {
  const envProjectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
  const envTeamId = String(
    process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || ""
  ).trim();
  if (envProjectId) {
    return {
      projectId: envProjectId,
      teamId: envTeamId,
      projectName: inferWorkspaceProjectName(),
    };
  }

  if (!fs.existsSync(vercelProjectConfigPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(vercelProjectConfigPath, "utf8"));
    return {
      projectId: String(parsed.projectId || "").trim(),
      teamId: String(parsed.orgId || "").trim(),
      projectName: String(parsed.projectName || "").trim(),
    };
  } catch {
    return null;
  }
}

function inferDefaultAppBaseUrl() {
  const config = readVercelProjectConfigBase();
  if (config?.projectName) {
    return `https://${config.projectName}.vercel.app`;
  }
  return `https://${inferWorkspaceProjectName()}.vercel.app`;
}

const command = (process.argv[2] || "all").toLowerCase();
const strictMode = process.argv.includes("--strict");
const APP_BASE_URL =
  (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    inferDefaultAppBaseUrl()
  ).trim();
const services = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "src", "lib", "sidecar-service-registry.json"),
    "utf8"
  )
);
const REQUIRED_VERCEL_ENV_NAMES = services.map((service) => service.env);
const DEBUG_ROUTE_SECRET_ENV_NAMES = [
  "HF_SIDECAR_API_KEY",
  "ASYNC_REVIEW_WEBHOOK_SECRET",
];
function statusLine(level, message) {
  const prefix =
    level === "ok" ? "[OK]" : level === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${prefix} ${message}`);
}

function readEnv(name) {
  return (process.env[name] || "").trim();
}

function readSupabaseUrl() {
  return readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
}

function normalizeMode(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}

function validateUrl(name, rawUrl, expectedPath) {
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      return { ok: false, error: `${name} must use http or https` };
    }
    if (parsed.pathname !== expectedPath) {
      return {
        ok: false,
        error: `${name} should point to ${expectedPath} but is ${parsed.pathname || "/"}`,
      };
    }
    return { ok: true, url: parsed };
  } catch (error) {
    return {
      ok: false,
      error: `${name} is not a valid URL: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildHealthUrl(url) {
  const healthUrl = new URL(url.toString());
  healthUrl.pathname = "/healthz";
  healthUrl.search = "";
  healthUrl.hash = "";
  return healthUrl.toString();
}

function buildAppRouteUrl(baseUrl, routePath) {
  const routeUrl = new URL(baseUrl);
  routeUrl.pathname = routePath;
  routeUrl.search = "";
  routeUrl.hash = "";
  return routeUrl.toString();
}

async function fetchHealth(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status, ok: response.ok, body: parsed, rawText: text };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postJson(url, payload, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(readEnv("HF_SIDECAR_API_KEY")
          ? { Authorization: `Bearer ${readEnv("HF_SIDECAR_API_KEY")}` }
          : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status, ok: response.ok, body: parsed, rawText: text };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...(readEnv("HF_SIDECAR_API_KEY")
          ? { Authorization: `Bearer ${readEnv("HF_SIDECAR_API_KEY")}` }
          : {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status, ok: response.ok, body: parsed, rawText: text };
  } finally {
    clearTimeout(timeoutId);
  }
}

function runVercelEnvList(environment = "production") {
  const args =
    process.platform === "win32"
      ? ["cmd", "/c", "npx", "vercel", "env", "ls", environment]
      : ["npx", "vercel", "env", "ls", environment];

  const command = args[0];
  const commandArgs = args.slice(1);
  return spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 15000,
  });
}

function parseVercelEnvNames(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.startsWith("> ") &&
        !line.startsWith("Retrieving project") &&
        !line.startsWith("Common next commands") &&
        !line.startsWith("- `vercel") &&
        !/^name\s+value\s+environments\s+created$/i.test(line)
    )
    .map((line) => {
      const match = line.match(/^([A-Z0-9_]+)/);
      return match?.[1] || "";
    })
    .filter(Boolean);
}

function readVercelProjectConfig() {
  const config = readVercelProjectConfigBase();
  if (!config?.projectId) return null;
  return { projectId: config.projectId, teamId: config.teamId };
}

async function fetchVercelEnvNamesViaApi(environment = "production") {
  const token = readEnv("VERCEL_TOKEN");
  const config = readVercelProjectConfig();
  if (!token || !config) {
    return null;
  }

  const params = new URLSearchParams();
  if (config.teamId) {
    params.set("teamId", config.teamId);
  }

  const url =
    `https://api.vercel.com/v10/projects/${config.projectId}/env` +
    (params.toString() ? `?${params}` : "");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: controller.signal,
    cache: "no-store",
  });
  clearTimeout(timeoutId);
  const rawText = await response.text();
  let body = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  if (!response.ok || !body || !Array.isArray(body.envs)) {
    throw new Error(
      `Failed to query Vercel envs via API (${response.status}): ${String(rawText || "").slice(0, 240)}`
    );
  }

  const names = new Set(
    body.envs
      .filter((env) => Array.isArray(env?.target) && env.target.includes(environment))
      .map((env) => String(env.key || "").trim())
      .filter(Boolean)
  );

  return names;
}

function runEnvChecks() {
  let failures = 0;
  let warnings = 0;

  const configuredServices = [];

  for (const service of services) {
    const rawUrl = readEnv(service.env);
    if (!rawUrl) {
      warnings += 1;
      statusLine("warn", `${service.env} is not configured`);
      continue;
    }

    const validation = validateUrl(service.env, rawUrl, service.expectedPath);
    if (!validation.ok) {
      failures += 1;
      statusLine("fail", validation.error);
      continue;
    }

    configuredServices.push(service.name);
    statusLine("ok", `${service.env} -> ${rawUrl}`);
  }

  if (configuredServices.length > 0) {
    if (readEnv("HF_SIDECAR_API_KEY")) {
      statusLine("ok", "HF_SIDECAR_API_KEY is configured for app-to-sidecar auth");
    } else {
      warnings += 1;
      statusLine("warn", "HF_SIDECAR_API_KEY is not configured");
    }
  }

  const stubMode = normalizeMode(readEnv("SIDECAR_STUB_MODE"));
  if (stubMode) {
    statusLine(
      stubMode === "true" ? "warn" : "ok",
      `SIDECAR_STUB_MODE=${stubMode || "false"}`
    );
    if (stubMode === "true") {
      warnings += 1;
    }
  }

  if (readEnv("HF_TEXT_RETRIEVAL_URL") || readEnv("HF_IMAGE_RETRIEVAL_URL")) {
    if (readSupabaseUrl()) {
      statusLine("ok", "SUPABASE_URL is configured for retrieval sidecars");
    } else {
      warnings += 1;
      statusLine(
        "warn",
        "SUPABASE_URL is missing for retrieval sidecars (NEXT_PUBLIC_SUPABASE_URL also not found)"
      );
    }

    if (readEnv("SUPABASE_SERVICE_ROLE_KEY")) {
      statusLine("ok", "SUPABASE_SERVICE_ROLE_KEY is configured for retrieval sidecars");
    } else {
      warnings += 1;
      statusLine("warn", "SUPABASE_SERVICE_ROLE_KEY is missing for retrieval sidecars");
    }
  }

  return { failures, warnings };
}

async function runHealthChecks() {
  let failures = 0;
  let warnings = 0;

  for (const service of services) {
    const rawUrl = readEnv(service.env);
    if (!rawUrl) {
      warnings += 1;
      statusLine("warn", `Skipping ${service.name} health check because ${service.env} is unset`);
      continue;
    }

    const validation = validateUrl(service.env, rawUrl, service.expectedPath);
    if (!validation.ok) {
      failures += 1;
      statusLine("fail", validation.error);
      continue;
    }

    const healthUrl = buildHealthUrl(validation.url);
    try {
      const result = await fetchHealth(healthUrl);
      if (!result.ok || !result.body || result.body.ok !== true) {
        failures += 1;
        statusLine(
          "fail",
          `${service.name} health check failed at ${healthUrl} (${result.status})`
        );
        continue;
      }

      if (result.body.service !== service.expectedHealthService) {
        failures += 1;
        statusLine(
          "fail",
          `${service.name} health check returned mismatched service name: ${String(result.body.service || "unknown")}`
        );
        continue;
      }

      const mode = String(result.body.mode || "unknown");
      const level = mode === "stub" ? "warn" : "ok";
      if (mode === "stub") {
        warnings += 1;
      }

      statusLine(
        level,
        `${service.name} healthy at ${healthUrl} (mode=${mode}, model=${String(result.body.model || "n/a")})`
      );
    } catch (error) {
      failures += 1;
      statusLine(
        "fail",
        `${service.name} health request failed at ${healthUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { failures, warnings };
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

async function runShadowChecks() {
  let failures = 0;
  let warnings = 0;

  if (!APP_BASE_URL) {
    warnings += 1;
    statusLine(
      "warn",
      "Skipping shadow rollout route check because APP_BASE_URL/NEXT_PUBLIC_APP_URL is unset"
    );
    return { failures, warnings };
  }

  let routeUrl;
  try {
    routeUrl = buildAppRouteUrl(APP_BASE_URL, "/api/ai/shadow-rollout");
  } catch (error) {
    failures += 1;
    statusLine(
      "fail",
      `APP_BASE_URL is not a valid URL: ${error instanceof Error ? error.message : String(error)}`
    );
    return { failures, warnings };
  }

  try {
    const result = await postJson(routeUrl, buildShadowProbePayload());
    if (!result.ok || !result.body || result.body.ok !== true) {
      failures += 1;
      const authHint =
        result.status === 401
          ? " Check deployed HF_SIDECAR_API_KEY / ASYNC_REVIEW_WEBHOOK_SECRET alignment."
          : "";
      statusLine(
        "fail",
        `shadow rollout route failed at ${routeUrl} (${result.status}).${authHint}`
      );
      return { failures, warnings };
    }

    statusLine(
      "ok",
      `shadow rollout route healthy at ${routeUrl} (overallStatus=${String(
        result.body.summary?.overallStatus || "unknown"
      )}, recentServiceCallCount=${Number(
        result.body.observability?.recentServiceCallCount ?? 0
      )})`
    );
  } catch (error) {
    failures += 1;
    statusLine(
      "fail",
      `shadow rollout route request failed at ${routeUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return { failures, warnings };
}

async function runReadinessChecks() {
  let failures = 0;
  let warnings = 0;

  if (!APP_BASE_URL) {
    warnings += 1;
    statusLine(
      "warn",
      "Skipping sidecar readiness route check because APP_BASE_URL/NEXT_PUBLIC_APP_URL is unset"
    );
    return { failures, warnings };
  }

  let routeUrl;
  try {
    routeUrl = buildAppRouteUrl(APP_BASE_URL, "/api/ai/sidecar-readiness");
  } catch (error) {
    failures += 1;
    statusLine(
      "fail",
      `APP_BASE_URL is not a valid URL: ${error instanceof Error ? error.message : String(error)}`
    );
    return { failures, warnings };
  }

  try {
    const result = await fetchJson(routeUrl);
    if (!result.ok || !result.body || result.body.ok !== true) {
      failures += 1;
      const authHint =
        result.status === 401
          ? " Check deployed HF_SIDECAR_API_KEY / ASYNC_REVIEW_WEBHOOK_SECRET alignment."
          : "";
      statusLine(
        "fail",
        `sidecar readiness route failed at ${routeUrl} (${result.status}).${authHint}`
      );
      return { failures, warnings };
    }

    statusLine(
      "ok",
      `sidecar readiness route healthy at ${routeUrl} (configured=${Number(
        result.body.readiness?.configuredCount ?? 0
      )}, healthy=${Number(result.body.readiness?.healthyCount ?? 0)}, stub=${Number(
        result.body.readiness?.stubCount ?? 0
      )})`
    );
  } catch (error) {
    failures += 1;
    statusLine(
      "fail",
      `sidecar readiness route request failed at ${routeUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return { failures, warnings };
}

async function runVercelChecks() {
  let failures = 0;
  let warnings = 0;

  let names = null;
  try {
    names = await fetchVercelEnvNamesViaApi("production");
    if (names) {
      statusLine("ok", "Loaded Vercel production env names via API");
    }
  } catch (error) {
    warnings += 1;
    statusLine(
      "warn",
      `Falling back to Vercel CLI env listing: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!names) {
    const result = runVercelEnvList("production");
    if (result.error) {
      failures += 1;
      statusLine(
        "fail",
        `Failed to run "vercel env ls production": ${result.error.message}`
      );
      return { failures, warnings };
    }

    if (result.status !== 0) {
      failures += 1;
      statusLine(
        "fail",
        `vercel env ls production failed (${result.status}): ${String(
          result.stderr || result.stdout || ""
        ).trim()}`
      );
      return { failures, warnings };
    }

    names = new Set(parseVercelEnvNames(result.stdout || ""));
  }

  if (names.size === 0) {
    failures += 1;
    statusLine("fail", "Could not parse any Vercel production environment variables");
    return { failures, warnings };
  }

  for (const envName of REQUIRED_VERCEL_ENV_NAMES) {
    if (names.has(envName)) {
      statusLine("ok", `Vercel production env includes ${envName}`);
    } else {
      warnings += 1;
      statusLine("warn", `Vercel production env is missing ${envName}`);
    }
  }

  if (DEBUG_ROUTE_SECRET_ENV_NAMES.some((envName) => names.has(envName))) {
    statusLine(
      "ok",
      "Vercel production has at least one debug-route auth secret configured"
    );
  } else {
    warnings += 1;
    statusLine(
      "warn",
      "Vercel production is missing both HF_SIDECAR_API_KEY and ASYNC_REVIEW_WEBHOOK_SECRET"
    );
  }

  return { failures, warnings };
}

async function main() {
  let failures = 0;
  let warnings = 0;

  if (!["env", "health", "shadow", "readiness", "vercel", "all"].includes(command)) {
    console.error(
      `Unknown command "${command}". Use env, health, shadow, readiness, vercel, or all.`
    );
    process.exit(1);
  }

  if (command === "env" || command === "all") {
    console.log("== Sidecar env readiness ==");
    const result = runEnvChecks();
    failures += result.failures;
    warnings += result.warnings;
  }

  if (command === "health" || command === "all") {
    if (command === "all") {
      console.log("");
    }
    console.log("== Sidecar health checks ==");
    const result = await runHealthChecks();
    failures += result.failures;
    warnings += result.warnings;
  }

  if (command === "shadow") {
    console.log("== Shadow rollout route check ==");
    const result = await runShadowChecks();
    failures += result.failures;
    warnings += result.warnings;
  }

  if (command === "readiness") {
    console.log("== Sidecar readiness route check ==");
    const result = await runReadinessChecks();
    failures += result.failures;
    warnings += result.warnings;
  }

  if (command === "vercel") {
    console.log("== Vercel production env check ==");
    const result = await runVercelChecks();
    failures += result.failures;
    warnings += result.warnings;
  }

  console.log("");
  console.log(
    `Sidecar verification summary: ${failures} failure(s), ${warnings} warning(s)`
  );

  if (failures > 0 || (strictMode && warnings > 0)) {
    process.exit(1);
  }
}

await main();
