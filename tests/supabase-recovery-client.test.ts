describe("Supabase recovery client", () => {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
      return;
    }

    process.env[name] = value;
  }

  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", savedUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", savedKey);
    jest.dontMock("@supabase/ssr");
    jest.dontMock("@supabase/supabase-js");
  });

  it("keeps the normal browser client on the SSR helper", () => {
    const createBrowserClient = jest.fn().mockReturnValue({ kind: "browser" });
    const createSupabaseClient = jest.fn().mockReturnValue({ kind: "recovery" });

    jest.doMock("@supabase/ssr", () => ({ createBrowserClient }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: createSupabaseClient,
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@/lib/supabase");

    expect(createClient()).toEqual({ kind: "browser" });
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key"
    );
    expect(createSupabaseClient).not.toHaveBeenCalled();
  });

  it("uses the base Supabase client for implicit recovery links", () => {
    const createBrowserClient = jest.fn().mockReturnValue({ kind: "browser" });
    const createSupabaseClient = jest.fn().mockReturnValue({ kind: "recovery" });

    jest.doMock("@supabase/ssr", () => ({ createBrowserClient }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: createSupabaseClient,
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRecoveryClient } = require("@/lib/supabase");

    expect(createRecoveryClient()).toEqual({ kind: "recovery" });
    expect(createBrowserClient).not.toHaveBeenCalled();
    expect(createSupabaseClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "implicit",
          persistSession: true,
        },
      }
    );
  });
});
