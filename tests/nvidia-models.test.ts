const mockCreate = jest.fn();
const mockOpenAI = jest.fn().mockImplementation(
  ({ baseURL, apiKey }: { baseURL: string; apiKey: string }) => ({
    chat: {
      completions: {
        create: (request: unknown, options: unknown) =>
          mockCreate({ baseURL, apiKey, request, options }),
      },
    },
  })
);

jest.mock("openai", () => ({
  __esModule: true,
  default: mockOpenAI,
}));

describe("nvidia-models configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockCreate.mockReset();
    mockOpenAI.mockClear();
    process.env = { ...originalEnv };
    delete process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_QWEN_API_KEY;
    delete process.env.NVIDIA_DEEPSEEK_API_KEY;
    delete process.env.NVIDIA_GLM_API_KEY;
    delete process.env.NVIDIA_KIMI_API_KEY;
    delete process.env.HF_NARROW_MODEL_PACK_URL;
    delete process.env.HF_SIDECAR_API_KEY;
    delete process.env.NARROW_PACK_ENABLED;
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

  it("treats the RunPod narrow pack as a valid core text backend", async () => {
    process.env.HF_NARROW_MODEL_PACK_URL = "https://narrow-pack.example/v1";
    process.env.HF_SIDECAR_API_KEY = "sidecar-secret";
    process.env.NARROW_PACK_ENABLED = "true";

    const models = await import("@/lib/nvidia-models");
    expect(models.isNarrowPackConfigured()).toBe(true);
    expect(models.getModelProviderChain("diagnosis")).toEqual(["narrow-pack"]);
    expect(models.isVisionPipelineConfigured()).toBe(false);
    expect(models.isNvidiaConfigured()).toBe(true);
  });

  it("prefers the narrow pack but keeps NVIDIA as a runtime fallback when both are configured", async () => {
    process.env.HF_NARROW_MODEL_PACK_URL = "https://narrow-pack.example/v1";
    process.env.HF_SIDECAR_API_KEY = "sidecar-secret";
    process.env.NARROW_PACK_ENABLED = "true";
    process.env.NVIDIA_API_KEY = "nvapi-shared";

    const models = await import("@/lib/nvidia-models");
    expect(models.getModelProviderChain("extraction")).toEqual([
      "narrow-pack",
      "nvidia",
    ]);
  });

  it("falls back from the narrow pack to NVIDIA when the RunPod call fails", async () => {
    process.env.HF_NARROW_MODEL_PACK_URL = "https://narrow-pack.example/v1";
    process.env.HF_SIDECAR_API_KEY = "sidecar-secret";
    process.env.NARROW_PACK_ENABLED = "true";
    process.env.NVIDIA_API_KEY = "nvapi-shared";
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockCreate
      .mockRejectedValueOnce(new Error("runpod unavailable"))
      .mockResolvedValueOnce({
        choices: [{ message: { content: "fallback response" } }],
      });

    const models = await import("@/lib/nvidia-models");
    const response = await models.complete({
      role: "extraction",
      prompt: "extract this",
      temperature: 0.1,
    });

    expect(response).toBe("fallback response");
    expect(mockCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        baseURL: "https://narrow-pack.example/v1",
        apiKey: "sidecar-secret",
        request: expect.objectContaining({
          model: "qwen/qwen3.5-122b-a10b",
        }),
      })
    );
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        baseURL: "https://integrate.api.nvidia.com/v1",
        apiKey: "nvapi-shared",
        request: expect.objectContaining({
          model: "qwen/qwen3.5-122b-a10b",
        }),
      })
    );

    consoleErrorSpy.mockRestore();
  });
});
