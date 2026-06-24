const { createHash } = require("node:crypto");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { basename, join, resolve } = require("node:path");

const EXPECTED_SUPABASE_PROJECT_REF = "aammaxdsjhezmbvdkqee";
const EXPECTED_VERCEL_PROJECT_ID = "prj_VhKiLsdF7643yOSfAv9SxEmKDXfC";
const EXPECTED_VERCEL_TEAM_ID = "team_Nwx0L2mSFhWa2CMylrlD017C";
const SUPABASE_HOST_REF_PATTERN = /^[a-z0-9]{20}$/i;

function isLikelyPlaceholder(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  return (
    normalized === "placeholder" ||
    normalized === "replace-me" ||
    normalized === "your_nvidia_nim_key_here" ||
    normalized.startsWith("your_") ||
    /replace[_-]?with/i.test(normalized)
  );
}

function readNonPlaceholder(env, name) {
  const value = String(env[name] || "").trim();
  return value && !isLikelyPlaceholder(value) ? value : "";
}

function extractSupabaseProjectRefFromUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  try {
    const hostname = new URL(trimmed).hostname;
    const [subdomain] = hostname.split(".");
    if (!subdomain || subdomain === "localhost") return null;
    return SUPABASE_HOST_REF_PATTERN.test(subdomain)
      ? subdomain.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function extractSupabaseProjectRefFromDatabaseUrl(databaseUrl) {
  const trimmed = String(databaseUrl || "").trim();
  if (!trimmed) return null;

  try {
    const hostname = new URL(trimmed).hostname;
    const match = hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function pass(id, message, details = {}) {
  return { id, status: "pass", message, details };
}

function warn(id, message, action, details = {}) {
  return { id, status: "warning", message, action, details };
}

function block(id, message, action, details = {}) {
  return { id, status: "blocker", message, action, details };
}

function checkSupabaseLaunchEnv(env, expectedRef = EXPECTED_SUPABASE_PROJECT_REF) {
  const checks = [];
  const publicRef = extractSupabaseProjectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const databaseRef = extractSupabaseProjectRefFromDatabaseUrl(env.DATABASE_URL);
  const anonKey = readNonPlaceholder(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = readNonPlaceholder(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!publicRef) {
    checks.push(
      block(
        "supabase.public-url",
        "NEXT_PUBLIC_SUPABASE_URL is missing or is not a Supabase project URL.",
        `Set NEXT_PUBLIC_SUPABASE_URL to https://${expectedRef}.supabase.co in Vercel production.`,
      ),
    );
  }

  if (!databaseRef) {
    checks.push(
      block(
        "supabase.database-url",
        "DATABASE_URL is missing or is not a Supabase pooled/direct database URL.",
        `Set DATABASE_URL to the Postgres URL for Supabase project ${expectedRef}.`,
      ),
    );
  }

  if (publicRef && databaseRef && publicRef !== databaseRef) {
    checks.push(
      block(
        "supabase.split-brain",
        "NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL point at different Supabase projects.",
        `Update Vercel production Supabase env vars so REST/Auth and DATABASE_URL both use project ${expectedRef}.`,
        { publicRef, databaseRef, expectedRef },
      ),
    );
  }

  for (const [id, ref, label] of [
    ["supabase.public-ref", publicRef, "NEXT_PUBLIC_SUPABASE_URL"],
    ["supabase.database-ref", databaseRef, "DATABASE_URL"],
  ]) {
    if (ref && ref !== expectedRef) {
      checks.push(
        block(
          id,
          `${label} points at Supabase project ${ref}, not the production project ${expectedRef}.`,
          `Change ${label} to project ${expectedRef} before launch.`,
          { actualRef: ref, expectedRef },
        ),
      );
    }
  }

  if (!anonKey) {
    checks.push(
      block(
        "supabase.anon-key",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or placeholder.",
        "Set the production Supabase anon key in Vercel.",
      ),
    );
  }

  if (!serviceRoleKey) {
    checks.push(
      block(
        "supabase.service-role-key",
        "SUPABASE_SERVICE_ROLE_KEY is missing or placeholder.",
        "Set the production Supabase service-role key in Vercel; do not commit it.",
      ),
    );
  }

  if (checks.length === 0) {
    checks.push(
      pass("supabase.launch-env", "Supabase launch env points at the expected production project.", {
        publicRef,
        databaseRef,
      }),
    );
  }

  return checks;
}

function checkNvidiaLaunchEnv(env) {
  const value = readNonPlaceholder(env, "NVIDIA_API_KEY");
  if (!value) {
    return [
      block(
        "nvidia.api-key",
        "NVIDIA_API_KEY is missing or placeholder.",
        "Set NVIDIA_API_KEY in Vercel production so model routes cannot silently degrade to demo/no-provider behavior.",
      ),
    ];
  }
  return [pass("nvidia.api-key", "NVIDIA_API_KEY is present and non-placeholder.")];
}

function checkVercelProject(repoRoot) {
  const projectPath = join(repoRoot, ".vercel", "project.json");
  if (!existsSync(projectPath)) {
    return [
      block(
        "vercel.project-link",
        ".vercel/project.json is missing.",
        `Run or restore the Vercel project link for ${EXPECTED_VERCEL_PROJECT_ID} / ${EXPECTED_VERCEL_TEAM_ID} before production deploy.`,
        { projectPath },
      ),
    ];
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(projectPath, "utf8"));
  } catch (error) {
    return [
      block(
        "vercel.project-link",
        ".vercel/project.json is not parseable JSON.",
        "Regenerate the Vercel project link before production deploy.",
        { projectPath, error: error instanceof Error ? error.message : String(error) },
      ),
    ];
  }

  const problems = [];
  if (parsed.projectId !== EXPECTED_VERCEL_PROJECT_ID) {
    problems.push(`projectId=${parsed.projectId || "(missing)"}`);
  }
  if (parsed.orgId !== EXPECTED_VERCEL_TEAM_ID) {
    problems.push(`orgId=${parsed.orgId || "(missing)"}`);
  }

  if (problems.length > 0) {
    return [
      block(
        "vercel.project-link",
        `.vercel/project.json points at the wrong Vercel target (${problems.join(", ")}).`,
        `Relink Vercel to project ${EXPECTED_VERCEL_PROJECT_ID} and team ${EXPECTED_VERCEL_TEAM_ID}.`,
        { projectPath, expectedProjectId: EXPECTED_VERCEL_PROJECT_ID, expectedTeamId: EXPECTED_VERCEL_TEAM_ID },
      ),
    ];
  }

  return [pass("vercel.project-link", ".vercel/project.json points at the expected production project.")];
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function collectMigrationFiles(repoRoot) {
  const migrationDir = join(repoRoot, "supabase", "migrations");
  const files = [];
  if (existsSync(migrationDir)) {
    for (const name of readdirSync(migrationDir).filter((entry) => entry.endsWith(".sql")).sort()) {
      files.push(resolve(migrationDir, name));
    }
  }

  const productIntelligenceSchema = join(repoRoot, "supabase-product-intelligence-schema.sql");
  if (existsSync(productIntelligenceSchema)) {
    files.push(resolve(productIntelligenceSchema));
  }
  return files;
}

function buildMigrationPlan(repoRoot, appliedRows = []) {
  const applied = new Map(
    appliedRows.map((row) => [row.filename, row.checksum]),
  );

  return collectMigrationFiles(repoRoot).map((filePath) => {
    const filename = basename(filePath);
    const checksum = sha256(readFileSync(filePath, "utf8"));
    const appliedChecksum = applied.get(filename);
    let status = "pending";
    if (appliedChecksum === checksum) {
      status = "applied";
    } else if (appliedChecksum && appliedChecksum !== checksum) {
      status = "checksum_mismatch";
    }

    return { filename, path: filePath, checksum, status };
  });
}

function buildLaunchPreflight(env = process.env, options = {}) {
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const expectedRef = options.expectedSupabaseProjectRef || EXPECTED_SUPABASE_PROJECT_REF;
  const checks = [
    ...checkSupabaseLaunchEnv(env, expectedRef),
    ...checkNvidiaLaunchEnv(env),
    ...checkVercelProject(repoRoot),
  ];
  const migrations = buildMigrationPlan(repoRoot);
  if (migrations.length === 0) {
    checks.push(
      warn(
        "migrations.plan",
        "No launch migration SQL files were found.",
        "Confirm the repo contains supabase/migrations/*.sql and supabase-product-intelligence-schema.sql before launch.",
      ),
    );
  } else {
    checks.push(
      pass("migrations.plan", `Found ${migrations.length} launch migration file(s).`, {
        pendingByDefault: migrations.map((item) => item.filename),
      }),
    );
  }

  const blockers = checks.filter((check) => check.status === "blocker");
  const warnings = checks.filter((check) => check.status === "warning");
  return {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    repoRoot,
    checks,
    blockers,
    warnings,
    humanActions: blockers.map((check) => check.action).filter(Boolean),
    migrations,
  };
}

function formatPreflight(result) {
  const lines = [
    `launch-preflight: ${result.ok ? "OK" : "BLOCKED"}`,
    `repo: ${result.repoRoot}`,
    "",
  ];

  for (const check of result.checks) {
    const prefix = check.status === "pass" ? "[PASS]" : check.status === "warning" ? "[WARN]" : "[BLOCK]";
    lines.push(`${prefix} ${check.id}: ${check.message}`);
    if (check.action && check.status !== "pass") {
      lines.push(`  action: ${check.action}`);
    }
  }

  if (result.humanActions.length > 0) {
    lines.push("", "Human-only actions required:");
    for (const action of result.humanActions) {
      lines.push(`- ${action}`);
    }
  }

  return lines.join("\n");
}

module.exports = {
  EXPECTED_SUPABASE_PROJECT_REF,
  EXPECTED_VERCEL_PROJECT_ID,
  EXPECTED_VERCEL_TEAM_ID,
  buildLaunchPreflight,
  buildMigrationPlan,
  checkNvidiaLaunchEnv,
  checkSupabaseLaunchEnv,
  checkVercelProject,
  collectMigrationFiles,
  extractSupabaseProjectRefFromDatabaseUrl,
  extractSupabaseProjectRefFromUrl,
  formatPreflight,
  isLikelyPlaceholder,
  sha256,
};
