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
});
