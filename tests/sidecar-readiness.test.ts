describe("sidecar readiness helpers", () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HF_VISION_PREPROCESS_URL: "http://localhost:8080/infer",
      HF_TEXT_RETRIEVAL_URL: "http://localhost:8081/search",
    };
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("summarizes configured and misconfigured sidecar URLs", async () => {
    process.env.HF_IMAGE_RETRIEVAL_URL = "not-a-url";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          service: "vision-preprocess-service",
          mode: "live",
          model: "florence-2",
        }),
    });

    const readiness = await import("@/lib/sidecar-readiness");
    const snapshot = await readiness.buildSidecarReadinessSnapshot();

    expect(snapshot.configuredCount).toBe(3);
    expect(snapshot.validCount).toBe(2);
    expect(snapshot.misconfiguredCount).toBe(1);
    expect(snapshot.unconfiguredCount).toBeGreaterThan(0);
    expect(snapshot.health.find((item) => item.service === "vision-preprocess-service")?.status).toBe("healthy");
    expect(snapshot.health.find((item) => item.service === "image-retrieval-service")?.status).toBe("misconfigured");
  });

  it("preserves warming sidecars without counting them as healthy", async () => {
    process.env = {
      ...originalEnv,
      HF_TEXT_RETRIEVAL_URL: "http://localhost:8081/search",
    };

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          service: "text-retrieval-service",
          mode: "warming",
          model: "bge-m3",
        }),
    });

    const readiness = await import("@/lib/sidecar-readiness");
    const snapshot = await readiness.buildSidecarReadinessSnapshot();

    expect(snapshot.healthyCount).toBe(0);
    expect(snapshot.warmingCount).toBe(1);
    expect(
      snapshot.health.find((item) => item.service === "text-retrieval-service")
    ).toMatchObject({
      status: "warming",
      detail:
        "Model is warming in the background and is not ready for live baseline traffic yet.",
    });
  });
});
