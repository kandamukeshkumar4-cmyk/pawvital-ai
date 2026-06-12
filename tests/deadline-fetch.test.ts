import {
  fetchWithDeadline,
  resolveDeadlineTimeoutMs,
} from "@/lib/deadline-fetch";

describe("deadline fetch helper", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it("caps request timeouts to an absolute deadline", () => {
    expect(
      resolveDeadlineTimeoutMs(
        {
          deadlineAtMs: 11_000,
          timeoutMs: 5_000,
        },
        8_000,
        10_000
      )
    ).toBe(1_000);
  });

  it("aborts the underlying fetch when the timeout expires", async () => {
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

    const responsePromise = fetchWithDeadline(
      "https://example.test",
      { method: "POST" },
      { timeoutMs: 25 },
      1_000,
      "test fetch"
    ).catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(25);

    await expect(responsePromise).resolves.toMatchObject({
      name: "AbortError",
      message: "aborted",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
