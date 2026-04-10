const mockEmitTelemetryLog = jest.fn();

jest.mock("@/lib/symptom-memory", () => {
  const actual = jest.requireActual("@/lib/symptom-memory");
  return {
    ...actual,
    emitTelemetryLog: (...args: unknown[]) => mockEmitTelemetryLog(...args),
  };
});

describe("sidecar observability", () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HF_SIDECAR_API_KEY: "test-key",
      HF_VISION_PREPROCESS_URL: "http://localhost:8080/infer",
      HF_TEXT_RETRIEVAL_URL: "http://localhost:8081/search",
      HF_IMAGE_RETRIEVAL_URL: "http://localhost:8082/search",
      HF_MULTIMODAL_CONSULT_URL: "http://localhost:8083/consult",
      HF_ASYNC_REVIEW_URL: "http://localhost:8084/review",
    };
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("categorizes AbortError failures as timeout", async () => {
    const abortError = new Error("request timeout");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.preprocessVeterinaryImageWithResult({
      image: "data:image/jpeg;base64,ZmFrZQ==",
      ownerText: "Please help",
      knownSymptoms: ["wound_skin_issue"],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        category: "timeout",
        service: "vision-preprocess-service",
      })
    );
  });

  it("categorizes connection refused failures", async () => {
    const connectionError = new Error("fetch failed");
    Object.assign(connectionError, {
      cause: { code: "ECONNREFUSED" },
    });
    fetchMock.mockRejectedValue(connectionError);

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.preprocessVeterinaryImageWithResult({
      image: "data:image/jpeg;base64,ZmFrZQ==",
      ownerText: "Please help",
      knownSymptoms: ["wound_skin_issue"],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        category: "connection_refused",
        service: "vision-preprocess-service",
      })
    );
  });

  it("categorizes HTTP 500 failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server blew up",
    });

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.preprocessVeterinaryImageWithResult({
      image: "data:image/jpeg;base64,ZmFrZQ==",
      ownerText: "Please help",
      knownSymptoms: ["wound_skin_issue"],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        category: "http_error",
        service: "vision-preprocess-service",
      })
    );
    expect(result.ok ? "" : result.error).toContain("500");
  });

  it("categorizes invalid JSON as parse_error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "{invalid-json",
    });

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.preprocessVeterinaryImageWithResult({
      image: "data:image/jpeg;base64,ZmFrZQ==",
      ownerText: "Please help",
      knownSymptoms: ["wound_skin_issue"],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        category: "parse_error",
        service: "vision-preprocess-service",
      })
    );
  });

  it("records latency on successful responses", async () => {
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1017);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          image_domain: "skin_wound",
          body_region: "left hind leg",
          detected_regions: [],
          best_crop: null,
          image_quality: "good",
          preprocess_confidence: 0.82,
          image_limitations: [],
        }),
    });

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.preprocessVeterinaryImageWithResult({
      image: "data:image/jpeg;base64,ZmFrZQ==",
      ownerText: "Please help",
      knownSymptoms: ["wound_skin_issue"],
    });

    nowSpy.mockRestore();

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        latencyMs: 17,
        service: "vision-preprocess-service",
      })
    );
  });

  it("records telemetry using the VET-705 sidecar pattern", async () => {
    const { recordSidecarCall } = await import("@/lib/sidecar-observability");

    recordSidecarCall({
      ok: false,
      service: "vision-preprocess-service",
      category: "timeout",
      latencyMs: 23,
      error: "timed out",
    });

    expect(mockEmitTelemetryLog).toHaveBeenCalledWith(
      "sidecar",
      expect.objectContaining({
        service: "vision-preprocess-service",
        ok: false,
        category: "timeout",
        latencyMs: 23,
        error: "timed out",
        timestamp: expect.any(String),
      })
    );
  });

  it("keeps the public helper backward-compatible by returning null on failure", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed"));

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.preprocessVeterinaryImage({
      image: "data:image/jpeg;base64,ZmFrZQ==",
      ownerText: "Please help",
      knownSymptoms: ["wound_skin_issue"],
    });

    expect(result).toBeNull();
  });

  it("returns the full SidecarCallResult from the WithResult helper", async () => {
    const connectionError = new Error("fetch failed");
    Object.assign(connectionError, {
      cause: { code: "ECONNREFUSED" },
    });
    fetchMock.mockRejectedValue(connectionError);

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.preprocessVeterinaryImageWithResult({
      image: "data:image/jpeg;base64,ZmFrZQ==",
      ownerText: "Please help",
      knownSymptoms: ["wound_skin_issue"],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        category: "connection_refused",
        latencyMs: expect.any(Number),
        service: "vision-preprocess-service",
      })
    );
  });
});

