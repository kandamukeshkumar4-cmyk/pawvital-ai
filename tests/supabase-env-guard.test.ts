import { checkSupabaseEnvConsistency } from "@/lib/supabase-env-guard";

describe("supabase env guard", () => {
  it("passes when both refs match", () => {
    const result = checkSupabaseEnvConsistency({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      DATABASE_URL:
        "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
    });

    expect(result.ok).toBe(true);
    expect(result.refs.publicProjectRef).toBe("abcdefghijklmnopqrst");
    expect(result.refs.databaseProjectRef).toBe("abcdefghijklmnopqrst");
  });

  it("fails closed when refs disagree", () => {
    const result = checkSupabaseEnvConsistency({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      DATABASE_URL:
        "postgresql://postgres:secret@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("project_ref_mismatch");
  });

  it("allows partial configuration during local development", () => {
    const result = checkSupabaseEnvConsistency({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    });

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("partial_configuration");
  });
});
