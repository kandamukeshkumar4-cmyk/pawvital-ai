const mockSaveOutcomeFeedbackToDB = jest.fn();
const mockCreateServerSupabaseClient = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockListTesterFeedbackCases = jest.fn();
const mockSaveTesterFeedbackToDB = jest.fn();

jest.mock("@/lib/report-storage", () => ({
  saveOutcomeFeedbackToDB: (...args: unknown[]) =>
    mockSaveOutcomeFeedbackToDB(...args),
}));

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
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
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("ip:test");
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
    mockSaveOutcomeFeedbackToDB.mockResolvedValue({
      ok: true,
      legacyUpdated: true,
      structuredStored: true,
      proposalCreated: false,
      warnings: [],
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

  it("stores owner outcome feedback for a saved symptom check", async () => {
    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        matchedExpectation: "partly",
        confirmedDiagnosis: "otitis externa",
        vetOutcome: "Cytology and medication",
        ownerNotes: "The vet said the emergency threshold was right.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.structuredStored).toBe(true);
    expect(mockSaveOutcomeFeedbackToDB).toHaveBeenCalledWith(
      expect.objectContaining({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        matchedExpectation: "partly",
        requestingUserId: "owner-1",
      })
    );
    expect(mockSaveTesterFeedbackToDB).not.toHaveBeenCalled();
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
    expect(mockSaveOutcomeFeedbackToDB).not.toHaveBeenCalled();
  });

  it("lists current-user tester feedback cases", async () => {
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

  it("rejects invalid request bodies before storage writes", async () => {
    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "not-a-uuid",
        matchedExpectation: "partly",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid request body");
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(mockSaveOutcomeFeedbackToDB).not.toHaveBeenCalled();
    expect(mockSaveTesterFeedbackToDB).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated feedback submissions", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        matchedExpectation: "partly",
      })
    );

    expect(response.status).toBe(401);
    expect(mockSaveOutcomeFeedbackToDB).not.toHaveBeenCalled();
    expect(mockSaveTesterFeedbackToDB).not.toHaveBeenCalled();
  });

  it("returns generic ownership failures without leaking private content", async () => {
    mockSaveOutcomeFeedbackToDB.mockResolvedValue({
      ok: false,
      errorCode: "forbidden",
      legacyUpdated: false,
      structuredStored: false,
      proposalCreated: false,
      warnings: [
        "Owner notes: Piper needed sedation after the emergency visit",
      ],
    });

    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        matchedExpectation: "no",
        ownerNotes: "Piper needed sedation after the emergency visit",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      ok: false,
      error: "Unable to save outcome feedback",
    });
    expect(JSON.stringify(payload)).not.toContain("Piper");
    expect(payload.warnings).toBeUndefined();
  });

  it("sanitizes tester feedback save failures without parsing warning text", async () => {
    mockSaveTesterFeedbackToDB.mockResolvedValue({
      ok: false,
      errorCode: "not_found",
      caseSummary: null,
      warnings: [
        "Owner notes: Piper needed sedation after the emergency visit",
      ],
    });

    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        helpfulness: "no",
        confusingAreas: ["report"],
        trustLevel: "no",
        notes: "Piper needed sedation after the emergency visit",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      ok: false,
      error: "Unable to save outcome feedback",
    });
    expect(JSON.stringify(payload)).not.toContain("Piper");
  });

  it("sanitizes tester feedback list failures without exposing storage warnings", async () => {
    mockListTesterFeedbackCases.mockResolvedValue({
      ok: false,
      errorCode: "server_unavailable",
      cases: [],
      warnings: [
        "Owner notes: Piper needed sedation after the emergency visit",
      ],
    });

    const { GET } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await GET(makeGetRequest("?flaggedOnly=true"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      error: "Unable to load outcome feedback cases",
    });
    expect(JSON.stringify(payload)).not.toContain("Piper");
  });

  it("blocks repeated abuse when the route limiter trips", async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      reset: Date.now() + 10_000,
    });

    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makePostRequest({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        helpfulness: "yes",
        confusingAreas: [],
        trustLevel: "yes",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("Too many requests. Please slow down.");
    expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
  });
});
