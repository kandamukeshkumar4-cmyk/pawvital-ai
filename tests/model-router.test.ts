describe("model-router registry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_QWEN_API_KEY;
    delete process.env.NVIDIA_DEEPSEEK_API_KEY;
    delete process.env.NVIDIA_GLM_API_KEY;
    delete process.env.NVIDIA_KIMI_API_KEY;
    delete process.env.HF_NARROW_MODEL_PACK_URL;
    delete process.env.HF_SIDECAR_API_KEY;
    delete process.env.NARROW_PACK_ENABLED;
    delete process.env.SECOND_OPINION_EXTRACTOR;
    delete process.env.GROK_FINAL_SAFETY;
    delete process.env.GROK_FINAL_REPORT;
    delete process.env.MODEL_ROUTER_VERSION;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("defaults router version and feature flags to closed modes", async () => {
    const router = await import("@/lib/model-router");

    expect(router.getModelRouterVersion(undefined)).toBe("v1");
    expect(router.getSecondOpinionExtractorMode(undefined)).toBe("off");
    expect(router.getGrokFinalSafetyMode(undefined)).toBe("off");
    expect(router.getGrokFinalReportMode(undefined)).toBe("off");
    expect(router.MODEL_FALLBACK_REASONS).toEqual([
      "budget_exceeded",
      "timeout",
      "provider_error",
      "malformed_json",
      "feature_disabled",
      "circuit_open",
    ]);
  });

  it("centralizes primary model ids, fallbacks, and timeout defaults", async () => {
    const router = await import("@/lib/model-router");

    expect(router.getModelRoute("extraction")).toMatchObject({
      primaryModel: "qwen/qwen3.5-122b-a10b",
      fallbackModel: "qwen/qwen3.5-397b-a17b",
      timeoutMs: 45000,
    });
    expect(router.getModelRoute("diagnosis")).toMatchObject({
      primaryModel: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      fallbackModel: "deepseek-ai/deepseek-v3.2",
      timeoutMs: 150000,
    });
    expect(router.getModelRoute("vision_deep")).toMatchObject({
      primaryModel: "moonshotai/kimi-k2.5",
      fallbackModel: null,
      timeoutMs: 45000,
    });
    expect(router.getFeatureModelRoute("grok_final_safety")).toMatchObject({
      provider: "grok",
      fallbackModel: null,
      timeoutMs: 12000,
    });
  });

  it("prefers role-specific NVIDIA keys and narrow-pack provider order when configured", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-shared";
    process.env.NVIDIA_QWEN_API_KEY = "nvapi-qwen";
    process.env.HF_NARROW_MODEL_PACK_URL = "https://narrow-pack.example/v1";
    process.env.HF_SIDECAR_API_KEY = "sidecar-secret";
    process.env.NARROW_PACK_ENABLED = "true";

    const router = await import("@/lib/model-router");

    expect(router.resolveNvidiaApiKey("extraction")).toBe("nvapi-qwen");
    expect(router.getModelProviderChain("extraction")).toEqual([
      "narrow-pack",
      "nvidia",
    ]);
    expect(router.getModelProviderChain("vision_fast")).toEqual(["nvidia"]);
  });

  it("treats placeholder keys as unavailable and fails closed when no provider is configured", async () => {
    process.env.NVIDIA_API_KEY = "your_nvidia_nim_key_here";

    const router = await import("@/lib/model-router");

    expect(router.resolveNvidiaApiKey("diagnosis")).toBeNull();
    expect(router.getModelProviderChain("diagnosis")).toEqual([]);
    expect(router.isNvidiaConfigured()).toBe(false);
  });
});
