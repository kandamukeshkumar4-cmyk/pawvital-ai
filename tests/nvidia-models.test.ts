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
    process.env.NVIDIA_API_KEY = "your_nvidia_nim_key_here";

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

  it("honors a call-scoped provider priority for latency-sensitive extractors", async () => {
    process.env.HF_NARROW_MODEL_PACK_URL = "https://narrow-pack.example/v1";
    process.env.HF_SIDECAR_API_KEY = "sidecar-secret";
    process.env.NARROW_PACK_ENABLED = "true";
    process.env.NVIDIA_API_KEY = "nvapi-shared";

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "nvidia response" } }],
    });

    const models = await import("@/lib/nvidia-models");
    const response = await models.complete({
      role: "extraction",
      prompt: "extract this",
      providerPriority: ["nvidia", "narrow-pack"],
      temperature: 0,
    });

    expect(response).toBe("nvidia response");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        baseURL: "https://integrate.api.nvidia.com/v1",
        apiKey: "nvapi-shared",
        request: expect.objectContaining({
          model: "qwen/qwen3.5-122b-a10b",
        }),
      })
    );
  });

  it("honors a call-scoped timeout cap below the role default", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-shared";

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "bounded response" } }],
    });

    const models = await import("@/lib/nvidia-models");
    const response = await models.complete({
      role: "extraction",
      prompt: "extract this",
      timeoutMs: 1234,
    });

    expect(response).toBe("bounded response");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          timeout: 1234,
        }),
      })
    );
  });

  it("does not continue provider fallbacks after a timed-out call aborts", async () => {
    jest.useFakeTimers();
    process.env.HF_NARROW_MODEL_PACK_URL = "https://narrow-pack.example/v1";
    process.env.HF_SIDECAR_API_KEY = "sidecar-secret";
    process.env.NARROW_PACK_ENABLED = "true";
    process.env.NVIDIA_API_KEY = "nvapi-shared";
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockCreate.mockImplementation(
      ({ options }: { options: { signal: AbortSignal } }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    );

    try {
      const models = await import("@/lib/nvidia-models");
      const responsePromise = models.complete({
        role: "extraction",
        prompt: "extract this",
        timeoutMs: 25,
      });
      const rejection = responsePromise.catch((error: unknown) => error);

      await jest.advanceTimersByTimeAsync(25);

      await expect(rejection).resolves.toMatchObject({
        message: "aborted",
        name: "AbortError",
      });
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://narrow-pack.example/v1",
          options: expect.objectContaining({ timeout: 25 }),
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("expires queued role-concurrency waiters before starting provider calls", async () => {
    jest.useFakeTimers();
    process.env.NVIDIA_API_KEY = "nvapi-shared";
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let resolveFirst: ((value: unknown) => void) | undefined;

    mockCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );

    try {
      const models = await import("@/lib/nvidia-models");
      const firstPromise = models.complete({
        role: "diagnosis",
        prompt: "first report",
        timeoutMs: 5_000,
      });
      await Promise.resolve();
      expect(mockCreate).toHaveBeenCalledTimes(1);

      const secondPromise = models
        .complete({
          role: "diagnosis",
          prompt: "second report",
          timeoutMs: 25,
        })
        .catch((error: unknown) => error);
      await Promise.resolve();
      expect(mockCreate).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(25);

      await expect(secondPromise).resolves.toMatchObject({
        message: expect.stringContaining("concurrency slot"),
        name: "AbortError",
      });
      expect(mockCreate).toHaveBeenCalledTimes(1);

      resolveFirst?.({
        choices: [{ message: { content: "first response" } }],
      });
      await expect(firstPromise).resolves.toBe("first response");
    } finally {
      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("can disable provider and model fallbacks for latency-sensitive phrasing", async () => {
    process.env.HF_NARROW_MODEL_PACK_URL = "https://narrow-pack.example/v1";
    process.env.HF_SIDECAR_API_KEY = "sidecar-secret";
    process.env.NARROW_PACK_ENABLED = "true";
    process.env.NVIDIA_API_KEY = "nvapi-shared";
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockCreate.mockRejectedValueOnce(new Error("primary phrasing failed"));

    try {
      const models = await import("@/lib/nvidia-models");

      await expect(
        models.phraseWithLlama("phrase this", { allowFallbacks: false })
      ).rejects.toThrow("primary phrasing failed");

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://narrow-pack.example/v1",
          request: expect.objectContaining({
            model: "meta/llama-3.3-70b-instruct",
          }),
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("caps detailed vision tier timeout to the shared pipeline deadline", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-shared";

    mockCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                wound_present: true,
                severity_classification: "needs_review",
                urgency: "vet_soon",
                confidence: 0.7,
                wound_type: "laceration",
                discharge: "none",
                swelling: "none",
                tissue_visible: false,
                red_flags: [],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                estimated_severity: "mild",
                healing_status: "healing_well",
                infection_indicators: [],
                red_flags_detected: [],
                consistent_with: ["abrasion"],
              }),
            },
          },
        ],
      });

    const models = await import("@/lib/nvidia-models");
    await models.runVisionPipeline(
      "fake-base64",
      "left leg wound",
      { breed: "Mixed", age_years: 5, weight: 42 },
      { deadlineAtMs: Date.now() + 1_234 }
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        request: expect.objectContaining({
          model: "meta/llama-3.2-90b-vision-instruct",
        }),
        options: expect.objectContaining({
          timeout: expect.any(Number),
        }),
      })
    );
    const detailedCall = mockCreate.mock.calls[1]?.[0] as {
      options: { timeout: number };
    };
    expect(detailedCall.options.timeout).toBeGreaterThan(0);
    expect(detailedCall.options.timeout).toBeLessThanOrEqual(1_234);
  });
});
