const mockGetAdminRequestContext = jest.fn();
const mockInspectPrivateTesterData = jest.fn();
const mockDeletePrivateTesterData = jest.fn();
const mockBuildPrivateTesterDashboardFallback = jest.fn();
const mockListPrivateTesterSummaries = jest.fn();

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
}));

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
        blocked: 0,
        negativeFeedbackEntries: 0,
        symptomChecks: 0,
        total: 0,
      },
      testers: [],
    });
  });

  it("VET-1352 tester access smoke: returns the current tester dashboard for admins", async () => {
    mockListPrivateTesterSummaries.mockResolvedValue({
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
        negativeFeedbackEntries: 0,
        symptomChecks: 4,
        total: 2,
      },
      testers: [],
    });

    const { GET } = await import("@/app/api/admin/private-tester/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.config.allowedEmailCount).toBe(2);
    expect(payload.summary.blocked).toBe(1);
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
        blocked: 1,
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

  it("rejects unauthorized requests", async () => {
    mockGetAdminRequestContext.mockResolvedValue(null);

    const { GET } = await import("@/app/api/admin/private-tester/route");
    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("inspects tester data by email", async () => {
    mockInspectPrivateTesterData.mockResolvedValue({
      access: { allowed: true, reason: "allowlisted_email" },
      config: { modeEnabled: true },
      counts: { pets: 1, symptomChecks: 3 },
      user: { email: "tester@example.com", fullName: "Tester", id: "user-1" },
    });

    const { POST } = await import("@/app/api/admin/private-tester/route");
    const response = await POST(
      makePostRequest({ action: "inspect", email: "tester@example.com" })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockInspectPrivateTesterData).toHaveBeenCalledWith({
      email: "tester@example.com",
      userId: undefined,
    });
    expect(payload.summary.user.id).toBe("user-1");
  });

  it("forwards delete operations with dry-run support", async () => {
    mockDeletePrivateTesterData.mockResolvedValue({
      deleted: false,
      dryRun: true,
      summary: {
        access: { allowed: true, reason: "allowlisted_email" },
        config: { modeEnabled: true },
        counts: { pets: 1, symptomChecks: 3 },
        user: { email: "tester@example.com", fullName: "Tester", id: "user-1" },
      },
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

    expect(response.status).toBe(200);
    expect(mockDeletePrivateTesterData).toHaveBeenCalledWith({
      dryRun: true,
      email: "tester@example.com",
      userId: undefined,
    });
    expect(payload.dryRun).toBe(true);
  });
});
