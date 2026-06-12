import {
  SUPABASE_ENV_SPLIT_BRAIN_ERROR,
  assertSupabaseEnvAligned,
  evaluateSupabaseEnvAlignment,
  extractSupabaseProjectRef,
} from "@/lib/supabase-env-guard";

describe("Supabase env alignment guard", () => {
  it("accepts matching REST/Auth URLs and direct DATABASE_URL hosts", () => {
    const result = evaluateSupabaseEnvAlignment({
      NEXT_PUBLIC_SUPABASE_URL: "https://gswjpmgxidofwmjngavh.supabase.co",
      SUPABASE_URL: "https://gswjpmgxidofwmjngavh.supabase.co",
      DATABASE_URL:
        "postgresql://postgres:secret@db.gswjpmgxidofwmjngavh.supabase.co:5432/postgres",
    });

    expect(result.ok).toBe(true);
    expect(result.refs).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "gswjpmgxidofwmjngavh",
      SUPABASE_URL: "gswjpmgxidofwmjngavh",
      DATABASE_URL: "gswjpmgxidofwmjngavh",
    });
  });

  it("accepts matching Supabase pooler DATABASE_URL usernames", () => {
    expect(
      extractSupabaseProjectRef(
        "postgresql://postgres.gswjpmgxidofwmjngavh:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
      )
    ).toBe("gswjpmgxidofwmjngavh");
  });

  it("allows DATABASE_URL to be absent for local and CI builds", () => {
    const result = evaluateSupabaseEnvAlignment({
      NEXT_PUBLIC_SUPABASE_URL: "https://gswjpmgxidofwmjngavh.supabase.co",
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("fails closed when DATABASE_URL points at a different Supabase project", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://gswjpmgxidofwmjngavh.supabase.co",
      DATABASE_URL:
        "postgresql://postgres:secret@db.cvkdmbgujgcfuqtqgtxv.supabase.co:5432/postgres",
    };

    expect(() => assertSupabaseEnvAligned(env)).toThrow(
      SUPABASE_ENV_SPLIT_BRAIN_ERROR
    );
  });

  it("reports invalid DATABASE_URL without leaking the secret value", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://gswjpmgxidofwmjngavh.supabase.co",
      DATABASE_URL: "postgresql://postgres:super-secret",
    };

    try {
      assertSupabaseEnvAligned(env);
      throw new Error("expected guard to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain(SUPABASE_ENV_SPLIT_BRAIN_ERROR);
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("super-secret");
      expect(message).not.toContain("postgresql://");
    }
  });
});
