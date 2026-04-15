const mockGetAdminRequestContext = jest.fn();
const mockGetServiceSupabase = jest.fn();

const mockReposGet = jest.fn();
const mockGitGetRef = jest.fn();
const mockGitGetCommit = jest.fn();
const mockGitCreateTree = jest.fn();
const mockGitCreateCommit = jest.fn();
const mockGitCreateRef = jest.fn();
const mockPullsCreate = jest.fn();
const mockIssuesAddLabels = jest.fn();

jest.mock("@/lib/admin-auth", () => ({
  getAdminRequestContext: (...args: unknown[]) =>
    mockGetAdminRequestContext(...args),
}));

jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: (...args: unknown[]) => mockGetServiceSupabase(...args),
}));

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      git: {
        createCommit: mockGitCreateCommit,
        createRef: mockGitCreateRef,
        createTree: mockGitCreateTree,
        getCommit: mockGitGetCommit,
        getRef: mockGitGetRef,
      },
      issues: {
        addLabels: mockIssuesAddLabels,
      },
      pulls: {
        create: mockPullsCreate,
      },
      repos: {
        get: mockReposGet,
      },
    },
  })),
}));

function makePatchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/threshold-proposals", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/admin/threshold-proposals/pr-draft",
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function makeReviewCycleRequest(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/admin/threshold-proposals/review-cycle",
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function buildServiceSupabaseMock(rows: unknown[]) {
  const listResult = { data: rows, error: null };
  const queryChain: Record<string, unknown> & PromiseLike<typeof listResult> = {
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(listResult),
    order: jest.fn().mockReturnThis(),
    then: (
      resolve: (value: typeof listResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(listResult).then(resolve, reject),
  };
  const updateEq = jest.fn().mockResolvedValue({ error: null });

  return {
    queryChain,
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnValue(queryChain),
        update: jest.fn().mockReturnValue({
          eq: updateEq,
        }),
      })),
    },
    updateEq,
  };
}

