import { renderToStaticMarkup } from "react-dom/server";

const mockGetAdminRequestContext = jest.fn();
const mockHeaders = jest.fn();
const mockCookies = jest.fn();
const mockBuildDemoAdminFeedbackLedgerDashboardData = jest.fn();
const mockBuildPrivateTesterDashboardFallback = jest.fn();
const mockBuildPrivateTesterCohortCommandCenter = jest.fn();

jest.mock("next/headers", () => ({
  cookies: (...args: unknown[]) => mockCookies(...args),
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

jest.mock("next/link", () => {
  const React = jest.requireActual("react") as typeof import("react");

  return {
    __esModule: true,
    default: ({
      children,
      href,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
    }) => React.createElement("a", { href, ...props }, children),
  };
});

jest.mock("@/lib/admin-auth", () => ({
  getAdminRequestContext: (...args: unknown[]) =>
    mockGetAdminRequestContext(...args),
}));

jest.mock("@/lib/admin-feedback-ledger", () => ({
  buildDemoAdminFeedbackLedgerDashboardData: (...args: unknown[]) =>
    mockBuildDemoAdminFeedbackLedgerDashboardData(...args),
}));

jest.mock("@/lib/private-tester-admin", () => ({
  buildPrivateTesterDashboardFallback: (...args: unknown[]) =>
    mockBuildPrivateTesterDashboardFallback(...args),
}));

jest.mock("@/lib/private-tester-cohort", () => ({
  buildPrivateTesterCohortCommandCenter: (...args: unknown[]) =>
    mockBuildPrivateTesterCohortCommandCenter(...args),
}));

function buildCommandCenterFixture() {
  return {
    filters: {
      emergencySessions: [],
      failedReportSessions: [],
      failedSignInOrAccessSessions: [
        {
          accessDisabled: false,
          accessReason: "allowlisted_email",
          blocked: false,
          deletionRequested: false,
          email: "founder@example.com",
          negativeFeedbackEntries: 1,
          symptomChecks: 2,
          testerId: "tester-1",
        },
      ],
      latestSessions: [{ symptomCheckId: "case-1" }],
      negativeFeedbackSessions: [],
      noFeedbackSessions: [],
      repeatedQuestionSessions: [],
    },
    highRiskSessions: [
      {
        createdAt: "2026-04-21T15:45:00.000Z",
        flagReasons: ["question_flow_issue"],
        reportFailed: true,
        reportId: "report-1",
        reportTitle: "Emergency collapse",
        symptomCheckId: "case-1",
        symptomInput: "collapse and pale gums",
        trustLevel: "no",
        urgencyResult: "emergency_vet",
      },
    ],
    notes: ["Only sanitized command-center notes are rendered here."],
    summary: {
      completedSymptomChecks: 2,
      dataDeletionRequests: 0,
      emergencyResults: 1,
      feedbackSubmitted: 1,
      negativeFeedback: 1,
      repeatedQuestionFlags: 1,
      reportFailures: 1,
      reportsOpened: 1,
      signInFailures: 0,
      signedInTesters: 1,
      testerAccessDisabled: 0,
      testersInvited: 1,
    },
    triage: {
      P0: [
        {
          caseSummary: {
            symptomCheckId: "case-1",
            symptomInput: "collapse and pale gums",
          },
          category: "Emergency report failure",
          rationale: "Treat as a launch-blocking review case.",
          severity: "P0",
        },
      ],
      P1: [],
      P2: [],
      P3: [],
    },
  };
}

function makeJsonResponse(payload: unknown) {
  return {
    json: jest.fn().mockResolvedValue(payload),
    ok: true,
  } as unknown as Response;
}

async function renderPage() {
  const { default: AdminCohortLaunchPage } = await import(
    "@/app/(dashboard)/admin/cohort-launch/page"
  );

  return renderToStaticMarkup(await AdminCohortLaunchPage());
}

describe("AdminCohortLaunchPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof global.fetch;
    mockBuildDemoAdminFeedbackLedgerDashboardData.mockReturnValue({
      latestCases: [],
      summary: {},
    });
    mockBuildPrivateTesterDashboardFallback.mockReturnValue({
      config: { allowedEmailCount: 0 },
      summary: {},
      testers: [],
      warning: "fallback",
    });
    mockBuildPrivateTesterCohortCommandCenter.mockReturnValue(
      buildCommandCenterFixture()
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the cohort command center for an authorized admin without leaking raw API payload secrets", async () => {
    const rawPrivateTesterPayload = {
      secretServiceRole: "service-role-secret",
      testers: [],
    };
    const rawFeedbackPayload = {
      latestCases: [],
      secretDbValue: "postgres://service-role-user:super-secret-service-role-value",
    };

    mockGetAdminRequestContext.mockResolvedValue({
      email: "founder@example.com",
      isDemo: false,
      userId: "admin-1",
    });
    mockHeaders.mockResolvedValue(new Headers({ host: "app.pawvital.ai" }));
    mockCookies.mockResolvedValue({
      toString: () => "sb-access-token=admin-session",
    });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeJsonResponse(rawPrivateTesterPayload))
      .mockResolvedValueOnce(makeJsonResponse(rawFeedbackPayload));

    const html = await renderPage();

    expect(html).toContain("Private Tester Cohort 1 Command Center");
    expect(html).toContain("Founder triage queue");
    expect(html).toContain("Only sanitized command-center notes are rendered here.");
    expect(html).not.toContain("service-role-secret");
    expect(html).not.toContain("super-secret-service-role-value");
    expect(mockBuildPrivateTesterDashboardFallback).toHaveBeenCalledWith(
      "Private tester admin data is currently unavailable."
    );
    expect(mockBuildPrivateTesterCohortCommandCenter).toHaveBeenCalledWith({
      feedbackDashboard: rawFeedbackPayload,
      privateTesterDashboard: rawPrivateTesterPayload,
    });
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://app.pawvital.ai/api/admin/private-tester",
      { headers: { cookie: "sb-access-token=admin-session" } }
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://app.pawvital.ai/api/admin/tester-feedback",
      { headers: { cookie: "sb-access-token=admin-session" } }
    );
  });

  it("blocks unauthenticated access before any admin data is fetched", async () => {
    mockGetAdminRequestContext.mockResolvedValue(null);

    const html = await renderPage();

    expect(html).toContain("Admin access required");
    expect(html).toContain(
      "The Cohort 1 command center is only available to signed-in admins."
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockBuildPrivateTesterCohortCommandCenter).not.toHaveBeenCalled();
  });
});
