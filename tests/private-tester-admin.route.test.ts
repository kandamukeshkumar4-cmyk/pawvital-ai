const mockGetAdminRequestContext = jest.fn();
const mockInspectPrivateTesterData = jest.fn();
const mockDeletePrivateTesterData = jest.fn();
const mockBuildPrivateTesterDashboardFallback = jest.fn();
const mockListPrivateTesterSummaries = jest.fn();
const mockUpdatePrivateTesterAdminState = jest.fn();

jest.mock("@/lib/admin-auth", () => ({
  getAdminRequestContext: (...args: unknown[]) =>
    mockGetAdminRequestContext(...args),
}));

jest.mock("@/lib/private-tester-admin", () => ({
  buildPrivateTesterDashboardFallback: (...args: unknown[]) =>
    mockBuildPrivateTesterDashboardFallback(...args),
  inspectPrivateTesterData: (...args: unknown[]) =>
    mockInspectPrivateTesterData(...args),
  deletePrivateTesterData: (...args: unknown[]) =>
    mockDeletePrivateTesterData(...args),
  listPrivateTesterSummaries: (...args: unknown[]) =>
    mockListPrivateTesterSummaries(...args),
  updatePrivateTesterAdminState: (...args: unknown[]) =>
    mockUpdatePrivateTesterAdminState(...args),
}));

