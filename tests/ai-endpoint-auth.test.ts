import { NextResponse } from "next/server";

const mockRequireAuthenticatedApiUser = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  symptomChatLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/nvidia-generation", () => ({
  generateNvidiaJson: jest.fn(),
  isNvidiaGenerationConfigured: jest.fn().mockReturnValue(true),
}));

describe("AI endpoint auth guards", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("ip:test");
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    });
  });

  it.each([
    "@/app/api/ai/symptom-check/route",
    "@/app/api/ai/health-score/route",
    "@/app/api/ai/supplements/route",
    "@/app/api/journal/summary/route",
  ])("returns 401 before expensive work for %s", async (modulePath) => {
    const { POST } = await import(modulePath);
    const response = await POST(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(401);
  });
});
