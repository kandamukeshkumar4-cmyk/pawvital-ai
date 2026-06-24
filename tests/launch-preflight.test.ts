import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const core = require("../scripts/launch-preflight-core.cjs");
const migrations = require("../scripts/launch-migrations-core.cjs");

function makeRepoFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "pawvital-preflight-"));
  mkdirSync(path.join(root, ".vercel"), { recursive: true });
  mkdirSync(path.join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(
    path.join(root, ".vercel", "project.json"),
    JSON.stringify({
      projectId: core.EXPECTED_VERCEL_PROJECT_ID,
      orgId: core.EXPECTED_VERCEL_TEAM_ID,
    }),
  );
  writeFileSync(
    path.join(root, "supabase", "migrations", "20260601000000_alpha.sql"),
    "CREATE TABLE IF NOT EXISTS public.alpha(id uuid);\n",
  );
  writeFileSync(
    path.join(root, "supabase-product-intelligence-schema.sql"),
    "CREATE TABLE IF NOT EXISTS public.daily_readiness_snapshots(id uuid);\n",
  );
  return root;
}

function completeEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${core.EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`,
    DATABASE_URL: `postgresql://postgres:secret@db.${core.EXPECTED_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NVIDIA_API_KEY: "nvapi-real-key",
  };
}

describe("launch preflight", () => {
  it("passes complete production-shaped env and project linkage", () => {
    const result = core.buildLaunchPreflight(completeEnv(), {
      repoRoot: makeRepoFixture(),
    });

    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.checks.map((check: { id: string }) => check.id)).toEqual(
      expect.arrayContaining([
        "supabase.launch-env",
        "nvidia.api-key",
        "vercel.project-link",
        "migrations.plan",
      ]),
    );
  });

  it("blocks Supabase split-brain instead of treating partial prod config as OK", () => {
    const env = {
      ...completeEnv(),
      DATABASE_URL:
        "postgresql://postgres:secret@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres",
    };
    const result = core.buildLaunchPreflight(env, { repoRoot: makeRepoFixture() });

    expect(result.ok).toBe(false);
    expect(result.blockers.map((check: { id: string }) => check.id)).toContain(
      "supabase.split-brain",
    );
    expect(result.humanActions.join("\n")).toContain(core.EXPECTED_SUPABASE_PROJECT_REF);
  });

  it("blocks missing NVIDIA_API_KEY", () => {
    const env = completeEnv();
    delete (env as { NVIDIA_API_KEY?: string }).NVIDIA_API_KEY;
    const result = core.buildLaunchPreflight(env, { repoRoot: makeRepoFixture() });

    expect(result.ok).toBe(false);
    expect(result.blockers.map((check: { id: string }) => check.id)).toContain(
      "nvidia.api-key",
    );
  });

  it("blocks incomplete Supabase launch env", () => {
    const result = core.buildLaunchPreflight(
      {
        NEXT_PUBLIC_SUPABASE_URL: `https://${core.EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`,
        NVIDIA_API_KEY: "nvapi-real-key",
      },
      { repoRoot: makeRepoFixture() },
    );

    expect(result.ok).toBe(false);
    expect(result.blockers.map((check: { id: string }) => check.id)).toEqual(
      expect.arrayContaining([
        "supabase.database-url",
        "supabase.anon-key",
        "supabase.service-role-key",
      ]),
    );
  });
});

describe("launch migration plan", () => {
  it("orders supabase migrations before the product-intelligence schema", () => {
    const root = makeRepoFixture();
    const plan = core.buildMigrationPlan(root);

    expect(plan.map((item: { filename: string }) => item.filename)).toEqual([
      "20260601000000_alpha.sql",
      "supabase-product-intelligence-schema.sql",
    ]);
    expect(plan.every((item: { status: string }) => item.status === "pending")).toBe(true);
  });

  it("detects already-applied and checksum-mismatch migrations", () => {
    const root = makeRepoFixture();
    const initial = core.buildMigrationPlan(root);
    const plan = core.buildMigrationPlan(root, [
      { filename: initial[0].filename, checksum: initial[0].checksum },
      { filename: initial[1].filename, checksum: "different" },
    ]);

    expect(plan[0].status).toBe("applied");
    expect(plan[1].status).toBe("checksum_mismatch");
  });
});

describe("launch migration runner safety", () => {
  it("rejects a DATABASE_URL for the wrong Supabase project before connecting", () => {
    const error = migrations.validateDatabaseUrlTarget(
      "postgresql://postgres:secret@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres",
    );

    expect(error).toContain("zyxwvutsrqponmlkjihg");
    expect(error).toContain(core.EXPECTED_SUPABASE_PROJECT_REF);
  });

  it("keeps dry-run ledger reads side-effect free when the ledger is absent", async () => {
    const query = jest.fn().mockRejectedValueOnce(
      Object.assign(new Error("relation pawvital_schema_migrations does not exist"), {
        code: "42P01",
      }),
    );

    const rows = await migrations.readApplied({ query }, { ensureLedgerTable: false });

    expect(rows).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("SELECT filename, checksum");
    expect(query.mock.calls[0][0]).not.toContain("CREATE TABLE");
  });
});
