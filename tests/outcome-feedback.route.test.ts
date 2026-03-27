const mockSaveOutcomeFeedbackToDB = jest.fn();

jest.mock("@/lib/report-storage", () => ({
  saveOutcomeFeedbackToDB: (...args: unknown[]) =>
    mockSaveOutcomeFeedbackToDB(...args),
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
    mockSaveOutcomeFeedbackToDB.mockResolvedValue(true);
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
    expect(mockSaveOutcomeFeedbackToDB).toHaveBeenCalledWith(
      expect.objectContaining({
        symptomCheckId: "abc123",
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
