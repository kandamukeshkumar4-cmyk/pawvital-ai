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

describe("MiniMax memory compression deadlines", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MINIMAX_API_KEY: "minimax-key",
      MINIMAX_MEMORY_MODEL: "MiniMax-M2.7",
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("passes a timeout bounded by the shared turn deadline", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "compressed case summary" } }],
    });

    const { compressCaseMemoryWithMiniMax } = await import("@/lib/minimax");
    const deadlineAtMs = Date.now() + 1_234;

    const result = await compressCaseMemoryWithMiniMax("summarize this case", {
      deadlineAtMs,
    });

    expect(result).toEqual({
      summary: "compressed case summary",
      model: "MiniMax-M2.7",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0]?.[0] as {
      options: { timeout: number };
    };
    expect(call.options.timeout).toBeGreaterThan(0);
    expect(call.options.timeout).toBeLessThanOrEqual(1_234);
  });

  it("does not try additional model candidates after a deadline abort", async () => {
    jest.useFakeTimers();
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
      const { compressCaseMemoryWithMiniMax } = await import("@/lib/minimax");
      const compressionPromise = compressCaseMemoryWithMiniMax(
        "summarize this case",
        { deadlineAtMs: Date.now() + 25 }
      ).catch((error: unknown) => error);

      await jest.advanceTimersByTimeAsync(25);

      await expect(compressionPromise).resolves.toMatchObject({
        message: "aborted",
        name: "AbortError",
      });
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ timeout: 25 }),
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
