const mockSaveOutcomeFeedbackToDB = jest.fn();
const mockCreateServerSupabaseClient = jest.fn();

jest.mock("@/lib/report-storage", () => ({
  saveOutcomeFeedbackToDB: (...args: unknown[]) =>
    mockSaveOutcomeFeedbackToDB(...args),
}));

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: (...args: unknown[]) =>
    mockCreateServerSupabaseClient(...args),
}));

const SYMPTOM_CHECK_ID = "4c7d2d59-2f43-49d3-bc5e-b64053439bb0";

function buildSupabaseMock(options?: {
  ownedCheck?: { id: string } | null;
  userId?: string | null;
}) {
  const ownedCheck =
    options && "ownedCheck" in options
      ? options.ownedCheck
      : { id: SYMPTOM_CHECK_ID };

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user:
            options?.userId === null
              ? null
              : { id: options?.userId ?? "user-1" },
        },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === "symptom_checks") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: ownedCheck,
            error: null,
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

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
    mockCreateServerSupabaseClient.mockResolvedValue(buildSupabaseMock());
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
        symptomCheckId: SYMPTOM_CHECK_ID,
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
        symptomCheckId: SYMPTOM_CHECK_ID,
        matchedExpectation: "partly",
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
});
