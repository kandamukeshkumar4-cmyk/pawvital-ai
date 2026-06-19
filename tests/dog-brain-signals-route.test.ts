import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCheckRateLimit = jest.fn();
const mockRequireAuthenticatedApiUser = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  generalApiLimiter: { id: "general" },
  getRateLimitId: () => "rate-id",
}));

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

function query(result: unknown) {
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
  };
  return chain;
}

describe("GET /api/dog-brain/signals", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
  });

  it("rejects invalid pet ids before auth or database work", async () => {
    const { GET } = await import("../src/app/api/dog-brain/signals/route");
    const response = await GET(
      new Request("http://localhost/api/dog-brain/signals?pet_id=not-a-uuid"),
    );
    const payload = (await response.json()) as { code: string };

    expect(response.status).toBe(400);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(mockRequireAuthenticatedApiUser).not.toHaveBeenCalled();
  });

  it("returns detected owner-log signals for an owned pet", async () => {
    const petQuery = query({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null });
    const logsQuery = query({
      data: [
        {
          id: "log-1",
          user_id: "user-1",
          pet_id: "11111111-1111-4111-8111-111111111111",
          log_date: "2026-06-03",
          appetite: "none",
          water: "normal",
          stool: "normal",
          urination: "normal",
          vomiting_count: 3,
          energy: "normal",
          weight_kg: null,
          meds_given: false,
          notes: null,
          photo_urls: [],
          context_signals: null,
          created_at: "2026-06-03T00:00:00.000Z",
          updated_at: "2026-06-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const supabase = {
      from: jest.fn((table: string) => (table === "pets" ? petQuery : logsQuery)),
    };
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    });

    const { GET } = await import("../src/app/api/dog-brain/signals/route");
    const response = await GET(
      new Request(
        "http://localhost/api/dog-brain/signals?pet_id=11111111-1111-4111-8111-111111111111",
      ),
    );
    const payload = (await response.json()) as {
      state: string;
      signals: Array<{ signal_type: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.state).toBe("needs_attention");
    expect(payload.signals.map((signal) => signal.signal_type)).toEqual(
      expect.arrayContaining(["appetite_drop", "vomiting_trend"]),
    );
    expect(supabase.from).toHaveBeenCalledWith("pets");
    expect(supabase.from).toHaveBeenCalledWith("daily_health_logs");
  });

  it("does not expose logs for unowned pets", async () => {
    const petQuery = query({ data: null, error: null });
    const logsQuery = query({ data: [], error: null });
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {
        from: jest.fn((table: string) => (table === "pets" ? petQuery : logsQuery)),
      },
      user: { id: "user-1" },
    });

    const { GET } = await import("../src/app/api/dog-brain/signals/route");
    const response = await GET(
      new Request(
        "http://localhost/api/dog-brain/signals?pet_id=11111111-1111-4111-8111-111111111111",
      ),
    );

    expect(response.status).toBe(404);
    expect(logsQuery.limit).not.toHaveBeenCalled();
  });
});
