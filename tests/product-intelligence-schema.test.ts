import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("product intelligence persistence schema", () => {
  const schemaPath = resolve(process.cwd(), "supabase-product-intelligence-schema.sql");

  it("defines owner-scoped readiness and recovery tables with RLS enabled", () => {
    const sql = readFileSync(schemaPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.daily_readiness_snapshots");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.recovery_checkpoints");
    expect(sql).toContain("ALTER TABLE public.daily_readiness_snapshots ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.recovery_checkpoints ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("auth.uid() = user_id");
    expect(sql).toContain("FROM public.pets");
    expect(sql).toContain("pets.id = daily_readiness_snapshots.pet_id");
    expect(sql).toContain("pets.id = recovery_checkpoints.pet_id");
    expect(sql).toContain("pets.user_id = auth.uid()");
    expect(sql).toContain("UNIQUE (user_id, pet_id, snapshot_date, generated_by)");
    expect(sql).toContain(
      "UNIQUE (user_id, pet_id, report_source_id, checkpoint_date, generated_by)"
    );
  });

  it("uses authenticated grants and named owner-only policies", () => {
    const sql = readFileSync(schemaPath, "utf8");

    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_readiness_snapshots TO authenticated");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.recovery_checkpoints TO authenticated");
    expect(sql).toContain("daily_readiness_snapshots_select_own");
    expect(sql).toContain("daily_readiness_snapshots_insert_own");
    expect(sql).toContain("recovery_checkpoints_select_own");
    expect(sql).toContain("recovery_checkpoints_insert_own");
  });

  it("does not persist forbidden clinical claim labels", () => {
    const sql = readFileSync(schemaPath, "utf8").toLowerCase();

    expect(sql).not.toContain("diagnosis certainty");
    expect(sql).not.toContain("treatment recommendation");
    expect(sql).not.toContain("prognosis promise");
    expect(sql).not.toContain("emergency clearance");
  });

  // --- VET-1564 apply-readiness invariants (locked before production migration) ---

  it("cascades both tables on owner and pet deletion (no orphaned tester data)", () => {
    const sql = readFileSync(schemaPath, "utf8");

    const cascades = sql.match(/REFERENCES (auth\.users|public\.pets)\(id\) ON DELETE CASCADE/g) ?? [];
    // user_id + pet_id on each of the two tables = 4 cascading foreign keys.
    expect(cascades.length).toBe(4);
  });

  it("removes tester rows by cascade only (no direct DELETE grant to authenticated)", () => {
    const sql = readFileSync(schemaPath, "utf8");

    expect(sql).not.toMatch(/GRANT[^;]*\bDELETE\b[^;]*TO authenticated/);
  });

  it("defines UPDATE policies, not just SELECT/INSERT", () => {
    const sql = readFileSync(schemaPath, "utf8");

    expect(sql).toContain("daily_readiness_snapshots_update_own");
    expect(sql).toContain("recovery_checkpoints_update_own");
  });

  it("re-applies cleanly (idempotent triggers, function, and policies)", () => {
    const sql = readFileSync(schemaPath, "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.set_product_intelligence_updated_at");
    expect(sql).toContain("DROP TRIGGER IF EXISTS set_daily_readiness_snapshots_updated_at");
    expect(sql).toContain("DROP TRIGGER IF EXISTS set_recovery_checkpoints_updated_at");
    // Every policy is dropped before recreate so a second apply does not error.
    const dropPolicies = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
    const createPolicies = sql.match(/CREATE POLICY/g) ?? [];
    expect(createPolicies.length).toBeGreaterThanOrEqual(6);
    expect(dropPolicies.length).toBe(createPolicies.length);
  });

  it("pins the readiness_state vocabulary to the product-intelligence state machine", () => {
    const sql = readFileSync(schemaPath, "utf8");

    for (const state of ["stable", "watch", "urgent", "unknown"]) {
      expect(sql).toMatch(new RegExp(`readiness_state[\\s\\S]*?CHECK[\\s\\S]*?'${state}'`));
    }
  });

  it("pins the recovery_status vocabulary to the recovery-checkpoint contract", () => {
    const sql = readFileSync(schemaPath, "utf8");

    for (const status of ["ready", "insufficient_evidence", "urgent_override"]) {
      expect(sql).toMatch(new RegExp(`recovery_status[\\s\\S]*?CHECK[\\s\\S]*?'${status}'`));
    }
  });
});
