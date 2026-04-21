const mockCreateServerSupabaseClient = jest.fn();
const mockListTesterFeedbackCases = jest.fn();
const mockSaveTesterFeedbackToDB = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: (...args: unknown[]) =>
    mockCreateServerSupabaseClient(...args),
}));

jest.mock("@/lib/tester-feedback-storage", () => ({
  listTesterFeedbackCases: (...args: unknown[]) =>
    mockListTesterFeedbackCases(...args),
  saveTesterFeedbackToDB: (...args: unknown[]) =>
    mockSaveTesterFeedbackToDB(...args),
}));

function makePostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ai/outcome-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/ai/outcome-feedback${query}`, {
    method: "GET",
  });
}

describe("outcome-feedback route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: "owner-1",
              email: "owner@example.com",
            },
          },
          error: null,
        }),
      },
    });
    mockSaveTesterFeedbackToDB.mockResolvedValue({
      ok: true,
      caseSummary: {
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        reportId: "11111111-1111-1111-1111-111111111111",
        testerUserId: "owner-1",
        petId: "pet-1",
        reportTitle: "Emergency vomiting case",
        symptomInput: "vomiting",
        knownSymptoms: ["vomiting"],
        urgencyResult: "emergency_vet",
        createdAt: "2026-04-20T12:00:00.000Z",
        feedbackStatus: "flagged",
        flagged: true,
        negativeFeedbackFlag: true,
        emergencyCase: true,
        reportFailed: true,
        flagReasons: ["emergency_result", "report_failed"],
        helpfulness: "no",
        confusingAreas: ["report"],
        trustLevel: "no",
        notes: "This felt wrong and scary.",
        submittedAt: "2026-04-20T12:05:00.000Z",
        questionCount: 2,
        answerCount: 2,
        questionsAsked: [],
        answersGiven: {},
      },
      warnings: [],
    });
    mockListTesterFeedbackCases.mockResolvedValue({
      ok: true,
      cases: [],
      warnings: [],
    });
  });

  it("stores structured tester feedback for a saved symptom check", async () => {
    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        helpfulness: "no",
        confusingAreas: ["report", "wording"],
        trustLevel: "not_sure",
        notes: "The wording felt confusing and scary.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.case.flagged).toBe(true);
    expect(mockSaveTesterFeedbackToDB).toHaveBeenCalledWith({
      userId: "owner-1",
      feedback: {
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        helpfulness: "no",
        confusingAreas: ["report", "wording"],
        trustLevel: "not_sure",
        notes: "The wording felt confusing and scary.",
        surface: "result_page",
      },
    });
  });

  it("rejects invalid feedback payloads", async () => {
    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "not-a-uuid",
        helpfulness: "partly",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Invalid request body");
  });

  it("lists current-user feedback cases", async () => {
    mockListTesterFeedbackCases.mockResolvedValue({
      ok: true,
      cases: [
        {
          symptomCheckId: "22222222-2222-2222-2222-222222222222",
          reportId: "22222222-2222-2222-2222-222222222222",
          testerUserId: "owner-1",
          petId: "pet-2",
          reportTitle: "Mild limp",
          symptomInput: "mild limp after fetch",
          knownSymptoms: ["limping"],
          urgencyResult: "monitor",
          createdAt: "2026-04-20T12:30:00.000Z",
          feedbackStatus: "submitted",
          flagged: false,
          negativeFeedbackFlag: false,
          emergencyCase: false,
          reportFailed: false,
          flagReasons: [],
          helpfulness: "yes",
          confusingAreas: [],
          trustLevel: "yes",
          notes: "Clear.",
          submittedAt: "2026-04-20T12:35:00.000Z",
          questionCount: 1,
          answerCount: 1,
          questionsAsked: [],
          answersGiven: {},
        },
      ],
      warnings: [],
    });

    const { GET } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await GET(makeGetRequest("?flaggedOnly=true"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockListTesterFeedbackCases).toHaveBeenCalledWith({
      userId: "owner-1",
      flaggedOnly: true,
      symptomCheckId: undefined,
    });
  });
});
