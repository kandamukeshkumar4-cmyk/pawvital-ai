import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const rootDir = process.cwd();

for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
  const fullPath = path.join(rootDir, relativePath);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

const command = (process.argv[2] || "all").toLowerCase();
const strictMode = process.argv.includes("--strict");

const services = [
  {
    name: "vision-preprocess-service",
    env: "HF_VISION_PREPROCESS_URL",
    expectedPath: "/infer",
    expectedHealthService: "vision-preprocess-service",
  },
  {
    name: "text-retrieval-service",
    env: "HF_TEXT_RETRIEVAL_URL",
    expectedPath: "/search",
    expectedHealthService: "text-retrieval-service",
  },
  {
    name: "image-retrieval-service",
    env: "HF_IMAGE_RETRIEVAL_URL",
    expectedPath: "/search",
    expectedHealthService: "image-retrieval-service",
  },
  {
    name: "multimodal-consult-service",
    env: "HF_MULTIMODAL_CONSULT_URL",
    expectedPath: "/consult",
    expectedHealthService: "multimodal-consult-service",
  },
  {
    name: "async-review-service",
    env: "HF_ASYNC_REVIEW_URL",
    expectedPath: "/review",
    expectedHealthService: "async-review-service",
  },
];

function statusLine(level, message) {
  const prefix =
    level === "ok" ? "[OK]" : level === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${prefix} ${message}`);
}

function readEnv(name) {
  return (process.env[name] || "").trim();
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
    if (readEnv("SUPABASE_URL")) {
      statusLine("ok", "SUPABASE_URL is configured for retrieval sidecars");
    } else {
      warnings += 1;
      statusLine("warn", "SUPABASE_URL is missing for retrieval sidecars");
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

async function main() {
  let failures = 0;
  let warnings = 0;

  if (!["env", "health", "all"].includes(command)) {
    console.error(`Unknown command "${command}". Use env, health, or all.`);
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

  console.log("");
  console.log(
    `Sidecar verification summary: ${failures} failure(s), ${warnings} warning(s)`
  );

  if (failures > 0 || (strictMode && warnings > 0)) {
    process.exit(1);
  }
}

await main();
