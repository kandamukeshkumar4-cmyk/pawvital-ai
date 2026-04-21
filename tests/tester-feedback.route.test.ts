const mockGetUser = jest.fn();
const mockSaveTesterFeedbackToDB = jest.fn();
const mockListTesterFeedbackCases = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  }),
}));

jest.mock("@/lib/tester-feedback-storage", () => ({
  saveTesterFeedbackToDB: (...args: unknown[]) =>
    mockSaveTesterFeedbackToDB(...args),
  listTesterFeedbackCases: (...args: unknown[]) =>
    mockListTesterFeedbackCases(...args),
}));

function makePostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ai/tester-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("tester-feedback route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("stores emergency feedback and surfaces founder-review flags", async () => {
    mockSaveTesterFeedbackToDB.mockResolvedValue({
      ok: true,
      warnings: [],
      caseSummary: {
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        reportId: "11111111-1111-1111-1111-111111111111",
        testerUserId: "user-1",
        petId: "pet-1",
        reportTitle: "Emergency vomiting case",
        symptomInput: "Repeated vomiting with pale gums",
        knownSymptoms: ["vomiting"],
        urgencyResult: "emergency_vet",
        createdAt: "2026-04-20T12:00:00.000Z",
        feedbackStatus: "flagged",
        flagged: true,
        flagReasons: [
          "helpfulness_no",
          "trust_not_sure",
          "confusing_wording",
          "emergency_result",
        ],
        helpfulness: "no",
        confusingAreas: ["wording"],
        trustLevel: "not_sure",
        notes: "The wording felt too vague.",
        submittedAt: "2026-04-20T12:05:00.000Z",
        questionCount: 2,
        answerCount: 2,
      },
    });

    const { POST } = await import("@/app/api/ai/tester-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        helpfulness: "no",
        confusingAreas: ["wording"],
        trustLevel: "not_sure",
        notes: "The wording felt too vague.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.case.flagged).toBe(true);
    expect(payload.case.flagReasons).toEqual(
      expect.arrayContaining(["emergency_result", "confusing_wording"])
    );
    expect(mockSaveTesterFeedbackToDB).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
      })
    );
  });

  it("stores mild feedback without creating negative flags", async () => {
    mockSaveTesterFeedbackToDB.mockResolvedValue({
      ok: true,
      warnings: [],
      caseSummary: {
        symptomCheckId: "22222222-2222-2222-2222-222222222222",
        reportId: "22222222-2222-2222-2222-222222222222",
        testerUserId: "user-1",
        petId: "pet-2",
        reportTitle: "Mild limp after activity",
        symptomInput: "Mild limp after running",
        knownSymptoms: ["limping"],
        urgencyResult: "monitor",
        createdAt: "2026-04-20T12:30:00.000Z",
        feedbackStatus: "submitted",
        flagged: false,
        flagReasons: [],
        helpfulness: "yes",
        confusingAreas: [],
        trustLevel: "yes",
        notes: "Clear and helpful.",
        submittedAt: "2026-04-20T12:35:00.000Z",
        questionCount: 1,
        answerCount: 1,
      },
    });

    const { POST } = await import("@/app/api/ai/tester-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "22222222-2222-2222-2222-222222222222",
        helpfulness: "yes",
        confusingAreas: [],
        trustLevel: "yes",
        notes: "Clear and helpful.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.case.flagged).toBe(false);
    expect(payload.case.feedbackStatus).toBe("submitted");
  });

  it("lists flagged cases so founder review stays queryable", async () => {
    mockListTesterFeedbackCases.mockResolvedValue({
      ok: true,
      warnings: [],
      cases: [
        {
          symptomCheckId: "11111111-1111-1111-1111-111111111111",
          reportId: "11111111-1111-1111-1111-111111111111",
          testerUserId: "user-1",
          petId: "pet-1",
          reportTitle: "Emergency vomiting case",
          symptomInput: "Repeated vomiting with pale gums",
          knownSymptoms: ["vomiting"],
          urgencyResult: "emergency_vet",
          createdAt: "2026-04-20T12:00:00.000Z",
          feedbackStatus: "flagged",
          flagged: true,
          flagReasons: ["emergency_result", "helpfulness_no"],
          helpfulness: "no",
          confusingAreas: ["wording"],
          trustLevel: "not_sure",
          notes: "The wording felt too vague.",
          submittedAt: "2026-04-20T12:05:00.000Z",
          questionCount: 2,
          answerCount: 2,
        },
      ],
    });

    const { GET } = await import("@/app/api/ai/tester-feedback/route");
    const response = await GET(
      new Request("http://localhost/api/ai/tester-feedback?flaggedOnly=true")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.cases).toHaveLength(1);
    expect(payload.cases[0].flagReasons).toEqual(
      expect.arrayContaining(["emergency_result", "helpfulness_no"])
    );
    expect(mockListTesterFeedbackCases).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        flaggedOnly: true,
      })
    );
  });
});
