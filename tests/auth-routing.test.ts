import {
  appendRedirectParam,
  buildCallbackUrl,
  buildRecoveryRedirectPath,
  buildRedirectTarget,
  buildLoginPath,
  getAuthActionErrorMessage,
  isProtectedPath,
  resolvePostAuthRedirect,
  sanitizeRedirectTarget,
} from "@/lib/auth-routing";

describe("VET-1215 auth routing helpers", () => {
  it("accepts safe internal redirect targets", () => {
    expect(sanitizeRedirectTarget("/pets?id=123")).toBe("/pets?id=123");
    expect(sanitizeRedirectTarget("/notifications#panel")).toBe("/notifications#panel");
  });

  it("rejects external and malformed redirect targets", () => {
    expect(sanitizeRedirectTarget("https://evil.example/phish")).toBeNull();
    expect(sanitizeRedirectTarget("//evil.example/phish")).toBeNull();
    expect(sanitizeRedirectTarget("javascript:alert(1)")).toBeNull();
  });

  it("allows same-origin absolute redirects only when origin matches", () => {
    expect(
      sanitizeRedirectTarget(
        "https://pawvital.ai/history?filter=recent",
        "https://pawvital.ai"
      )
    ).toBe("/history?filter=recent");
    expect(
      sanitizeRedirectTarget(
        "https://evil.example/history?filter=recent",
        "https://pawvital.ai"
      )
    ).toBeNull();
  });

  it("falls back when auth pages are passed as post-auth redirects", () => {
    expect(resolvePostAuthRedirect("/login")).toBe("/dashboard");
    expect(resolvePostAuthRedirect("/forgot-password")).toBe("/dashboard");
    expect(resolvePostAuthRedirect("/reset-password")).toBe("/dashboard");
  });

  it("allows reset-password only when explicitly requested", () => {
    expect(
      resolvePostAuthRedirect("/reset-password?redirect=%2Fpets", {
        allowResetPassword: true,
      })
    ).toBe("/reset-password?redirect=%2Fpets");
  });

  it("builds login and callback URLs with safe redirect targets", () => {
    expect(
      buildLoginPath("/notifications?tab=unread", { reason: "session_expired" })
    ).toBe("/login?redirect=%2Fnotifications%3Ftab%3Dunread&reason=session_expired");
    expect(buildCallbackUrl("https://pawvital.ai", "/pets/1")).toBe(
      "https://pawvital.ai/api/auth/callback?next=%2Fpets%2F1"
    );
  });

  it("keeps redirect propagation relative for linked auth pages", () => {
    expect(appendRedirectParam("/signup", "/pets/1")).toBe("/signup?redirect=%2Fpets%2F1");
    expect(buildRecoveryRedirectPath("/pets/1")).toBe(
      "/reset-password?redirect=%2Fpets%2F1"
    );
  });

  it("recognizes newly protected top-level routes", () => {
    expect(isProtectedPath("/notifications")).toBe(true);
    expect(isProtectedPath("/history")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/pricing")).toBe(false);
  });

  it("captures the full attempted destination for login redirects", () => {
    expect(buildRedirectTarget("/notifications", "?tab=unread")).toBe(
      "/notifications?tab=unread"
    );
  });

  it("sanitizes raw network failures for auth actions", () => {
    expect(
      getAuthActionErrorMessage(
        new TypeError("Failed to fetch"),
        "login",
        "Fallback"
      )
    ).toBe("We couldn't reach secure sign-in right now. Please try again in a moment.");
    expect(
      getAuthActionErrorMessage(
        new TypeError("Network request failed"),
        "signup",
        "Fallback"
      )
    ).toBe("We couldn't reach account setup right now. Please try again in a moment.");
  });

  it("preserves explicit auth provider errors", () => {
    expect(
      getAuthActionErrorMessage(
        new Error("Invalid login credentials"),
        "login",
        "Fallback"
      )
    ).toBe("Invalid login credentials");
  });
});
