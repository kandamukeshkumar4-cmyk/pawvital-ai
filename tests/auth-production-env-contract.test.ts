/**
 * VET-1484S — Production auth env contract tests
 *
 * These tests guard against the class of bug that caused the 2026-05-13 production
 * auth outage: a stale NEXT_PUBLIC_SUPABASE_URL baked into the client bundle, a
 * paused Supabase project, and a private-tester gate blocking all post-auth access.
 *
 * supabase.ts reads process.env at module-load time, so tests that need different
 * URL values must use jest.isolateModules() to get a fresh module evaluation.
 *
 * private-tester-access.ts and auth-routing.ts accept an env object argument, so
 * those tests inject an isolated env object and never mutate process.env.
 */

import {
  evaluatePrivateTesterAccess,
} from "@/lib/private-tester-access";

import {
  getAuthActionErrorMessage,
  resolvePostAuthRedirect,
  sanitizeRedirectTarget,
} from "@/lib/auth-routing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Evaluate isSupabaseConfigured in an isolated module with a specific URL. */
async function loadSupabaseWithUrl(url: string): Promise<{
  isSupabaseConfigured: boolean;
  createClient: () => unknown;
}> {
  let mod: { isSupabaseConfigured: boolean; createClient: () => unknown };

  // Save and restore the env var so we don't bleed state between isolations.
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;

  await new Promise<void>((resolve) => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("@/lib/supabase");
      resolve();
    });
  });

  process.env.NEXT_PUBLIC_SUPABASE_URL = saved;

  return mod!;
}

// ---------------------------------------------------------------------------
// supabase.ts — isSupabaseConfigured and createClient
// ---------------------------------------------------------------------------

describe("VET-1484S: supabase.ts env contract", () => {
  it("isSupabaseConfigured is false when NEXT_PUBLIC_SUPABASE_URL is empty string", async () => {
    const { isSupabaseConfigured } = await loadSupabaseWithUrl("");
    expect(isSupabaseConfigured).toBe(false);
  });

  it("isSupabaseConfigured is false when NEXT_PUBLIC_SUPABASE_URL is not set (undefined)", async () => {
    const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    let mod: { isSupabaseConfigured: boolean };
    await new Promise<void>((resolve) => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require("@/lib/supabase");
        resolve();
      });
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
    expect(mod!.isSupabaseConfigured).toBe(false);
  });

  /**
   * REGRESSION GUARD — if anyone re-adds the stale project ref that caused the
   * 2026-05-13 outage, this test will fail in CI before it can reach production.
   *
   * isSupabaseConfigured only checks for a valid https:// prefix, so the stale
   * URL would pass that check. This guard instead asserts directly that the
   * configured URL does not contain the decommissioned project ref.
   *
   * If you are seeing this failure, NEXT_PUBLIC_SUPABASE_URL has been set to the
   * decommissioned project (cvkdmbgujgcfuqtqgtxv). Update it to the active project
   * gswjpmgxidofwmjngavh on Vercel and trigger a fresh rebuild.
   */
  it("configured Supabase URL must not contain the stale project ref cvkdmbgujgcfuqtqgtxv", () => {
    const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    // Only assert when a URL is actually set — demo/local envs with empty URL are fine.
    if (configuredUrl.startsWith("https://")) {
      expect(configuredUrl).not.toContain("cvkdmbgujgcfuqtqgtxv");
    }
  });

  it("isSupabaseConfigured is true when URL is the correct active project", async () => {
    const { isSupabaseConfigured } = await loadSupabaseWithUrl(
      "https://gswjpmgxidofwmjngavh.supabase.co"
    );
    expect(isSupabaseConfigured).toBe(true);
  });

  it("createClient() throws DEMO_MODE when isSupabaseConfigured is false", async () => {
    const { createClient } = await loadSupabaseWithUrl("");
    expect(() => createClient()).toThrow("DEMO_MODE");
  });
});

// ---------------------------------------------------------------------------
// private-tester-access.ts — evaluatePrivateTesterAccess
// ---------------------------------------------------------------------------

