describe("HF sidecar deadline overrides", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HF_TEXT_RETRIEVAL_URL: "https://sidecar.example/text",
      HF_SIDECAR_API_KEY: "sidecar-key",
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it("does not retry sidecar calls when a route-scoped timeout override aborts", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_input, init) => {
      const signal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as typeof fetch;

    const { retrieveVeterinaryTextEvidenceFromSidecar } = await import(
      "@/lib/hf-sidecars"
    );
    const retrievalPromise = retrieveVeterinaryTextEvidenceFromSidecar({
      query: "limping dog",
      domain: "skin_wound",
      timeoutMs: 25,
    }).catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(25);

    await expect(retrievalPromise).resolves.toMatchObject({
      name: "AbortError",
      message: "aborted",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
