import {
  deleteTriageJob,
  getTriageJobInput,
  getTriageJobResult,
  putTriageJobInput,
  putTriageJobResult,
  type SymptomChatTurnInput,
  type SymptomChatTurnResult,
  type TriageJobStoreOptions,
} from "@/lib/symptom-chat/async-turn-store";
import {
  isSymptomChatTurnJobRef,
  SYMPTOM_CHAT_TURN_JOB_TYPE,
  toServiceBusJobPayload,
  type SymptomChatTurnJobRef,
} from "@/lib/symptom-chat/async-turn-contract";
import { hasUnsafeServiceBusPayload } from "@/lib/azure/service-bus";
import type { PetProfile } from "@/lib/triage-engine";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function makeBlobStore() {
  const store = new Map<string, Buffer>();
  const factory = () => ({
    getContainerClient(container: string) {
      return {
        getBlockBlobClient(blobName: string) {
          const key = `${container}/${blobName}`;
          return {
            async uploadData(body: Buffer) {
              store.set(key, body);
              return { etag: "etag" };
            },
            async downloadToBuffer() {
              const value = store.get(key);
              if (!value) {
                const error = new Error("BlobNotFound") as Error & {
                  statusCode?: number;
                };
                error.statusCode = 404;
                throw error;
              }
              return value;
            },
            async deleteIfExists() {
              return { succeeded: store.delete(key) };
            },
          };
        },
      };
    },
  });

  const options: TriageJobStoreOptions = {
    env: { AZURE_SECRET_AZURE_STORAGE_CONNECTION_STRING: "conn" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blobServiceClientFactory: factory as any,
  };
  return { store, options };
}

function sampleInput(): SymptomChatTurnInput {
  return {
    action: "chat",
    createdAt: "2026-06-16T00:00:00.000Z",
    jobId: JOB_ID,
    messages: [{ content: "my dog is limping", role: "user" }],
    pet: { name: "Rex", species: "dog" } as unknown as PetProfile,
    sessionId: SESSION_ID,
    userId: "user_123",
  };
}

describe("async symptom-chat turn store", () => {
  it("round-trips the turn input through blob storage", async () => {
    const { options } = makeBlobStore();
    const input = sampleInput();

    expect(await putTriageJobInput(input, options)).toBe(true);
    expect(await getTriageJobInput(JOB_ID, options)).toEqual(input);
  });

  it("round-trips the turn result", async () => {
    const { options } = makeBlobStore();
    const result: SymptomChatTurnResult = {
      action: "chat",
      body: { reply: "How long has Rex been limping?" },
      completedAt: "2026-06-16T00:00:05.000Z",
      jobId: JOB_ID,
      sessionId: SESSION_ID,
      status: "response_ready",
      userId: "user_123",
    };

    expect(await putTriageJobResult(result, options)).toBe(true);
    expect(await getTriageJobResult(JOB_ID, options)).toEqual(result);
  });

  it("returns null for a job that has not produced a result yet", async () => {
    const { options } = makeBlobStore();
    expect(await getTriageJobResult(JOB_ID, options)).toBeNull();
  });

  it("deletes both blobs on cleanup", async () => {
    const { store, options } = makeBlobStore();
    await putTriageJobInput(sampleInput(), options);
    await putTriageJobResult(
      {
        action: "chat",
        completedAt: "2026-06-16T00:00:05.000Z",
        jobId: JOB_ID,
        sessionId: SESSION_ID,
        status: "response_ready",
        userId: "user_123",
      },
      options
    );
    expect(store.size).toBe(2);

    await deleteTriageJob(JOB_ID, options);
    expect(store.size).toBe(0);
  });

  it("fails closed (no throw) when storage is not configured", async () => {
    expect(await putTriageJobInput(sampleInput())).toBe(false);
    expect(await getTriageJobInput(JOB_ID)).toBeNull();
  });
});

describe("async symptom-chat turn contract", () => {
  const validRef: SymptomChatTurnJobRef = {
    action: "chat",
    jobId: JOB_ID,
    sessionId: SESSION_ID,
    userId: "user_123",
  };

  it("accepts a well-formed job ref", () => {
    expect(isSymptomChatTurnJobRef(validRef)).toBe(true);
  });

  it("rejects refs with bad ids or actions", () => {
    expect(isSymptomChatTurnJobRef({ ...validRef, jobId: "nope" })).toBe(false);
    expect(
      isSymptomChatTurnJobRef({ ...validRef, action: "delete_everything" })
    ).toBe(false);
    expect(isSymptomChatTurnJobRef({ ...validRef, userId: "bad id!" })).toBe(
      false
    );
    expect(isSymptomChatTurnJobRef(null)).toBe(false);
  });

  it("produces a queue payload that survives the Service Bus PII guard", () => {
    const payload = toServiceBusJobPayload(validRef);
    expect(hasUnsafeServiceBusPayload(payload)).toBe(false);
    expect(SYMPTOM_CHAT_TURN_JOB_TYPE).toBe("symptom-chat-turn");
  });
});
