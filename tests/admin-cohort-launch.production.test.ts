import fs from "node:fs";
import path from "node:path";
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
  const ReactActual = jest.requireActual<typeof import("react")>("react");

  return {
    __esModule: true,
    default: ({
      children,
      href,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
    }) => ReactActual.createElement("a", { href, ...props }, children),
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

const cohortLaunchSourcePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(dashboard)",
  "admin",
  "cohort-launch",
  "page.tsx"
);
const appPathsManifestPath = path.join(
  process.cwd(),
  ".next",
  "server",
  "app-paths-manifest.json"
);

function buildCommandCenterFixture() {
  return {
    filters: {
      emergencySessions: [],
      failedReportSessions: [],
      failedSignInOrAccessSessions: [],
      latestSessions: [{ symptomCheckId: "case-1" }],
      negativeFeedbackSessions: [],
      noFeedbackSessions: [],
      repeatedQuestionSessions: [],
    },
    highRiskSessions: [],
    notes: ["Founder-only command center stays available in private tester mode."],
    summary: {
      completedSymptomChecks: 1,
      dataDeletionRequests: 0,
      emergencyResults: 0,
      feedbackSubmitted: 0,
      negativeFeedback: 0,
      repeatedQuestionFlags: 0,
      reportFailures: 0,
      reportsOpened: 0,
      signInFailures: 0,
      signedInTesters: 1,
      testerAccessDisabled: 0,
      testersInvited: 1,
    },
    triage: {
      P0: [],
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

describe("VET-1387 cohort launch production regression", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PRIVATE_TESTER_MODE: "1",
    };
    global.fetch = jest.fn() as typeof global.fetch;
    mockGetAdminRequestContext.mockResolvedValue({
      email: "founder@example.com",
      isDemo: false,
      userId: "admin-1",
    });
    mockHeaders.mockResolvedValue(new Headers({ host: "app.pawvital.ai" }));
    mockCookies.mockResolvedValue({
      toString: () => "sb-access-token=admin-session",
    });
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
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeJsonResponse({ testers: [] }))
      .mockResolvedValueOnce(makeJsonResponse({ latestCases: [] }));
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("keeps the cohort launch page reachable for admins while private tester mode is enabled", async () => {
    const html = await renderPage();

    expect(html).toContain("Private Tester Cohort 1 Command Center");
    expect(html).toContain("Founder triage queue");
    expect(html).toContain("Tester access");
    expect(html).not.toContain("Admin access required");
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

  it("keeps the cohort launch route in build output when the app manifest exists", () => {
    expect(fs.existsSync(cohortLaunchSourcePath)).toBe(true);

    if (!fs.existsSync(appPathsManifestPath)) {
      return;
    }

    const manifest = JSON.parse(
      fs.readFileSync(appPathsManifestPath, "utf8")
    ) as Record<string, string>;

    expect(manifest["/(dashboard)/admin/cohort-launch/page"]).toBe(
      "app/(dashboard)/admin/cohort-launch/page.js"
    );
  });
});
