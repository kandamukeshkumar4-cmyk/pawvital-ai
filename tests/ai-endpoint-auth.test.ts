import { NextResponse } from "next/server";

const mockRequireAuthenticatedApiUser = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockGenerateNvidiaJson = jest.fn();
const mockIsNvidiaGenerationConfigured = jest.fn();

const generalApiLimiter = { scope: "general" };
const symptomChatLimiter = { scope: "symptom-chat" };

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter,
  symptomChatLimiter,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/nvidia-generation", () => ({
  generateNvidiaJson: (...args: unknown[]) => mockGenerateNvidiaJson(...args),
  isNvidiaGenerationConfigured: (...args: unknown[]) =>
    mockIsNvidiaGenerationConfigured(...args),
}));

type RouteCase = {
  label: string;
  modulePath: string;
  limiter: object;
  validBody: Record<string, unknown>;
  invalidBody: Record<string, unknown>;
};

const ROUTES: RouteCase[] = [
  {
    label: "symptom-check",
    modulePath: "@/app/api/ai/symptom-check/route",
    limiter: symptomChatLimiter,
    validBody: {
      symptoms: "vomiting and refusing dinner",
      pet: {
        name: "Bruno",
        species: "dog",
        breed: "Golden Retriever",
        age_years: 5,
        weight: 72,
        existing_conditions: ["arthritis"],
        medications: ["carprofen"],
        vaccination_status: "current",
      },
    },
    invalidBody: {
      pet: {
        name: "Bruno",
      },
    },
  },
  {
    label: "health-score",
    modulePath: "@/app/api/ai/health-score/route",
    limiter: generalApiLimiter,
    validBody: {
      pet: {
        name: "Bruno",
        breed: "Golden Retriever",
        age_years: 5,
        weight: 72,
        weight_unit: "lbs",
        existing_conditions: ["arthritis"],
        medications: ["carprofen"],
      },
      recentSymptoms: "mild stiffness",
      recentActivity: "normal walks",
      supplements: ["omega-3", "glucosamine"],
    },
    invalidBody: {
      recentSymptoms: "mild stiffness",
    },
  },
  {
    label: "supplements",
    modulePath: "@/app/api/ai/supplements/route",
    limiter: generalApiLimiter,
    validBody: {
      pet: {
        name: "Bruno",
        species: "dog",
        breed: "Golden Retriever",
        age_years: 5,
        age_months: 4,
        weight: 72,
        weight_unit: "lbs",
        gender: "male",
        is_neutered: true,
        existing_conditions: ["arthritis"],
        medications: ["carprofen"],
      },
    },
    invalidBody: {
      pet: "Bruno",
    },
  },
];

function makeAuthenticatedContext(userId = "user-123") {
  return {
    supabase: {},
    user: { id: userId },
  };
}

function makeJsonRequest(body: Record<string, unknown> | string, headers?: HeadersInit) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: rawBody,
  });
}

function buildOversizedBody(body: Record<string, unknown>) {
  const oversizedBody = {
    ...body,
    filler: "x".repeat(100_000),
  };
  const rawBody = JSON.stringify(oversizedBody);
  const byteLength = new TextEncoder().encode(rawBody).byteLength;
  return { rawBody, byteLength };
}

describe("AI endpoint auth, quota, and body caps", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("ip:test");
    mockRequireAuthenticatedApiUser.mockResolvedValue(
      makeAuthenticatedContext()
    );
    mockIsNvidiaGenerationConfigured.mockReturnValue(true);
    mockGenerateNvidiaJson.mockResolvedValue({ ok: true });
  });

  it.each(ROUTES)(
    "blocks unauthenticated costly access for $label",
    async ({ modulePath, validBody }) => {
      mockRequireAuthenticatedApiUser.mockResolvedValue({
        response: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        ),
      });

      const { POST } = await import(modulePath);
      const response = await POST(makeJsonRequest(validBody));

      expect(response.status).toBe(401);
      expect(mockGenerateNvidiaJson).not.toHaveBeenCalled();
      expect(mockIsNvidiaGenerationConfigured).not.toHaveBeenCalled();
    }
  );

  it.each(ROUTES)(
    "enforces rate limits for $label",
    async ({ limiter, modulePath, validBody }) => {
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        reset: Date.now() + 15_000,
        remaining: 0,
      });

      const { POST } = await import(modulePath);
      const response = await POST(makeJsonRequest(validBody));
      const payload = (await response.json()) as { error: string };

      expect(response.status).toBe(429);
      expect(payload.error).toContain("Too many requests");
      expect(response.headers.get("Retry-After")).toBeTruthy();
      expect(mockCheckRateLimit).toHaveBeenCalledWith(limiter, "ip:test");
      expect(mockRequireAuthenticatedApiUser).not.toHaveBeenCalled();
      expect(mockGenerateNvidiaJson).not.toHaveBeenCalled();
    }
  );

  it.each(ROUTES)(
    "rejects oversized request bodies for $label",
    async ({ modulePath, validBody }) => {
      const { rawBody, byteLength } = buildOversizedBody(validBody);
      const { POST } = await import(modulePath);
      const response = await POST(
        makeJsonRequest(rawBody, {
          "Content-Length": String(byteLength),
        })
      );
      const payload = (await response.json()) as { code: string; error: string };

      expect(response.status).toBe(413);
      expect(payload.code).toBe("PAYLOAD_TOO_LARGE");
      expect(payload.error).toContain("too large");
      expect(mockGenerateNvidiaJson).not.toHaveBeenCalled();
      expect(mockIsNvidiaGenerationConfigured).not.toHaveBeenCalled();
    }
  );

  it.each(ROUTES)(
    "fails safely on malformed JSON for $label",
    async ({ modulePath }) => {
      const { POST } = await import(modulePath);
      const response = await POST(makeJsonRequest('{"broken":'));
      const payload = (await response.json()) as { code: string };

      expect(response.status).toBe(400);
      expect(payload.code).toBe("INVALID_JSON");
      expect(mockGenerateNvidiaJson).not.toHaveBeenCalled();
    }
  );

  it.each(ROUTES)(
    "fails safely on invalid payload shapes for $label",
    async ({ modulePath, invalidBody }) => {
      const { POST } = await import(modulePath);
      const response = await POST(makeJsonRequest(invalidBody));
      const payload = (await response.json()) as { code: string };

      expect(response.status).toBe(400);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(mockGenerateNvidiaJson).not.toHaveBeenCalled();
    }
  );

  it.each(ROUTES)(
    "still allows valid authenticated use for $label",
    async ({ modulePath, validBody }) => {
      mockGenerateNvidiaJson.mockResolvedValue({
        endpoint: modulePath,
        ok: true,
      });

      const { POST } = await import(modulePath);
      const response = await POST(makeJsonRequest(validBody));
      const payload = (await response.json()) as {
        endpoint: string;
        ok: boolean;
      };

      expect(response.status).toBe(200);
      expect(payload).toEqual({
        endpoint: modulePath,
        ok: true,
      });
      expect(mockGenerateNvidiaJson).toHaveBeenCalledTimes(1);
    }
  );
});