function buildUnsafeTesterSummary() {
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
    adminState: {
      accessDisabled: true,
      accessDisabledAt: "2026-04-21T14:00:00.000Z",
      auditLog: [
        {
          action: "disable_access",
          actorEmail: "admin@pawvital.ai",
          at: "2026-04-21T14:00:00.000Z",
          note: "Pause access after emergency confusion.",
        },
      ],
      deletionRequested: true,
      deletionRequestedAt: "2026-04-21T15:00:00.000Z",
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
      symptomChecks: 4,
      thresholdProposals: 1,
    },
    privateNotes: "Owner said the dog vomited blood after dinner.",
    rawOwnerSymptomText: "My dog vomited blood after dinner.",
    recentCases: [
      {
        createdAt: "2026-04-20T15:34:12.000Z",
        negativeFeedbackFlagged: true,
        ownerSymptomText: "Dog vomited blood after dinner.",
        petName: "Juniper",
        recommendation: "Seek immediate emergency care now.",
        reportContent: "Emergency report body that must stay private.",
        severity: "emergency",
        symptomCheckId: "symptom-check-123",
      },
    ],
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

function buildUnsafeDashboardPayload() {
  return {
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
        authAccessDisabled: 1,
        blocked: 1,
        deletionRequested: 1,
        negativeFeedbackEntries: 1,
        symptomChecks: 4,
        total: 2,
    },
    telemetry: {
      ownerSymptomText: "Dog vomited blood after dinner.",
    },
    testers: [buildUnsafeTesterSummary()],
  };
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/private-tester", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("admin private tester route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGetAdminRequestContext.mockResolvedValue({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
    mockBuildPrivateTesterDashboardFallback.mockReturnValue({
      config: {
        allowedEmailCount: 0,
        allowedEmails: [],
        blockedEmailCount: 0,
        blockedEmails: [],
        freeAccess: false,
        guestSymptomChecker: false,
        inviteOnly: false,
        modeEnabled: false,
      },
      summary: {
        active: 0,
        authAccessDisabled: 0,
        blocked: 0,
        deletionRequested: 0,
        negativeFeedbackEntries: 0,
        symptomChecks: 0,
        total: 0,
      },
      testers: [],
    });
  });

  it("VET-1352 tester access smoke: returns the current tester dashboard for admins", async () => {
    mockListPrivateTesterSummaries.mockResolvedValue(buildUnsafeDashboardPayload());

    const { GET } = await import("@/app/api/admin/private-tester/route");
    const response = await GET();
    const payload = await response.json();
    const serializedPayload = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.config.allowedEmailCount).toBe(2);
    expect(payload.summary.blocked).toBe(1);
    expect(payload.testers[0].user.email).toBe("tester@example.com");
    expect(payload.testers[0].recentCases).toEqual([
      {
        createdAt: "2026-04-20",
        negativeFeedbackFlagged: true,
        petName: null,
        recommendation: null,
        severity: "emergency",
        symptomCheckId: "case-1",
      },
    ]);
    expect(payload.telemetry).toBeUndefined();
    expect(payload.testers[0].rawOwnerSymptomText).toBeUndefined();
    expect(payload.testers[0].telemetry).toBeUndefined();
    expect(serializedPayload).not.toContain("Juniper");
    expect(serializedPayload).not.toContain("vomited blood");
    expect(serializedPayload).not.toContain("Emergency report body");
  });

  it("VET-1352 tester access smoke: returns a warning payload when service-role Supabase is unavailable", async () => {
    mockListPrivateTesterSummaries.mockRejectedValue(
      new Error("SUPABASE_SERVICE_ROLE_REQUIRED")
    );
    mockBuildPrivateTesterDashboardFallback.mockReturnValue({
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
        authAccessDisabled: 0,
        blocked: 1,
        deletionRequested: 0,
        negativeFeedbackEntries: 0,
        symptomChecks: 0,
        total: 2,
      },
      testers: [],
      warning:
        "Service-role Supabase access is not configured, so tester data inspection and deletion are unavailable.",
    });

    const { GET } = await import("@/app/api/admin/private-tester/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.total).toBe(2);
    expect(payload.warning).toContain("Service-role Supabase access");
  });

  it("rejects unauthorized requests before any tester admin metadata is returned", async () => {
    mockGetAdminRequestContext.mockResolvedValue(null);

    const { GET, POST } = await import("@/app/api/admin/private-tester/route");
    const getResponse = await GET();
    const postResponse = await POST(
      makePostRequest({ action: "inspect", email: "tester@example.com" })
    );
    const getPayload = await getResponse.json();
    const postPayload = await postResponse.json();

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
    expect(getPayload).toEqual({ error: "Unauthorized" });
    expect(postPayload).toEqual({ error: "Unauthorized" });
    expect(mockListPrivateTesterSummaries).not.toHaveBeenCalled();
    expect(mockInspectPrivateTesterData).not.toHaveBeenCalled();
    expect(mockDeletePrivateTesterData).not.toHaveBeenCalled();
  });

  it("inspects tester data by email", async () => {
    mockInspectPrivateTesterData.mockResolvedValue(buildUnsafeTesterSummary());

    const { POST } = await import("@/app/api/admin/private-tester/route");
    const response = await POST(
      makePostRequest({ action: "inspect", email: "tester@example.com" })
    );
    const payload = await response.json();
    const serializedPayload = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(mockInspectPrivateTesterData).toHaveBeenCalledWith({
      email: "tester@example.com",
      userId: undefined,
    });
    expect(payload.summary.user.id).toBe("user-1");
    expect(payload.summary.adminState.accessDisabled).toBe(true);
    expect(payload.summary.recentCases).toEqual([
      {
        createdAt: "2026-04-20",
        negativeFeedbackFlagged: true,
        petName: null,
        recommendation: null,
        severity: "emergency",
        symptomCheckId: "case-1",
      },
    ]);
    expect(payload.summary.rawOwnerSymptomText).toBeUndefined();
    expect(payload.summary.telemetry).toBeUndefined();
    expect(serializedPayload).not.toContain("Juniper");
    expect(serializedPayload).not.toContain("vomited blood");
    expect(serializedPayload).not.toContain("Emergency report body");
  });

  it("forwards delete operations with dry-run support", async () => {
    mockDeletePrivateTesterData.mockResolvedValue({
      auditEvent: null,
      deleted: false,
      dryRun: true,
      summary: buildUnsafeTesterSummary(),
    });

    const { POST } = await import("@/app/api/admin/private-tester/route");
    const response = await POST(
      makePostRequest({
        action: "delete",
        dryRun: true,
        email: "tester@example.com",
      })
    );
    const payload = await response.json();
    const serializedPayload = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(mockDeletePrivateTesterData).toHaveBeenCalledWith({
      actorEmail: "admin@pawvital.ai",
      dryRun: true,
      email: "tester@example.com",
      note: undefined,
      userId: undefined,
    });
    expect(payload.dryRun).toBe(true);
    expect(payload.summary.recentCases).toEqual([
      {
        createdAt: "2026-04-20",
        negativeFeedbackFlagged: true,
        petName: null,
        recommendation: null,
        severity: "emergency",
        symptomCheckId: "case-1",
      },
    ]);
    expect(payload.summary.rawOwnerSymptomText).toBeUndefined();
    expect(payload.summary.telemetry).toBeUndefined();
    expect(serializedPayload).not.toContain("Juniper");
    expect(serializedPayload).not.toContain("vomited blood");
    expect(serializedPayload).not.toContain("Emergency report body");
  });

  it("applies admin access and deletion-state actions with the acting admin identity", async () => {
    mockUpdatePrivateTesterAdminState.mockResolvedValue(buildUnsafeTesterSummary());

    const { POST } = await import("@/app/api/admin/private-tester/route");
    const response = await POST(
      makePostRequest({
        action: "disable_access",
        email: "tester@example.com",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.action).toBe("disable_access");
    expect(payload.summary.adminState.accessDisabled).toBe(true);
    expect(mockUpdatePrivateTesterAdminState).toHaveBeenCalledWith({
      action: "disable_access",
      actorEmail: "admin@pawvital.ai",
      email: "tester@example.com",
      note: undefined,
      userId: undefined,
    });
  });
});
