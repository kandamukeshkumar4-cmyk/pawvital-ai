const mockBuildSidecarReadinessSnapshot = jest.fn();

jest.mock("@/lib/sidecar-readiness", () => ({
  buildSidecarReadinessSnapshot: (...args: unknown[]) =>
    mockBuildSidecarReadinessSnapshot(...args),
}));

function makeRequest(
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  headers?: Record<string, string>
) {
  return new Request("http://localhost/api/ai/sidecar-readiness", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("sidecar-readiness route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HF_SIDECAR_API_KEY: "sidecar-secret",
    };

    mockBuildSidecarReadinessSnapshot.mockResolvedValue({
      generatedAt: "2026-03-28T12:00:00.000Z",
      configuredCount: 3,
      validCount: 3,
      misconfiguredCount: 0,
      unconfiguredCount: 2,
      healthyCount: 2,
      stubCount: 1,
      unhealthyCount: 0,
      unreachableCount: 0,
      configs: [],
      health: [],
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("rejects unauthorized GET requests", async () => {
    const { GET } = await import("@/app/api/ai/sidecar-readiness/route");
    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(401);
  });

  it("returns readiness for authorized GET requests", async () => {
    const { GET } = await import("@/app/api/ai/sidecar-readiness/route");
    const response = await GET(
      makeRequest("GET", undefined, { Authorization: "Bearer sidecar-secret" })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockBuildSidecarReadinessSnapshot).toHaveBeenCalledWith();
  });

  it("passes session context through POST requests", async () => {
    const session = { known_symptoms: ["wound_skin_issue"] };
    const { POST } = await import("@/app/api/ai/sidecar-readiness/route");
    const response = await POST(
      makeRequest(
        "POST",
        { session },
        { "x-sidecar-readiness-secret": "sidecar-secret" }
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockBuildSidecarReadinessSnapshot).toHaveBeenCalledWith({
      session,
    });
  });
});