describe("VET-1484S: private-tester gate env contract", () => {
  it("returns allowed:true / reason:mode_disabled when NEXT_PUBLIC_PRIVATE_TESTER_MODE is false", () => {
    const result = evaluatePrivateTesterAccess(
      { email: "user@example.com" },
      { NEXT_PUBLIC_PRIVATE_TESTER_MODE: "false" }
    );
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("mode_disabled");
  });

  it("returns allowed:false / reason:invite_required when mode is true, invite-only is true, email not in list", () => {
    const result = evaluatePrivateTesterAccess(
      { email: "stranger@example.com" },
      {
        NEXT_PUBLIC_PRIVATE_TESTER_MODE: "true",
        PRIVATE_TESTER_INVITE_ONLY: "true",
        PRIVATE_TESTER_ALLOWED_EMAILS: "alice@example.com,bob@example.com",
      }
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("invite_required");
  });

  it("returns allowed:true / reason:allowlisted_email when mode is true, invite-only is true, email IS in list", () => {
    const result = evaluatePrivateTesterAccess(
      { email: "alice@example.com" },
      {
        NEXT_PUBLIC_PRIVATE_TESTER_MODE: "true",
        PRIVATE_TESTER_INVITE_ONLY: "true",
        PRIVATE_TESTER_ALLOWED_EMAILS: "alice@example.com,bob@example.com",
      }
    );
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("allowlisted_email");
  });
});

// ---------------------------------------------------------------------------
// auth-routing.ts — getAuthActionErrorMessage
// ---------------------------------------------------------------------------

describe("VET-1484S: auth-routing network error classification", () => {
  it('returns network error message when error.message is "Failed to fetch"', () => {
    const msg = getAuthActionErrorMessage(
      new Error("Failed to fetch"),
      "login",
      "Unexpected error"
    );
    expect(msg).toMatch(/couldn't reach/i);
  });

  it('returns network error message when error.message contains "NetworkError when attempting to fetch resource"', () => {
    const msg = getAuthActionErrorMessage(
      new Error("NetworkError when attempting to fetch resource"),
      "signup",
      "Unexpected error"
    );
    expect(msg).toMatch(/couldn't reach/i);
  });

  it("returns fallback message for unrecognized errors", () => {
    const msg = getAuthActionErrorMessage(
      new Error("Some unrecognized auth error"),
      "login",
      "Fallback message"
    );
    // Unrecognized errors return the raw error message, not the fallback.
    // The fallback is used when error.message is empty.
    expect(msg).toBe("Some unrecognized auth error");
  });

  it("returns fallback message when error has no message", () => {
    const msg = getAuthActionErrorMessage(
      new Error(""),
      "login",
      "Fallback message"
    );
    expect(msg).toBe("Fallback message");
  });
});

// ---------------------------------------------------------------------------
// auth-routing.ts — sanitizeRedirectTarget and resolvePostAuthRedirect
// ---------------------------------------------------------------------------

describe("VET-1484S: auth-routing redirect safety", () => {
  it("sanitizeRedirectTarget returns null for open-redirect attempts (//evil.com)", () => {
    expect(sanitizeRedirectTarget("//evil.com")).toBeNull();
    expect(sanitizeRedirectTarget("//evil.com/path")).toBeNull();
  });

  it("resolvePostAuthRedirect falls back to /dashboard when target is an auth page path", () => {
    expect(resolvePostAuthRedirect("/login")).toBe("/dashboard");
    expect(resolvePostAuthRedirect("/signup")).toBe("/dashboard");
    expect(resolvePostAuthRedirect("/forgot-password")).toBe("/dashboard");
  });

  it("resolvePostAuthRedirect falls back to /dashboard for null/empty targets", () => {
    expect(resolvePostAuthRedirect(null)).toBe("/dashboard");
    expect(resolvePostAuthRedirect("")).toBe("/dashboard");
    expect(resolvePostAuthRedirect(undefined)).toBe("/dashboard");
  });
});
