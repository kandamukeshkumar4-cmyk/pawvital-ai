import type { PetProfile, TriageSession } from "@/lib/triage-engine";

const PET = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
} satisfies PetProfile;

describe("async-review-client", () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env = { ...originalEnv };
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns false when the async review queue is not configured", async () => {
    const client = await import("@/lib/async-review-client");

    const result = await client.enqueueAsyncReview({
      baseUrl: "",
      image: "data:image/jpeg;base64,ZmFrZQ==",
      pet: PET,
      session: {} as TriageSession,
    });

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false in production when the async review secret is missing", async () => {
    process.env.NODE_ENV = "production";
    const client = await import("@/lib/async-review-client");

    const result = await client.enqueueAsyncReview({
      baseUrl: "https://queue.example.com/review/",
      image: "data:image/jpeg;base64,ZmFrZQ==",
      pet: PET,
      session: {} as TriageSession,
    });

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits async review payloads and returns true on success", async () => {
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET = "secret-123";
    fetchMock.mockResolvedValue({ ok: true });

    const client = await import("@/lib/async-review-client");
    const result = await client.enqueueAsyncReview({
      baseUrl: "https://queue.example.com/review/",
      image: "data:image/jpeg;base64,ZmFrZQ==",
      pet: PET,
      session: { answered_questions: ["which_leg"] } as TriageSession,
      report: { severity: "medium" },
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://queue.example.com/review/api/ai/async-review",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-async-review-secret": "secret-123",
        }),
      })
    );

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual(
      expect.objectContaining({
        image: "data:image/jpeg;base64,ZmFrZQ==",
        pet: PET,
        report: { severity: "medium" },
      })
    );
  });

  it("aborts hung async review submissions after the configured timeout", async () => {
    jest.useFakeTimers();
    process.env.ASYNC_REVIEW_TIMEOUT_MS = "25";

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortError = Object.assign(new Error("aborted"), {
            name: "AbortError",
          });
          reject(abortError);
        });
      });
    });

    try {
      const client = await import("@/lib/async-review-client");
      const promise = client.enqueueAsyncReview({
        baseUrl: "https://queue.example.com",
        image: "data:image/jpeg;base64,ZmFrZQ==",
        pet: PET,
        session: {} as TriageSession,
      });

      await jest.advanceTimersByTimeAsync(25);
      await expect(promise).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "[Async Review] Submission timeout after",
        25,
        "ms"
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
