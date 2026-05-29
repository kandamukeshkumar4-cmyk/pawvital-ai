import { NextResponse } from "next/server";

const mockRequireAuthenticatedApiUser = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockTranslateTexts = jest.fn();
const mockTranslatorApiLimiter = { scope: "azure-translator" };

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  translatorApiLimiter: mockTranslatorApiLimiter,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/azure/translator", () => ({
  translateTexts: (...args: unknown[]) => mockTranslateTexts(...args),
}));

function makeRequest(body: unknown = {}) {
  return new Request("http://localhost/api/azure/translator", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function makeRawRequest(body: string, headers: HeadersInit = {}) {
  return new Request("http://localhost/api/azure/translator", {
    body,
    headers,
    method: "POST",
  });
}

describe("POST /api/azure/translator", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {},
      user: { id: "user-1" },
    });
    mockCheckRateLimit.mockResolvedValue({
      reset: Date.now() + 30_000,
      success: true,
    });
    mockGetRateLimitId.mockReturnValue("user:user-1");
    mockTranslateTexts.mockResolvedValue({
      detectedLanguage: "es",
      enabled: true,
      sourceLanguage: null,
      targetLanguage: "en",
      translated: true,
      translations: ["Buddy is vomiting"],
    });
  });

  it("requires an authenticated user", async () => {
    mockRequireAuthenticatedApiUser.mockResolvedValueOnce({
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });

    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({ targetLanguage: "en", text: "Mi perro vomita" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication required");
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rate limits requests by authenticated user id", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      reset: Date.now() + 10_000,
      success: false,
    });

    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({ targetLanguage: "en", text: "Mi perro vomita" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toContain("Too many requests");
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      mockTranslatorApiLimiter,
      "user:user-1",
    );
    expect(mockGetRateLimitId).toHaveBeenCalledWith(expect.any(Request), "user-1");
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(makeRequest("{"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects non-json requests before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRawRequest("targetLanguage=en&text=hola", {
        "Content-Type": "application/x-www-form-urlencoded",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects non-object json payloads before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(makeRequest(["Mi perro vomita"]));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects invalid language tags before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({
        sourceLanguage: "es<script>",
        targetLanguage: "en",
        text: "Mi perro vomita",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects invalid source language types before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({
        sourceLanguage: 123,
        targetLanguage: "en",
        text: "Mi perro vomita",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects unexpected body keys before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({
        targetLanguage: "en",
        text: "Mi perro vomita",
        unsafeHtml: "<script>alert(1)</script>",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects unsafe control characters before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({
        targetLanguage: "en",
        text: "Mi perro\u0000vomita",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects markup delimiters before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({
        targetLanguage: "en",
        text: "Mi perro <script>vomita</script>",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects ambiguous single and batch text payloads", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({
        targetLanguage: "en",
        text: "Mi perro vomita",
        texts: ["No come"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("rejects mixed invalid text batches before calling Azure", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({
        targetLanguage: "en",
        texts: ["Mi perro vomita", 42],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(mockTranslateTexts).not.toHaveBeenCalled();
  });

  it("passes validated text batches into the Translator helper", async () => {
    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({
        sourceLanguage: "es",
        targetLanguage: "en",
        texts: [" Mi perro vomita ", "No come"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toEqual({
      detectedLanguage: "es",
      enabled: true,
      sourceLanguage: null,
      targetLanguage: "en",
      translated: true,
      translations: ["Buddy is vomiting"],
    });
    expect(mockTranslateTexts).toHaveBeenCalledWith({
      sourceLanguage: "es",
      targetLanguage: "en",
      texts: ["Mi perro vomita", "No come"],
    });
  });

  it("returns disabled when the feature flag is off", async () => {
    mockTranslateTexts.mockResolvedValueOnce({
      enabled: false,
      reason: "feature_disabled",
    });

    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({ targetLanguage: "en", text: "Mi perro vomita" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      enabled: false,
      reason: "feature_disabled",
    });
  });

  it("fails closed without leaking service errors", async () => {
    mockTranslateTexts.mockResolvedValueOnce({
      enabled: false,
      reason: "not_configured",
    });

    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({ targetLanguage: "en", text: "Mi perro vomita" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      enabled: false,
      reason: "translator_unavailable",
    });
  });

  it("fails closed when the Translator helper throws", async () => {
    mockTranslateTexts.mockRejectedValueOnce(new Error("upstream failed"));

    const { POST } = await import("@/app/api/azure/translator/route");
    const response = await POST(
      makeRequest({ targetLanguage: "en", text: "Mi perro vomita" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      enabled: false,
      reason: "translator_unavailable",
    });
  });
});
