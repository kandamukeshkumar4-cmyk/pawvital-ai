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

function includesAll(text, snippets) {
  return snippets.every((snippet) => text.includes(snippet));
}

function checkDemoModeGates(repoRoot) {
  const adminAuthPath = join(repoRoot, "src", "lib", "admin-auth.ts");
  const apiAuthPath = join(repoRoot, "src", "lib", "api-auth.ts");
  const adminAuthTestPath = join(repoRoot, "tests", "admin-auth.test.ts");
  const aiEndpointAuthTestPath = join(repoRoot, "tests", "ai-endpoint-auth.test.ts");
  const checks = [];

  const adminAuthText = existsSync(adminAuthPath) ? readFileSync(adminAuthPath, "utf8") : "";
  const apiAuthText = existsSync(apiAuthPath) ? readFileSync(apiAuthPath, "utf8") : "";
  const adminAuthTestText = existsSync(adminAuthTestPath) ? readFileSync(adminAuthTestPath, "utf8") : "";
  const aiEndpointAuthTestText = existsSync(aiEndpointAuthTestPath)
    ? readFileSync(aiEndpointAuthTestPath, "utf8")
    : "";

  if (
    !includesAll(adminAuthText, [
      "process.env.NODE_ENV === \"production\"",
      "process.env.VERCEL_ENV === \"production\"",
      "error.message === \"DEMO_MODE\"",
      "return null;",
      "demo-admin@pawvital.local",
    ])
  ) {
    checks.push(
      block(
        "demo.admin-auth",
        "Admin demo fallback is not proven to fail closed in production.",
        "Restore the production admin-auth DEMO_MODE guard before launch.",
        { path: adminAuthPath },
      ),
    );
  }

  if (
    !includesAll(apiAuthText, [
      "error.message === \"DEMO_MODE\"",
      "code: \"DEMO_MODE\"",
      "{ status: 503 }",
      "Authentication required",
    ])
  ) {
    checks.push(
      block(
        "demo.api-auth",
        "Backend API demo-mode auth envelope is missing or no longer fails closed.",
        "Restore the shared API auth DEMO_MODE 503 and unauthenticated 401 contract before launch.",
        { path: apiAuthPath },
      ),
    );
  }

  if (
    !includesAll(adminAuthTestText, [
      "fails closed on demo-mode auth fallback in production",
      "retains the demo admin fallback outside production",
    ])
  ) {
    checks.push(
      block(
        "demo.admin-auth-tests",
        "Admin demo-mode production fallback regression coverage is missing.",
        "Restore tests proving production blocks DEMO_MODE admin fallback and non-production keeps local demo admin.",
        { path: adminAuthTestPath },
      ),
    );
  }

  if (
    !includesAll(aiEndpointAuthTestText, [
      "blocks unauthenticated costly access",
      "expect(mockGenerateNvidiaJson).not.toHaveBeenCalled()",
    ])
  ) {
    checks.push(
      block(
        "demo.ai-costly-route-tests",
        "Costly AI route auth regression coverage is missing.",
        "Restore tests proving unauthenticated AI routes do not call NVIDIA generation.",
        { path: aiEndpointAuthTestPath },
      ),
    );
  }

  if (checks.length > 0) return checks;

  return [
    pass(
      "demo-mode.gates",
      "Production demo-mode gates and costly-route auth regression coverage are present.",
      {
        files: [adminAuthPath, apiAuthPath, adminAuthTestPath, aiEndpointAuthTestPath],
      },
    ),
  ];
}

function checkLaunchCriticalApiRegressionTests(repoRoot) {
  const symptomChatTestPath = join(repoRoot, "tests", "symptom-chat.route.test.ts");
  const dogBrainSignalsTestPath = join(repoRoot, "tests", "dog-brain-signals-route.test.ts");
  const symptomChatTestText = existsSync(symptomChatTestPath)
    ? readFileSync(symptomChatTestPath, "utf8")
    : "";
  const dogBrainSignalsTestText = existsSync(dogBrainSignalsTestPath)
    ? readFileSync(dogBrainSignalsTestPath, "utf8")
    : "";
  const checks = [];

  if (
    !includesAll(symptomChatTestText, [
      "returns 401 for unauthenticated symptom-chat calls before model work",
      "expect(mockExtractWithQwen).not.toHaveBeenCalled()",
      "expect(mockDiagnoseWithDeepSeek).not.toHaveBeenCalled()",
      "expect(mockVerifyWithGLM).not.toHaveBeenCalled()",
    ])
  ) {
    checks.push(
      block(
        "api-regression.symptom-chat-auth",
        "Launch-critical symptom-chat unauthenticated 401/no-model-work regression coverage is missing.",
        "Restore the symptom-chat launch smoke regression before launch.",
        { path: symptomChatTestPath },
      ),
    );
  }

  if (
    !includesAll(dogBrainSignalsTestText, [
      "rejects invalid pet ids before auth or database work",
      "returns 401 for unauthenticated valid pet requests before database work",
      "expect(mockRequireAuthenticatedApiUser).not.toHaveBeenCalled()",
      "expect(mockRequireAuthenticatedApiUser).toHaveBeenCalledTimes(1)",
    ])
  ) {
    checks.push(
      block(
        "api-regression.dog-brain-signals",
        "Launch-critical dog-brain signals 400/401 regression coverage is missing.",
        "Restore dog-brain signals launch smoke regression coverage before launch.",
        { path: dogBrainSignalsTestPath },
      ),
    );
  }

  if (checks.length > 0) return checks;

  return [
    pass(
      "api-regression.launch-critical",
      "Launch-critical API regression tests are present for symptom-chat and dog-brain signals.",
      { files: [symptomChatTestPath, dogBrainSignalsTestPath] },
    ),
  ];
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
    ...checkDemoModeGates(repoRoot),
    ...checkLaunchCriticalApiRegressionTests(repoRoot),
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
  checkDemoModeGates,
  checkLaunchCriticalApiRegressionTests,
  checkSupabaseLaunchEnv,
  checkVercelProject,
  collectMigrationFiles,
  extractSupabaseProjectRefFromDatabaseUrl,
  extractSupabaseProjectRefFromUrl,
  formatPreflight,
  isLikelyPlaceholder,
  sha256,
};
