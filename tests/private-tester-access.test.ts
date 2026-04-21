import {
  buildPrivateTesterConfigSummary,
  buildPrivateTesterEnvMutationPlan,
  evaluatePrivateTesterAccess,
  shouldBypassPlanGateForPrivateTester,
  shouldBypassUsageLimitForPrivateTester,
} from "@/lib/private-tester-access";

describe("private tester access helpers", () => {
  it("treats the feature as off by default", () => {
    const env = {};

    expect(buildPrivateTesterConfigSummary(env)).toEqual({
      allowedEmailCount: 0,
      allowedEmails: [],
      blockedEmailCount: 0,
      blockedEmails: [],
      freeAccess: false,
      guestSymptomChecker: false,
      inviteOnly: false,
      modeEnabled: false,
    });
    expect(evaluatePrivateTesterAccess({ email: null }, env).allowed).toBe(true);
  });

  it("allows only allowlisted invited testers when invite-only mode is enabled", () => {
    const env = {
      NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_MODE: "1",
      PRIVATE_TESTER_ALLOWED_EMAILS: "alpha@example.com,beta@example.com",
    };

    expect(
      evaluatePrivateTesterAccess({ email: "alpha@example.com" }, env)
    ).toMatchObject({
      allowed: true,
      reason: "allowlisted_email",
    });
    expect(
      evaluatePrivateTesterAccess({ email: "gamma@example.com" }, env)
    ).toMatchObject({
      allowed: false,
      reason: "invite_required",
    });
  });

  it("supports an immediate blocked-email override", () => {
    const env = {
      NEXT_PUBLIC_PRIVATE_TESTER_MODE: "1",
      PRIVATE_TESTER_ALLOWED_EMAILS: "alpha@example.com",
      PRIVATE_TESTER_BLOCKED_EMAILS: "alpha@example.com",
    };

    expect(
      evaluatePrivateTesterAccess({ email: "alpha@example.com" }, env)
    ).toMatchObject({
      allowed: false,
      blocked: true,
      reason: "blocked_email",
    });
  });

  it("can permit guest symptom-checker access without opening other routes", () => {
    const env = {
      NEXT_PUBLIC_PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_MODE: "1",
    };

    expect(
      evaluatePrivateTesterAccess(
        { email: null, pathname: "/symptom-checker" },
        env
      )
    ).toMatchObject({
      allowed: true,
      reason: "guest_symptom_checker",
    });
    expect(
      evaluatePrivateTesterAccess({ email: null, pathname: "/dashboard" }, env)
    ).toMatchObject({
      allowed: false,
      reason: "missing_email",
    });
  });

  it("VET-1352 tester access smoke: bypasses paywall and usage limits for invited private testers with free access", () => {
    const env = {
      NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_MODE: "1",
      PRIVATE_TESTER_ALLOWED_EMAILS: "alpha@example.com",
    };

    expect(
      shouldBypassPlanGateForPrivateTester("alpha@example.com", env)
    ).toBe(true);
    expect(
      shouldBypassUsageLimitForPrivateTester("alpha@example.com", env)
    ).toBe(true);
    expect(
      shouldBypassUsageLimitForPrivateTester("beta@example.com", env)
    ).toBe(false);
  });

  it("VET-1352 tester access smoke: builds env mutation plans for disable, restore, and removal", () => {
    const env = {
      PRIVATE_TESTER_ALLOWED_EMAILS: "alpha@example.com,beta@example.com",
      PRIVATE_TESTER_BLOCKED_EMAILS: "gamma@example.com",
    };

    expect(
      buildPrivateTesterEnvMutationPlan("beta@example.com", "block", env)
    ).toEqual({
      action: "block",
      allowedEmails: ["alpha@example.com", "beta@example.com"],
      blockedEmails: ["beta@example.com", "gamma@example.com"],
    });
    expect(
      buildPrivateTesterEnvMutationPlan("gamma@example.com", "allow", env)
    ).toEqual({
      action: "allow",
      allowedEmails: [
        "alpha@example.com",
        "beta@example.com",
        "gamma@example.com",
      ],
      blockedEmails: [],
    });
    expect(
      buildPrivateTesterEnvMutationPlan("alpha@example.com", "remove", env)
    ).toEqual({
      action: "remove",
      allowedEmails: ["beta@example.com"],
      blockedEmails: ["gamma@example.com"],
    });
  });
});
