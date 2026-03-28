import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const rootDir = process.cwd();

for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
  const fullPath = path.join(rootDir, relativePath);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

const args = new Set(process.argv.slice(2));
const applyMode = args.has("--apply");
const environment = [...args]
  .find((arg) => arg.startsWith("--environment="))
  ?.split("=")[1]
  ?.trim() || "production";

const services = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "src", "lib", "sidecar-service-registry.json"),
    "utf8"
  )
);

function statusLine(level, message) {
  const prefix =
    level === "ok" ? "[OK]" : level === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${prefix} ${message}`);
}

function readEnv(name) {
  return (process.env[name] || "").trim();
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

function getNpxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function runVercel(args, options = {}) {
  return spawnSync(getNpxCommand(), ["vercel", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 20000,
    ...options,
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

function loadExistingVercelEnvNames(targetEnvironment) {
  const result = runVercel(["env", "ls", targetEnvironment]);
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        `vercel env ls ${targetEnvironment} failed`
    );
  }
  return new Set(parseVercelEnvNames(result.stdout || ""));
}

function removeVercelEnv(name, targetEnvironment) {
  const result = runVercel(["env", "rm", name, targetEnvironment, "--yes"]);
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        `Failed to remove ${name} from ${targetEnvironment}`
    );
  }
}

function addVercelEnv(name, targetEnvironment, value) {
  const result = runVercel(["env", "add", name, targetEnvironment], {
    input: `${value}\n`,
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        `Failed to add ${name} to ${targetEnvironment}`
    );
  }
}

function collectPlannedUpdates() {
  const updates = [];
  let failures = 0;

  for (const service of services) {
    const value = readEnv(service.env);
    if (!value) {
      statusLine("warn", `${service.env} is unset locally; skipping`);
      continue;
    }

    const validation = validateUrl(service.env, value, service.expectedPath);
    if (!validation.ok) {
      failures += 1;
      statusLine("fail", validation.error);
      continue;
    }

    updates.push({
      env: service.env,
      value,
      expectedPath: service.expectedPath,
      service: service.name,
    });
    statusLine("ok", `Prepared ${service.env} for ${service.name}`);
  }

  return { updates, failures };
}

async function main() {
  const { updates, failures } = collectPlannedUpdates();
  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  if (updates.length === 0) {
    statusLine("warn", "No valid sidecar URL env vars found locally to sync");
    return;
  }

  statusLine(
    "ok",
    `${applyMode ? "Applying" : "Previewing"} ${updates.length} sidecar URL env updates for Vercel ${environment}`
  );

  if (!applyMode) {
    for (const update of updates) {
      statusLine(
        "ok",
        `[dry-run] ${update.env} -> ${update.value}`
      );
    }
    statusLine(
      "warn",
      "Dry run only. Re-run with --apply to update Vercel environment variables."
    );
    return;
  }

  const existingNames = loadExistingVercelEnvNames(environment);

  for (const update of updates) {
    if (existingNames.has(update.env)) {
      statusLine("warn", `Replacing existing ${update.env} in Vercel ${environment}`);
      removeVercelEnv(update.env, environment);
    }

    addVercelEnv(update.env, environment, update.value);
    statusLine("ok", `Synced ${update.env} for ${update.service}`);
  }
}

main().catch((error) => {
  statusLine(
    "fail",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
