const mockSubmitAsyncReviewToSidecar = jest.fn();
const mockIsAsyncReviewServiceConfigured = jest.fn();

jest.mock("@/lib/hf-sidecars", () => ({
  submitAsyncReviewToSidecar: (...args: unknown[]) =>
    mockSubmitAsyncReviewToSidecar(...args),
  isAsyncReviewServiceConfigured: (...args: unknown[]) =>
    mockIsAsyncReviewServiceConfigured(...args),
}));

const PET = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
};

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ai/async-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("async-review route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockIsAsyncReviewServiceConfigured.mockReturnValue(true);
    mockSubmitAsyncReviewToSidecar.mockResolvedValue({
      ok: true,
      caseId: "case-123",
      status: "queued",
      message: "queued",
    });
  });

  it("queues an async multimodal review with the session evidence", async () => {
    const session = {
      extracted_answers: { wound_location: "left hind leg" },
      latest_image_domain: "skin_wound",
      latest_image_body_region: "left hind leg",
      latest_image_quality: "good",
      latest_preprocess: {
        domain: "skin_wound",
        bodyRegion: "left hind leg",
        detectedRegions: [],
        bestCrop: null,
        imageQuality: "good",
        confidence: 0.88,
        limitations: [],
      },
      latest_visual_evidence: {
        contradictions: ["owner says eye issue but image looks cutaneous"],
      },
      case_memory: {
        latest_owner_turn: "Please do a deeper review of this lesion.",
      },
      vision_analysis: "Left hind limb lesion with moist inflammation.",
      vision_severity: "needs_review",
    };

    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(
      makeRequest({
        image: "data:image/jpeg;base64,ZmFrZQ==",
        pet: PET,
        session,
        report: { explanation: "Initial report" },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.queued).toBe(true);
    expect(mockSubmitAsyncReviewToSidecar).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerText: "Please do a deeper review of this lesion.",
        deterministicFacts: { wound_location: "left hind leg" },
      })
    );
  });

  it("returns 503 when the async review sidecar is unavailable", async () => {
    mockIsAsyncReviewServiceConfigured.mockReturnValue(false);

    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(
      makeRequest({
        image: "data:image/jpeg;base64,ZmFrZQ==",
        pet: PET,
        session: {},
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toContain("not configured");
  });

  it("rejects missing image payloads", async () => {
    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(makeRequest({ pet: PET, session: {} }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("required");
  });
});