describe("admin threshold proposal routes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      GITHUB_REPO: "kandamukeshkumar4-cmyk/pawvital-ai",
    };
    mockGetAdminRequestContext.mockResolvedValue({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns proposal dashboard data for admins", async () => {
    const { supabase } = buildServiceSupabaseMock([
      {
        id: "proposal-1",
        outcome_feedback_entries: {
          confirmed_diagnosis: "otitis media",
          matched_expectation: "no",
        },
        proposal_type: "threshold_review",
        rationale: "Mismatch on ear disease.",
        status: "approved",
        summary: "Review same-day escalation",
      },
    ]);
    mockGetServiceSupabase.mockReturnValue(supabase);

    const { GET } = await import("@/app/api/admin/threshold-proposals/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.proposals).toHaveLength(1);
    expect(payload.summary.approved).toBe(1);
  });

  it("persists reviewer status and notes", async () => {
    const { supabase, updateEq } = buildServiceSupabaseMock([]);
    mockGetServiceSupabase.mockReturnValue(supabase);

    const { PATCH } = await import("@/app/api/admin/threshold-proposals/route");
    const response = await PATCH(
      makePatchRequest({
        proposalId: "proposal-1",
        reviewerNotes: "Approved for documentation-only PR.",
        status: "approved",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(updateEq).toHaveBeenCalledWith("id", "proposal-1");
  });

  it("requires reviewer notes before recording a decision", async () => {
    const { supabase } = buildServiceSupabaseMock([]);
    mockGetServiceSupabase.mockReturnValue(supabase);

    const { PATCH } = await import("@/app/api/admin/threshold-proposals/route");
    const response = await PATCH(
      makePatchRequest({
        proposalId: "proposal-1",
        reviewerNotes: "   ",
        status: "approved",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Reviewer notes are required");
  });

  it("builds a round-one review cycle preview from reviewed proposals", async () => {
    const { supabase } = buildServiceSupabaseMock([
      {
        id: "proposal-1",
        proposal_type: "threshold_review",
        rationale: "Mismatch on ear disease.",
        reviewer_notes:
          "Clinical reviewer wants a follow-up implementation ticket.",
        status: "approved",
        summary: "Review same-day escalation",
      },
      {
        id: "proposal-2",
        proposal_type: "calibration_review",
        rationale: "Calibration issue on vomiting case.",
        reviewer_notes: "Keep this proposal observational only for now.",
        status: "rejected",
        summary: "Review monitor calibration",
      },
    ]);
    mockGetServiceSupabase.mockReturnValue(supabase);

    const { POST } =
      await import("@/app/api/admin/threshold-proposals/review-cycle/route");
    const response = await POST(
      makeReviewCycleRequest({ cycleSlug: "round1" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reviewCycle.filePath).toBe(
      "plans/threshold-proposals-round1.md",
    );
    expect(payload.reviewCycle.fileContent).toContain(
      "Clinical reviewer wants a follow-up implementation ticket.",
    );
    expect(payload.reviewCycle.fileContent).toContain(
      "Keep this proposal observational only for now.",
    );
  });

  it("returns a preview draft when GitHub credentials are unavailable", async () => {
    const { supabase } = buildServiceSupabaseMock([
      {
        id: "proposal-1",
        proposal_type: "threshold_review",
        rationale: "Mismatch on ear disease.",
        reviewer_notes: "Ready for review.",
        status: "approved",
        summary: "Review same-day escalation",
      },
      {
        id: "proposal-2",
        proposal_type: "calibration_review",
        rationale: "Calibration drift on vomiting case.",
        reviewer_notes:
          "Rejected in round one because evidence volume is too low.",
        status: "rejected",
        summary: "Review monitor calibration",
      },
    ]);
    mockGetServiceSupabase.mockReturnValue(supabase);
    delete process.env.GITHUB_TOKEN;

    const { POST } =
      await import("@/app/api/admin/threshold-proposals/pr-draft/route");
    const response = await POST(
      makePostRequest({ proposalIds: ["proposal-1"] }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe("preview");
    expect(payload.draft.body).toContain("Human engineer approval");
    expect(payload.draft.body).toContain("Clinical reviewer approval");
    expect(payload.reviewCycle.filePath).toBe(
      "plans/threshold-proposals-round1.md",
    );
  });

  it("creates a draft GitHub PR when credentials are configured", async () => {
    const { supabase } = buildServiceSupabaseMock([
      {
        id: "proposal-1",
        proposal_type: "threshold_review",
        rationale: "Mismatch on ear disease.",
        reviewer_notes: "Ready for review.",
        status: "approved",
        summary: "Review same-day escalation",
      },
      {
        id: "proposal-2",
        proposal_type: "calibration_review",
        rationale: "Calibration drift on vomiting case.",
        reviewer_notes:
          "Rejected in round one because evidence volume is too low.",
        status: "rejected",
        summary: "Review monitor calibration",
      },
    ]);
    mockGetServiceSupabase.mockReturnValue(supabase);
    process.env.GITHUB_TOKEN = "test-token";

    mockReposGet.mockResolvedValue({
      data: { default_branch: "master" },
    });
    mockGitGetRef.mockResolvedValue({
      data: { object: { sha: "base-sha" } },
    });
    mockGitGetCommit.mockResolvedValue({
      data: { tree: { sha: "tree-sha" } },
    });
    mockGitCreateTree.mockResolvedValue({
      data: { sha: "new-tree" },
    });
    mockGitCreateCommit.mockResolvedValue({
      data: { sha: "new-commit" },
    });
    mockGitCreateRef.mockResolvedValue({});
    mockPullsCreate.mockResolvedValue({
      data: {
        html_url:
          "https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/pull/999",
        number: 999,
      },
    });
    mockIssuesAddLabels.mockResolvedValue({});

    const { POST } =
      await import("@/app/api/admin/threshold-proposals/pr-draft/route");
    const response = await POST(
      makePostRequest({ proposalIds: ["proposal-1"] }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe("github");
    expect(payload.url).toContain("/pull/999");
    expect(payload.reviewCycle.filePath).toBe(
      "plans/threshold-proposals-round1.md",
    );
    expect(mockPullsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true }),
    );
    expect(mockGitCreateTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: expect.arrayContaining([
          expect.objectContaining({
            path: "plans/threshold-proposals-round1.md",
          }),
        ]),
      }),
    );
  });
});
