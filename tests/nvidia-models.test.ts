describe("nvidia-models configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_QWEN_API_KEY;
    delete process.env.NVIDIA_DEEPSEEK_API_KEY;
    delete process.env.NVIDIA_GLM_API_KEY;
    delete process.env.NVIDIA_KIMI_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("prefers role-specific keys over the shared NVIDIA key", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-shared";
    process.env.NVIDIA_QWEN_API_KEY = "nvapi-qwen";

    const models = await import("@/lib/nvidia-models");
    expect(models.resolveNvidiaApiKey("extraction")).toBe("nvapi-qwen");
  });

  it("uses NVIDIA_KIMI_API_KEY for vision_deep before the shared key", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-shared";
    process.env.NVIDIA_KIMI_API_KEY = "nvapi-kimi";

    const models = await import("@/lib/nvidia-models");
    expect(models.resolveNvidiaApiKey("vision_deep")).toBe("nvapi-kimi");
  });

  it("falls back to the shared NVIDIA key when role keys are unset", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-shared";

    const models = await import("@/lib/nvidia-models");
    expect(models.resolveNvidiaApiKey("diagnosis")).toBe("nvapi-shared");
    expect(models.resolveNvidiaApiKey("vision_fast")).toBe("nvapi-shared");
  });

  it("treats placeholder values as unavailable", async () => {
    process.env.NVIDIA_API_KEY =
      "nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY";

    const models = await import("@/lib/nvidia-models");
    expect(models.isLikelyPlaceholderKey(process.env.NVIDIA_API_KEY)).toBe(true);
    expect(models.resolveNvidiaApiKey("diagnosis")).toBeNull();
    expect(models.isNvidiaConfigured()).toBe(false);
  });

  it("reports the stack configured when a shared NVIDIA key covers all core roles", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-shared";

    const models = await import("@/lib/nvidia-models");
    expect(models.isNvidiaConfigured()).toBe(true);
  });
});