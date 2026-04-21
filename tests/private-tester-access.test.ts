import {
  buildPrivateTesterConfigSummary,
  buildPrivateTesterEnvMutationPlan,
  evaluatePrivateTesterAccess,
  shouldBypassPlanGateForPrivateTester,
  shouldBypassUsageLimitForPrivateTester,
} from "@/lib/private-tester-access";
import {
  sanitizePrivateTesterDashboardData,
  sanitizePrivateTesterDataSummary,
} from "@/lib/private-tester-admin-sanitization";
import type {
  PrivateTesterDashboardData,
  PrivateTesterDataSummary,
  PrivateTesterRecentCase,
} from "@/lib/private-tester-admin";

function buildUnsafeTesterSummary(): PrivateTesterDataSummary & {
  privateNotes: string;
  rawOwnerSymptomText: string;
  telemetry: { eventPayload: { symptomText: string } };
} {
  const recentCase: PrivateTesterRecentCase & {
    ownerSymptomText: string;
    reportContent: string;
  } = {
    createdAt: "2026-04-20T15:34:12.000Z",
    negativeFeedbackFlagged: true,
    ownerSymptomText: "Dog vomited blood after dinner.",
    petName: "Juniper",
    recommendation: "Seek immediate emergency care now.",
    reportContent: "Emergency report body that must stay private.",
    severity: "emergency",
    symptomCheckId: "symptom-check-123",
  };

  return {
    access: {
      allowed: true,
      blocked: false,
      email: "tester@example.com",
      freeAccess: true,
      guestSymptomChecker: false,
      inviteOnly: true,
      modeEnabled: true,
      reason: "allowlisted_email",
    },
    config: {
      allowedEmailCount: 2,
      allowedEmails: ["tester@example.com", "blocked@example.com"],
      blockedEmailCount: 1,
      blockedEmails: ["blocked@example.com"],
      freeAccess: true,
      guestSymptomChecker: false,
      inviteOnly: true,
      modeEnabled: true,
    },
    counts: {
      caseOutcomes: 2,
      journalEntries: 1,
      negativeFeedbackEntries: 1,
      notifications: 0,
      outcomeFeedbackEntries: 1,
      pets: 1,
      sharedReports: 1,
      subscriptions: 1,
      symptomChecks: 3,
      thresholdProposals: 1,
    },
    privateNotes: "Owner said the dog vomited blood after dinner.",
    rawOwnerSymptomText: "My dog vomited blood after dinner.",
    recentCases: [recentCase],
    telemetry: {
      eventPayload: {
        symptomText: "Dog vomited blood after dinner.",
      },
    },
    user: {
      email: "tester@example.com",
      fullName: "Tester",
      id: "user-1",
    },
  };
}

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

  it("VET-1352 tester access smoke: sanitizes tester admin summaries down to safe metadata only", () => {
    const sanitized = sanitizePrivateTesterDataSummary(buildUnsafeTesterSummary());
    const payload = JSON.stringify(sanitized);

    expect(sanitized.user).toEqual({
      email: "tester@example.com",
      fullName: "Tester",
      id: "user-1",
    });
    expect(sanitized.counts).toEqual({
      caseOutcomes: 2,
      journalEntries: 1,
      negativeFeedbackEntries: 1,
      notifications: 0,
      outcomeFeedbackEntries: 1,
      pets: 1,
      sharedReports: 1,
      subscriptions: 1,
      symptomChecks: 3,
      thresholdProposals: 1,
    });
    expect(sanitized.recentCases).toEqual([
      {
        createdAt: "2026-04-20",
        negativeFeedbackFlagged: true,
        petName: null,
        recommendation: null,
        severity: "emergency",
        symptomCheckId: "case-1",
      },
    ]);
    expect(payload).not.toContain("Juniper");
    expect(payload).not.toContain("vomited blood");
    expect(payload).not.toContain("Seek immediate emergency care now.");
    expect(payload).not.toContain("Emergency report body");
  });

  it("VET-1352 tester access smoke: preserves aggregate dashboard metrics while stripping sensitive tester case content", () => {
    const rawDashboard: PrivateTesterDashboardData = {
      config: {
        allowedEmailCount: 2,
        allowedEmails: ["tester@example.com", "blocked@example.com"],
        blockedEmailCount: 1,
        blockedEmails: ["blocked@example.com"],
        freeAccess: true,
        guestSymptomChecker: false,
        inviteOnly: true,
        modeEnabled: true,
      },
      summary: {
        active: 1,
        blocked: 1,
        negativeFeedbackEntries: 1,
        symptomChecks: 3,
        total: 2,
      },
      testers: [buildUnsafeTesterSummary()],
      warning: "Sanitized for tester admin usage.",
    };

    const sanitized = sanitizePrivateTesterDashboardData(rawDashboard);
    const payload = JSON.stringify(sanitized);

    expect(sanitized.summary).toEqual(rawDashboard.summary);
    expect(sanitized.config.allowedEmails).toEqual([
      "tester@example.com",
      "blocked@example.com",
    ]);
    expect(sanitized.testers[0]?.counts.symptomChecks).toBe(3);
    expect(sanitized.testers[0]?.recentCases[0]?.symptomCheckId).toBe("case-1");
    expect(payload).not.toContain("Juniper");
    expect(payload).not.toContain("vomited blood");
    expect(payload).not.toContain("Emergency report body");
  });
});
