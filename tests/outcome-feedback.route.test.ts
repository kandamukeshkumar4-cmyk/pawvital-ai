const mockSaveOutcomeFeedbackToDB = jest.fn();
const mockCreateServerSupabaseClient = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();

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

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ai/outcome-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("outcome-feedback route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("ip:test");
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
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
  });

  it("stores outcome feedback for a saved symptom check", async () => {
    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makeRequest({
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
        requestingUserId: "user-1",
      })
    );
  });

  it("rejects missing required fields", async () => {
    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makeRequest({
        confirmedDiagnosis: "otitis externa",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid request body");
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(mockSaveOutcomeFeedbackToDB).not.toHaveBeenCalled();
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
      makeRequest({
        symptomCheckId: "11111111-1111-1111-1111-111111111111",
        matchedExpectation: "partly",
      })
    );

    expect(response.status).toBe(401);
    expect(mockSaveOutcomeFeedbackToDB).not.toHaveBeenCalled();
  });

  it("rejects malformed symptom check identifiers before storage writes", async () => {
    const { POST } = await import("@/app/api/ai/outcome-feedback/route");
    const response = await POST(
      makeRequest({
        symptomCheckId: "not-a-uuid",
        matchedExpectation: "partly",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid request body");
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(mockSaveOutcomeFeedbackToDB).not.toHaveBeenCalled();
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
      makeRequest({
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
});
