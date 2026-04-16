import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const vercelProjectConfigPath = path.join(rootDir, ".vercel", "project.json");

for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
  const fullPath = path.join(rootDir, relativePath);
  if (fs.existsSync(fullPath)) {
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

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const applyMode = args.has("--apply");
const diffMode = args.has("--diff") || !applyMode;
const environment = rawArgs
  .find((arg) => arg.startsWith("--environment="))
  ?.split("=")[1]
  ?.trim() || "all";

const targetEnvironments =
  environment === "all" ? ["preview", "production"] : [environment];

const services = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "src", "lib", "sidecar-service-registry.json"),
    "utf8"
  )
).filter((service) => service.env !== "HF_VISION_PREPROCESS_URL");

function statusLine(level, message) {
  const prefix =
    level === "ok" ? "[OK]" : level === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${prefix} ${message}`);
}

function readEnv(name) {
  return (process.env[name] || "").trim();
}

function inferWorkspaceProjectName() {
  return path.basename(rootDir).replace(/-(codex|claude|minimax)$/i, "");
}

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

function readVercelProjectConfig() {
  const config = readVercelProjectConfigBase();
  if (!config?.projectId) return null;
  return { projectId: config.projectId, teamId: config.teamId };
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
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx vercel ${args.join(" ")}`], {
      cwd: rootDir,
      encoding: "utf8",
      timeout: 20000,
      ...options,
    });
  }

  return spawnSync(getNpxCommand(), ["vercel", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 20000,
    ...options,
  });
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

function getCurrentGitBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status !== 0) {
    return "";
  }
  return String(result.stdout || "").trim();
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

function loadExistingVercelEnvNamesViaCli(targetEnvironment) {
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

async function loadExistingVercelEnvNamesViaApi(targetEnvironment) {
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

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
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

  return new Set(
    body.envs
      .filter(
        (env) =>
          Array.isArray(env?.target) && env.target.includes(targetEnvironment)
      )
      .map((env) => String(env.key || "").trim())
      .filter(Boolean)
  );
}

async function loadExistingVercelEnvNames(
  targetEnvironment,
  { required = false } = {}
) {
  try {
    const viaApi = await loadExistingVercelEnvNamesViaApi(targetEnvironment);
    if (viaApi) {
      statusLine("ok", `Loaded existing ${targetEnvironment} env names via Vercel API`);
      return viaApi;
    }
  } catch (error) {
    statusLine(
      "warn",
      `Falling back to Vercel CLI for ${targetEnvironment} env names: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!required) {
    return null;
  }

  return loadExistingVercelEnvNamesViaCli(targetEnvironment);
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
  const addArgs = ["env", "add", name, targetEnvironment];
  const currentBranch = getCurrentGitBranch();
  if (targetEnvironment === "preview" && currentBranch) {
    addArgs.push(currentBranch);
  }

  const result = runVercel(addArgs, {
    input: value,
  });
  if (result.status !== 0) {
    const parsed = parseCommandJson(result);
    if (
      targetEnvironment === "preview" &&
      parsed?.reason === "git_branch_required" &&
      currentBranch
    ) {
      const retried = runVercel(
        ["env", "add", name, targetEnvironment, currentBranch],
        {
          input: value,
        }
      );
      if (retried.status === 0) {
        return;
      }
      throw new Error(
        retried.stderr?.trim() ||
          retried.stdout?.trim() ||
          `Failed to add ${name} to ${targetEnvironment}:${currentBranch}`
      );
    }
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

  statusLine(
    "ok",
    "HF_VISION_PREPROCESS_URL is intentionally excluded from VET-1107 sync so the live vision URL stays untouched"
  );

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

async function previewDiff(updates, { requireRemote = false } = {}) {
  for (const targetEnvironment of targetEnvironments) {
    let existingNames = null;
    try {
      existingNames = await loadExistingVercelEnvNames(targetEnvironment, {
        required: requireRemote,
      });
    } catch (error) {
      statusLine(
        "warn",
        `Unable to load existing ${targetEnvironment} env names; showing planned updates only: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    for (const update of updates) {
      const remoteState = existingNames
        ? existingNames.has(update.env)
          ? "replace"
          : "add"
        : "planned";
      const level = remoteState === "replace" ? "warn" : "ok";
      statusLine(
        level,
        `[diff:${targetEnvironment}] ${update.env} (${update.service}) ${remoteState} -> ${update.value}`
      );
    }
  }
}

async function applyUpdates(updates) {
  for (const targetEnvironment of targetEnvironments) {
    const existingNames = await loadExistingVercelEnvNames(targetEnvironment, {
      required: true,
    });
    for (const update of updates) {
      if (existingNames.has(update.env)) {
        statusLine(
          "warn",
          `Replacing existing ${update.env} in Vercel ${targetEnvironment}`
        );
        removeVercelEnv(update.env, targetEnvironment);
      }

      addVercelEnv(update.env, targetEnvironment, update.value);
      statusLine(
        "ok",
        `Synced ${update.env} for ${update.service} (${targetEnvironment})`
      );
    }
  }
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
    `${applyMode ? "Applying" : "Previewing"} ${updates.length} heavy sidecar URL env updates for Vercel ${targetEnvironments.join(", ")}`
  );

  if (!diffMode) {
    statusLine(
      "fail",
      "Apply mode requires --diff in the same invocation so the planned changes are printed before any write"
    );
    process.exitCode = 1;
    return;
  }

  await previewDiff(updates, { requireRemote: applyMode });

  if (!applyMode) {
    statusLine(
      "warn",
      "Diff preview only. Re-run with --diff --apply to update Vercel environment variables."
    );
    return;
  }

  await applyUpdates(updates);
}

main().catch((error) => {
  statusLine(
    "fail",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