describe("readiness aggregation", () => {
  it("marks mixed healthy/stub/down readiness as degraded", async () => {
    const { aggregateReadiness } = await import("@/lib/sidecar-readiness");

    const aggregation = aggregateReadiness(
      [
        {
          service: "vision-preprocess-service",
          status: "healthy",
          statusCode: 200,
          mode: "live",
          model: "florence-2",
          version: "1.0.0",
          latencyMs: 12,
          timedOut: false,
          detail: null,
        },
        {
          service: "text-retrieval-service",
          status: "healthy",
          statusCode: 200,
          mode: "live",
          model: "bge",
          version: "1.0.0",
          latencyMs: 13,
          timedOut: false,
          detail: null,
        },
        {
          service: "image-retrieval-service",
          status: "healthy",
          statusCode: 200,
          mode: "live",
          model: "clip",
          version: "1.0.0",
          latencyMs: 14,
          timedOut: false,
          detail: null,
        },
        {
          service: "multimodal-consult-service",
          status: "stub",
          statusCode: 200,
          mode: "stub",
          model: "qwen",
          version: "1.0.0",
          latencyMs: 15,
          timedOut: false,
          detail: null,
        },
        {
          service: "async-review-service",
          status: "unreachable",
          statusCode: null,
          mode: null,
          model: null,
          version: null,
          latencyMs: 0,
          timedOut: false,
          detail: "connection refused",
        },
      ],
      "2026-04-09T12:00:00.000Z"
    );

    expect(aggregation.summary).toBe("degraded");
    expect(aggregation.healthy).toHaveLength(3);
    expect(aggregation.stub).toEqual(["multimodal-consult-service"]);
    expect(aggregation.down).toEqual(["async-review-service"]);
  });

  it("marks all-down readiness as offline", async () => {
    const { aggregateReadiness } = await import("@/lib/sidecar-readiness");

    const aggregation = aggregateReadiness(
      [
        {
          service: "vision-preprocess-service",
          status: "unreachable",
          statusCode: null,
          mode: null,
          model: null,
          version: null,
          latencyMs: 0,
          timedOut: true,
          detail: "timeout",
        },
        {
          service: "text-retrieval-service",
          status: "misconfigured",
          statusCode: null,
          mode: null,
          model: null,
          version: null,
          latencyMs: 0,
          timedOut: false,
          detail: "bad url",
        },
        {
          service: "image-retrieval-service",
          status: "unconfigured",
          statusCode: null,
          mode: null,
          model: null,
          version: null,
          latencyMs: 0,
          timedOut: false,
          detail: "missing",
        },
        {
          service: "multimodal-consult-service",
          status: "unhealthy",
          statusCode: 503,
          mode: null,
          model: null,
          version: null,
          latencyMs: 7,
          timedOut: false,
          detail: "503",
        },
        {
          service: "async-review-service",
          status: "unreachable",
          statusCode: null,
          mode: null,
          model: null,
          version: null,
          latencyMs: 0,
          timedOut: false,
          detail: "refused",
        },
      ],
      "2026-04-09T12:00:00.000Z"
    );

    expect(aggregation.summary).toBe("offline");
    expect(aggregation.healthy).toEqual([]);
    expect(aggregation.stub).toEqual([]);
    expect(aggregation.down).toHaveLength(5);
  });

  it("marks all-healthy readiness as all_healthy", async () => {
    const { aggregateReadiness } = await import("@/lib/sidecar-readiness");

    const aggregation = aggregateReadiness(
      [
        {
          service: "vision-preprocess-service",
          status: "healthy",
          statusCode: 200,
          mode: "live",
          model: "florence-2",
          version: "1.0.0",
          latencyMs: 10,
          timedOut: false,
          detail: null,
        },
        {
          service: "text-retrieval-service",
          status: "healthy",
          statusCode: 200,
          mode: "live",
          model: "bge",
          version: "1.0.0",
          latencyMs: 11,
          timedOut: false,
          detail: null,
        },
        {
          service: "image-retrieval-service",
          status: "healthy",
          statusCode: 200,
          mode: "live",
          model: "clip",
          version: "1.0.0",
          latencyMs: 12,
          timedOut: false,
          detail: null,
        },
        {
          service: "multimodal-consult-service",
          status: "healthy",
          statusCode: 200,
          mode: "live",
          model: "qwen",
          version: "1.0.0",
          latencyMs: 13,
          timedOut: false,
          detail: null,
        },
        {
          service: "async-review-service",
          status: "healthy",
          statusCode: 200,
          mode: "live",
          model: "qwen",
          version: "1.0.0",
          latencyMs: 14,
          timedOut: false,
          detail: null,
        },
      ],
      "2026-04-09T12:00:00.000Z"
    );

    expect(aggregation.summary).toBe("all_healthy");
    expect(aggregation.healthy).toHaveLength(5);
    expect(aggregation.down).toEqual([]);
  });
});

describe("readiness route shape", () => {
  const originalEnv = process.env;

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns the new dashboard-consumable readiness shape", async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      HF_SIDECAR_API_KEY: "sidecar-secret",
    };

    const mockBuildSidecarReadinessSnapshot = jest.fn().mockResolvedValue({
      aggregation: {
        services: [
          {
            name: "vision-preprocess-service",
            status: "healthy",
            latencyMs: 18,
            version: "1.0.0",
          },
        ],
        healthy: ["vision-preprocess-service"],
        stub: [],
        down: [],
        summary: "all_healthy",
        totalLatencyMs: 18,
        checkedAt: "2026-04-09T12:00:00.000Z",
      },
    });

    jest.doMock("@/lib/sidecar-readiness", () => ({
      buildSidecarReadinessSnapshot: (...args: unknown[]) =>
        mockBuildSidecarReadinessSnapshot(...args),
    }));

    const { GET } = await import("@/app/api/ai/sidecar-readiness/route");
    const response = await GET(
      new Request("http://localhost/api/ai/sidecar-readiness", {
        headers: { Authorization: "Bearer sidecar-secret" },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.readiness).toEqual(
      expect.objectContaining({
        services: expect.any(Array),
        healthy: expect.any(Array),
        stub: expect.any(Array),
        down: expect.any(Array),
        summary: "all_healthy",
        checkedAt: "2026-04-09T12:00:00.000Z",
      })
    );
  });
});
