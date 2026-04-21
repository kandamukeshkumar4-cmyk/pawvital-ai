const mockGetAdminRequestContext = jest.fn();
const mockBuildAdminShadowRolloutDashboardData = jest.fn();
const mockUpdateAdminShadowRolloutControl = jest.fn();
const mockLoadAdminTelemetryDashboardData = jest.fn();
const mockGetServiceSupabase = jest.fn();
const mockCreateServerSupabaseClient = jest.fn();
const mockOctokitIssuesCreate = jest.fn();
const mockOctokitConstructor = jest.fn(() => ({
  rest: {
    issues: {
      create: mockOctokitIssuesCreate,
    },
  },
}));
const mockFetch = jest.fn();

jest.mock("@/lib/admin-auth", () => ({
  getAdminRequestContext: (...args: unknown[]) =>
    mockGetAdminRequestContext(...args),
}));

jest.mock("@/lib/admin-shadow-rollout", () => ({
  buildAdminShadowRolloutDashboardData: (...args: unknown[]) =>
    mockBuildAdminShadowRolloutDashboardData(...args),
  updateAdminShadowRolloutControl: (...args: unknown[]) =>
    mockUpdateAdminShadowRolloutControl(...args),
}));

jest.mock("@/lib/admin-telemetry", () => ({
  loadAdminTelemetryDashboardData: (...args: unknown[]) =>
    mockLoadAdminTelemetryDashboardData(...args),
}));

jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: (...args: unknown[]) => mockGetServiceSupabase(...args),
}));

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: (...args: unknown[]) =>
    mockCreateServerSupabaseClient(...args),
}));

jest.mock("@octokit/rest", () => ({
  Octokit: mockOctokitConstructor,
}));

function makeJsonRequest(
  url: string,
  method: "PATCH" | "POST",
  body: Record<string, unknown>
) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

const routeSpecs = [
  {
    expectedStatus: 403,
    invoke: async () => (await import("@/app/api/admin/deployment/route")).GET(),
    label: "deployment GET",
  },
  {
    expectedStatus: 403,
    invoke: async () =>
      (
        await import("@/app/api/admin/issues/route")
      ).POST(
        makeJsonRequest("http://localhost/api/admin/issues", "POST", {
          body: "Need review",
          title: "Security test issue",
        })
      ),
    label: "issues POST",
  },
  {
    expectedStatus: 403,
    invoke: async () =>
      (await import("@/app/api/admin/shadow-rollout/route")).GET(),
    label: "shadow-rollout GET",
  },
  {
    expectedStatus: 403,
    invoke: async () =>
      (
        await import("@/app/api/admin/shadow-rollout/route")
      ).PATCH(
        makeJsonRequest("http://localhost/api/admin/shadow-rollout", "PATCH", {
          liveSplitPct: 10,
          service: "text-retrieval-service",
        })
      ),
    label: "shadow-rollout PATCH",
  },
  {
    expectedStatus: 403,
    invoke: async () => (await import("@/app/api/admin/sidecars/route")).GET(),
    label: "sidecars GET",
  },
  {
    expectedStatus: 403,
    invoke: async () =>
      (
        await import("@/app/api/admin/sidecars/route")
      ).PATCH(
        makeJsonRequest("http://localhost/api/admin/sidecars", "PATCH", {
          liveSplitPct: 10,
          service: "text-retrieval-service",
        })
      ),
    label: "sidecars PATCH",
  },
  {
    expectedStatus: 403,
    invoke: async () => (await import("@/app/api/admin/stats/route")).GET(),
    label: "stats GET",
  },
  {
    expectedStatus: 401,
    invoke: async () => (await import("@/app/api/admin/telemetry/route")).GET(),
    label: "telemetry GET",
  },
  {
    expectedStatus: 403,
    invoke: async () =>
      (await import("@/app/api/admin/threshold-proposals/route")).GET(),
    label: "threshold proposals GET",
  },
  {
    expectedStatus: 403,
    invoke: async () =>
      (
        await import("@/app/api/admin/threshold-proposals/route")
      ).PATCH(
        makeJsonRequest(
          "http://localhost/api/admin/threshold-proposals",
          "PATCH",
          {
            proposalId: "proposal-1",
            reviewerNotes: "Looks good.",
            status: "approved",
          }
        )
      ),
    label: "threshold proposals PATCH",
  },
  {
    expectedStatus: 403,
    invoke: async () =>
      (
        await import("@/app/api/admin/threshold-proposals/pr-draft/route")
      ).POST(
        makeJsonRequest(
          "http://localhost/api/admin/threshold-proposals/pr-draft",
          "POST",
          { proposalIds: ["proposal-1"] }
        )
      ),
    label: "threshold proposals PR draft POST",
  },
  {
    expectedStatus: 403,
    invoke: async () =>
      (
        await import("@/app/api/admin/threshold-proposals/review-cycle/route")
      ).POST(
        makeJsonRequest(
          "http://localhost/api/admin/threshold-proposals/review-cycle",
          "POST",
          { cycleSlug: "round1", proposalIds: ["proposal-1"] }
        )
      ),
    label: "threshold proposals review-cycle POST",
  },
] as const;

describe("admin route guard sweep", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    global.fetch = mockFetch as typeof global.fetch;
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGetAdminRequestContext.mockResolvedValue(null);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each(routeSpecs)(
    "blocks unauthorized $label via getAdminRequestContext",
    async ({ expectedStatus, invoke }) => {
      const response = await invoke();
      const payload = await response.json();

      expect(response.status).toBe(expectedStatus);
      expect(payload).toEqual({ error: "Unauthorized" });
      expect(mockBuildAdminShadowRolloutDashboardData).not.toHaveBeenCalled();
      expect(mockUpdateAdminShadowRolloutControl).not.toHaveBeenCalled();
      expect(mockLoadAdminTelemetryDashboardData).not.toHaveBeenCalled();
      expect(mockGetServiceSupabase).not.toHaveBeenCalled();
      expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
      expect(mockOctokitConstructor).not.toHaveBeenCalled();
      expect(mockOctokitIssuesCreate).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );
});
