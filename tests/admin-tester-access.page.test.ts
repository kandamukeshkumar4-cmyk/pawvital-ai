import { renderToStaticMarkup } from "react-dom/server";

const mockGetAdminRequestContext = jest.fn();
const mockBuildPrivateTesterDashboardFallback = jest.fn();
const mockListPrivateTesterSummaries = jest.fn();
const mockTesterAccessDashboardClient = jest.fn();

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

jest.mock("@/lib/private-tester-admin", () => ({
  buildPrivateTesterDashboardFallback: (...args: unknown[]) =>
    mockBuildPrivateTesterDashboardFallback(...args),
  listPrivateTesterSummaries: (...args: unknown[]) =>
    mockListPrivateTesterSummaries(...args),
}));

jest.mock(
  "@/app/(dashboard)/admin/tester-access/TesterAccessDashboardClient",
  () => ({
    __esModule: true,
    default: (props: { initialData: unknown }) => {
      mockTesterAccessDashboardClient(props);
      return "tester-access-dashboard-client";
    },
  })
);

async function renderPage() {
  const { default: AdminTesterAccessPage } = await import(
    "@/app/(dashboard)/admin/tester-access/page"
  );

  return renderToStaticMarkup(await AdminTesterAccessPage());
}

describe("AdminTesterAccessPage", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockBuildPrivateTesterDashboardFallback.mockReturnValue({
      config: { allowedEmailCount: 0 },
      summary: { total: 0 },
      testers: [],
    });
  });

  it("blocks unauthorized callers before any tester access data is loaded", async () => {
    mockGetAdminRequestContext.mockResolvedValue(null);

    const html = await renderPage();

    expect(html).toContain("Admin access required");
    expect(html).toContain(
      "Tester access controls are only available to signed-in admins."
    );
    expect(mockListPrivateTesterSummaries).not.toHaveBeenCalled();
    expect(mockTesterAccessDashboardClient).not.toHaveBeenCalled();
  });

  it("renders the tester access dashboard for admins with the sanitized dataset", async () => {
    mockGetAdminRequestContext.mockResolvedValue({
      email: "founder@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
    mockListPrivateTesterSummaries.mockResolvedValue({
      config: {
        allowedEmailCount: 1,
        allowedEmails: ["tester@example.com"],
        blockedEmailCount: 0,
        blockedEmails: [],
        freeAccess: true,
        guestSymptomChecker: false,
        inviteOnly: true,
        modeEnabled: true,
      },
      summary: {
        active: 1,
        authAccessDisabled: 0,
        blocked: 0,
        deletionRequested: 0,
        negativeFeedbackEntries: 0,
        symptomChecks: 1,
        total: 1,
      },
      testers: [],
    });

    const html = await renderPage();

    expect(html).toContain("tester-access-dashboard-client");
    expect(mockListPrivateTesterSummaries).toHaveBeenCalledTimes(1);
    expect(mockTesterAccessDashboardClient).toHaveBeenCalledWith({
      initialData: {
        config: {
          allowedEmailCount: 1,
          allowedEmails: ["tester@example.com"],
          blockedEmailCount: 0,
          blockedEmails: [],
          freeAccess: true,
          guestSymptomChecker: false,
          inviteOnly: true,
          modeEnabled: true,
        },
        summary: {
          active: 1,
          authAccessDisabled: 0,
          blocked: 0,
          deletionRequested: 0,
          negativeFeedbackEntries: 0,
          symptomChecks: 1,
          total: 1,
        },
        testers: [],
      },
    });
  });
});
