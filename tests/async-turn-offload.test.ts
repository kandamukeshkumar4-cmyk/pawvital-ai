import {
  ASYNC_WORKER_REPLAY_HEADER,
  isAsyncWorkerReplay,
  maybeOffloadSymptomChatTurn,
} from "@/lib/symptom-chat/async-turn-offload";
import type { PetProfile } from "@/lib/triage-engine";

const SESSION_ID = "55555555-5555-4555-8555-555555555555";

function baseParams() {
  return {
    action: "chat" as const,
    messages: [{ content: "limping", role: "user" as const }],
    pet: { name: "Rex" } as unknown as PetProfile,
  };
}

describe("isAsyncWorkerReplay", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  function requestWith(headerValue?: string): Request {
    const headers = new Headers();
    if (headerValue !== undefined) {
      headers.set(ASYNC_WORKER_REPLAY_HEADER, headerValue);
    }
    return new Request("https://app.example/api/ai/symptom-chat", {
      headers,
      method: "POST",
    });
  }

  it("is false when no worker secret is configured", () => {
    process.env = { ...originalEnv };
    delete process.env.ASYNC_REVIEW_WEBHOOK_SECRET;
    delete process.env.HF_SIDECAR_API_KEY;
    expect(isAsyncWorkerReplay(requestWith("anything"))).toBe(false);
  });

  it("matches only when the header equals the configured secret", () => {
    process.env = { ...originalEnv, ASYNC_REVIEW_WEBHOOK_SECRET: "s3cr3t" };
    expect(isAsyncWorkerReplay(requestWith("s3cr3t"))).toBe(true);
    expect(isAsyncWorkerReplay(requestWith("wrong"))).toBe(false);
    expect(isAsyncWorkerReplay(requestWith(undefined))).toBe(false);
  });
});

describe("maybeOffloadSymptomChatTurn", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Offload is opt-in; enable it so the user/session/storage guards below are
    // genuinely exercised rather than short-circuited by the disabled default.
    process.env = { ...originalEnv, SYMPTOM_CHAT_ASYNC_OFFLOAD_ENABLED: "true" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("stays synchronous when async offload is not enabled (default)", async () => {
    process.env = { ...originalEnv };
    delete process.env.SYMPTOM_CHAT_ASYNC_OFFLOAD_ENABLED;
    const result = await maybeOffloadSymptomChatTurn({
      ...baseParams(),
      sessionId: SESSION_ID,
      userId: "user_1",
    });
    expect(result).toBeNull();
  });

  it("stays synchronous without a verified user", async () => {
    const result = await maybeOffloadSymptomChatTurn({
      ...baseParams(),
      sessionId: SESSION_ID,
      userId: null,
    });
    expect(result).toBeNull();
  });

  it("stays synchronous without a live session id", async () => {
    const result = await maybeOffloadSymptomChatTurn({
      ...baseParams(),
      sessionId: null,
      userId: "user_1",
    });
    expect(result).toBeNull();
  });

  it("stays synchronous when blob storage is not configured", async () => {
    // No storeOptions → getBlobClient returns null → putTriageJobInput false.
    const result = await maybeOffloadSymptomChatTurn({
      ...baseParams(),
      sessionId: SESSION_ID,
      userId: "user_1",
    });
    expect(result).toBeNull();
  });
});
