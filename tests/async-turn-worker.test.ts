import {
  createSymptomChatTurnHandler,
  processSymptomChatTurnJob,
} from "@/lib/symptom-chat/async-turn-worker";
import {
  getTriageJobResult,
  putTriageJobInput,
  type SymptomChatTurnInput,
  type TriageJobStoreOptions,
} from "@/lib/symptom-chat/async-turn-store";
import type {
  SymptomChatTurnAction,
  SymptomChatTurnJobRef,
} from "@/lib/symptom-chat/async-turn-contract";
import type { PetProfile } from "@/lib/triage-engine";

const JOB_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "user_async";

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
                throw new Error("BlobNotFound");
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
  return { options, store };
}

function inputFor(action: SymptomChatTurnAction): SymptomChatTurnInput {
  return {
    action,
    createdAt: "2026-06-16T00:00:00.000Z",
    jobId: JOB_ID,
    messages: [{ content: "my dog is limping", role: "user" }],
    pet: { name: "Rex", species: "dog" } as unknown as PetProfile,
    sessionId: SESSION_ID,
    userId: USER_ID,
  };
}

function refFor(action: SymptomChatTurnAction): SymptomChatTurnJobRef {
  return { action, jobId: JOB_ID, sessionId: SESSION_ID, userId: USER_ID };
}

describe("processSymptomChatTurnJob", () => {
  it("replays a chat turn through the route and stores response_ready", async () => {
    const { options } = makeBlobStore();
    await putTriageJobInput(inputFor("chat"), options);

    let seenBody: unknown;
    const routePost = jest.fn(async (request: Request) => {
      seenBody = await request.json();
      return new Response(JSON.stringify({ message: "How long?", type: "question" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    const result = await processSymptomChatTurnJob(refFor("chat"), {
      routePost,
      storeOptions: options,
    });

    expect(result.status).toBe("response_ready");
    expect(result.userId).toBe(USER_ID);
    expect(result.body).toEqual({ message: "How long?", type: "question" });
    // The worker replayed the stored turn input verbatim.
    expect(seenBody).toMatchObject({
      action: "chat",
      messages: [{ content: "my dog is limping", role: "user" }],
    });

    const stored = await getTriageJobResult(JOB_ID, options);
    expect(stored?.status).toBe("response_ready");
  });

  it("maps generate_report turns to report_ready", async () => {
    const { options } = makeBlobStore();
    await putTriageJobInput(inputFor("generate_report"), options);

    const routePost = jest.fn(
      async () =>
        new Response(JSON.stringify({ type: "report" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        })
    );

    const result = await processSymptomChatTurnJob(refFor("generate_report"), {
      routePost,
      storeOptions: options,
    });
    expect(result.status).toBe("report_ready");
  });

  it("fails when the stored input is missing", async () => {
    const { options } = makeBlobStore();
    const routePost = jest.fn();

    const result = await processSymptomChatTurnJob(refFor("chat"), {
      routePost,
      storeOptions: options,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("input_missing");
    expect(routePost).not.toHaveBeenCalled();
  });

  it("fails when the replayed route returns a non-2xx response", async () => {
    const { options } = makeBlobStore();
    await putTriageJobInput(inputFor("chat"), options);

    const routePost = jest.fn(
      async () => new Response("{}", { status: 500 })
    );

    const result = await processSymptomChatTurnJob(refFor("chat"), {
      routePost,
      storeOptions: options,
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBe("turn_failed");
  });
});

describe("createSymptomChatTurnHandler", () => {
  it("ignores job types it does not own", async () => {
    const handler = createSymptomChatTurnHandler();
    await expect(
      handler({
        messageId: "m1",
        payload: { foo: "bar" },
        type: "async-review",
      })
    ).resolves.toBeUndefined();
  });

  it("throws on a malformed symptom-chat-turn payload", async () => {
    const handler = createSymptomChatTurnHandler();
    await expect(
      handler({
        messageId: "m2",
        payload: { jobId: "not-a-uuid" },
        type: "symptom-chat-turn",
      })
    ).rejects.toThrow();
  });
});
