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
        symptomCheckId: "abc123",
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
        symptomCheckId: "abc123",
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
    expect(payload.error).toContain("required");
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
        symptomCheckId: "abc123",
        matchedExpectation: "partly",
      })
    );

    expect(response.status).toBe(401);
    expect(mockSaveOutcomeFeedbackToDB).not.toHaveBeenCalled();
  });
});
