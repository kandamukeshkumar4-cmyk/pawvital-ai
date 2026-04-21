const mockSubmitAsyncReviewToSidecar = jest.fn();
const mockIsAsyncReviewServiceConfigured = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();

jest.mock("@/lib/hf-sidecars", () => ({
  submitAsyncReviewToSidecar: (...args: unknown[]) =>
    mockSubmitAsyncReviewToSidecar(...args),
  isAsyncReviewServiceConfigured: (...args: unknown[]) =>
    mockIsAsyncReviewServiceConfigured(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

const PET = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
};

const VALID_SECRET = "secret-123";
const VALID_IMAGE = "data:image/jpeg;base64,ZmFrZQ==";

function makeRequest(
  body: string | Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return new Request("http://localhost/api/ai/async-review", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("async-review route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ASYNC_REVIEW_WEBHOOK_SECRET;
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 30_000,
    });
    mockGetRateLimitId.mockReturnValue("ip:test");
    mockIsAsyncReviewServiceConfigured.mockReturnValue(true);
    mockSubmitAsyncReviewToSidecar.mockResolvedValue({
      ok: true,
      caseId: "case-123",
      status: "queued",
      message: "queued",
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("queues an async multimodal review when the request includes the valid webhook secret", async () => {
    process.env.NODE_ENV = "production";
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET = VALID_SECRET;

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
        image: VALID_IMAGE,
        pet: PET,
        session,
        report: { explanation: "Initial report" },
      }, {
        "x-async-review-secret": VALID_SECRET,
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

  it("returns 503 without leaking config details when the async review sidecar is unavailable", async () => {
    process.env.NODE_ENV = "production";
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET = VALID_SECRET;
    mockIsAsyncReviewServiceConfigured.mockReturnValue(false);

    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(
      makeRequest({
        image: VALID_IMAGE,
        pet: PET,
        session: {},
      }, {
        "x-async-review-secret": VALID_SECRET,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Async review is unavailable");
    expect(payload.error.toLowerCase()).not.toContain("configured");
    expect(payload.error.toLowerCase()).not.toContain("secret");
  });

  it("rejects missing image payloads", async () => {
    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(makeRequest({ pet: PET, session: {} }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("required");
  });

  it("blocks production requests when the webhook secret is missing", async () => {
    process.env.NODE_ENV = "production";

    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(
      makeRequest({
        image: VALID_IMAGE,
        pet: PET,
        session: {},
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Async review is unavailable");
    expect(payload.error.toLowerCase()).not.toContain("secret");
    expect(payload.error.toLowerCase()).not.toContain("config");
    expect(mockSubmitAsyncReviewToSidecar).not.toHaveBeenCalled();
  });

  it("rejects invalid async review secrets", async () => {
    process.env.NODE_ENV = "production";
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET = VALID_SECRET;

    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(
      makeRequest(
        {
          image: VALID_IMAGE,
          pet: PET,
          session: {},
        },
        { "x-async-review-secret": "wrong-secret" }
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Unauthorized");
    expect(mockSubmitAsyncReviewToSidecar).not.toHaveBeenCalled();
  });

  it("rejects requests whose declared payload size exceeds the cap", async () => {
    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(
      makeRequest(
        {
          image: VALID_IMAGE,
          pet: PET,
          session: {},
        },
        { "content-length": String(10 * 1024 * 1024 + 1) }
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error).toBe("Async review payload is too large");
    expect(mockSubmitAsyncReviewToSidecar).not.toHaveBeenCalled();
  });

  it("rejects oversized image payloads", async () => {
    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(
      makeRequest({
        image: "a".repeat(8 * 1024 * 1024 + 1),
        pet: PET,
        session: {},
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error).toBe("Async review image payload is too large");
    expect(mockSubmitAsyncReviewToSidecar).not.toHaveBeenCalled();
  });

  it("fails safely on invalid JSON bodies", async () => {
    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(makeRequest("{bad-json"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid request body");
    expect(mockSubmitAsyncReviewToSidecar).not.toHaveBeenCalled();
  });

  it("fails safely on malformed structured payloads", async () => {
    const { POST } = await import("@/app/api/ai/async-review/route");
    const response = await POST(
      makeRequest({
        image: 42,
        pet: PET,
        session: {},
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid request body");
    expect(mockSubmitAsyncReviewToSidecar).not.toHaveBeenCalled();
  });
});
