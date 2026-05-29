const mockRunServiceBusWorkerOnce = jest.fn();

jest.mock("@/lib/azure/service-bus-worker", () => ({
  runServiceBusWorkerOnce: () => mockRunServiceBusWorkerOnce(),
}));

function request(headers?: Record<string, string>) {
  return new Request("http://localhost/api/azure/service-bus/worker", {
    headers,
    method: "POST",
  });
}

describe("POST /api/azure/service-bus/worker", () => {
  const originalAsyncSecret = process.env.ASYNC_REVIEW_WEBHOOK_SECRET;
  const originalHfSecret = process.env.HF_SIDECAR_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.ASYNC_REVIEW_WEBHOOK_SECRET;
    delete process.env.HF_SIDECAR_API_KEY;
    mockRunServiceBusWorkerOnce.mockResolvedValue({
      ok: true,
      processed: false,
      reason: "no_messages",
    });
  });

  afterEach(() => {
    if (originalAsyncSecret === undefined) {
      delete process.env.ASYNC_REVIEW_WEBHOOK_SECRET;
    } else {
      process.env.ASYNC_REVIEW_WEBHOOK_SECRET = originalAsyncSecret;
    }
    if (originalHfSecret === undefined) {
      delete process.env.HF_SIDECAR_API_KEY;
    } else {
      process.env.HF_SIDECAR_API_KEY = originalHfSecret;
    }
  });

  it("requires the configured worker secret", async () => {
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET = "worker-secret";
    const { POST } = await import(
      "@/app/api/azure/service-bus/worker/route"
    );

    const response = await POST(
      request({ "x-service-bus-worker-secret": "wrong-secret" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Unauthorized" });
    expect(mockRunServiceBusWorkerOnce).not.toHaveBeenCalled();
  });

  it("runs one worker receive pass for an authorized request", async () => {
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET = "worker-secret";
    mockRunServiceBusWorkerOnce.mockResolvedValueOnce({
      jobType: "document-processing",
      messageId: "msg-1",
      ok: true,
      processed: true,
      queueName: "async-review",
    });
    const { POST } = await import(
      "@/app/api/azure/service-bus/worker/route"
    );

    const response = await POST(
      request({ authorization: "Bearer worker-secret" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toEqual({
      jobType: "document-processing",
      messageId: "msg-1",
      ok: true,
      processed: true,
      queueName: "async-review",
    });
    expect(mockRunServiceBusWorkerOnce).toHaveBeenCalledTimes(1);
  });

  it("maps invalid queue messages to a client-safe 400", async () => {
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET = "worker-secret";
    mockRunServiceBusWorkerOnce.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_message",
    });
    const { POST } = await import(
      "@/app/api/azure/service-bus/worker/route"
    );

    const response = await POST(
      request({ "x-service-bus-worker-secret": "worker-secret" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ ok: false, reason: "invalid_message" });
  });

  it("allows local/demo runs when no worker secret is configured", async () => {
    const { GET } = await import("@/app/api/azure/service-bus/worker/route");

    const response = await GET(
      new Request("http://localhost/api/azure/service-bus/worker"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      processed: false,
      reason: "no_messages",
    });
  });
});
