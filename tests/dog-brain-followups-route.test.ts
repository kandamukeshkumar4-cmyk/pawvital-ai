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

function chain(result: unknown) {
  const c: Record<string, unknown> = {
    select: jest.fn(() => c),
    eq: jest.fn(() => c),
    order: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
    insert: jest.fn(() => c),
    upsert: jest.fn(() => c),
    update: jest.fn(() => c),
  };
  return c;
}

const UUID = "11111111-1111-4111-8111-111111111111";

describe("GET /api/dog-brain/followups", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
  });

  it("rejects an invalid pet_id before auth", async () => {
    const { GET } = await import("../src/app/api/dog-brain/followups/route");
    const res = await GET(
      new Request("http://localhost/api/dog-brain/followups?pet_id=nope"),
    );
    const payload = (await res.json()) as { code: string };
    expect(res.status).toBe(400);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(mockRequireAuthenticatedApiUser).not.toHaveBeenCalled();
  });

  it("404s an unowned pet without reading follow-ups", async () => {
    const petQuery = chain({ data: null, error: null });
    const followupQuery = chain({ data: [], error: null });
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {
        from: jest.fn((t: string) => (t === "pets" ? petQuery : followupQuery)),
      },
      user: { id: "user-1" },
    });
    const { GET } = await import("../src/app/api/dog-brain/followups/route");
    const res = await GET(
      new Request(`http://localhost/api/dog-brain/followups?pet_id=${UUID}`),
    );
    expect(res.status).toBe(404);
    expect(followupQuery.order).not.toHaveBeenCalled();
  });

  it("returns TABLE_MISSING gracefully when the table is absent", async () => {
    const petQuery = chain({ data: { id: UUID }, error: null });
    const followupQuery = chain({ data: null, error: { code: "42P01" } });
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {
        from: jest.fn((t: string) => (t === "pets" ? petQuery : followupQuery)),
      },
      user: { id: "user-1" },
    });
    const { GET } = await import("../src/app/api/dog-brain/followups/route");
    const res = await GET(
      new Request(`http://localhost/api/dog-brain/followups?pet_id=${UUID}`),
    );
    const payload = (await res.json()) as { code?: string; data?: unknown[] };
    expect(res.status).toBe(200);
    expect(payload.code).toBe("TABLE_MISSING");
    expect(payload.data).toEqual([]);
  });
});

describe("POST /api/dog-brain/followups", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
  });

  function postRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/dog-brain/followups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const VALID_BODY = {
    pet_id: UUID,
    signal_key: "stool_change",
    prompt: "Is the stool change better, same, or worse now?",
  };

  it("(proof d) does NOT create a duplicate pending follow-up for the same pet+signal", async () => {
    const petQuery = chain({ data: { id: UUID }, error: null });
    const existing = {
      id: "existing-followup",
      signal_key: "stool_change",
      status: "pending",
    };
    const followupQuery = chain({ data: existing, error: null });
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {
        from: jest.fn((t: string) => (t === "pets" ? petQuery : followupQuery)),
      },
      user: { id: "user-1" },
    });

    const { POST } = await import("../src/app/api/dog-brain/followups/route");
    const res = await POST(postRequest(VALID_BODY));
    const payload = (await res.json()) as {
      deduped?: boolean;
      data?: { id?: string };
    };

    expect(res.status).toBe(200);
    expect(payload.deduped).toBe(true);
    expect(payload.data?.id).toBe("existing-followup");
    // The open follow-up already exists — the route must short-circuit and
    // never attempt a second insert (no duplicate pending row).
    expect(followupQuery.insert).not.toHaveBeenCalled();
  });

  it("creates a new pending follow-up when none is open for that pet+signal", async () => {
    const petQuery = chain({ data: { id: UUID }, error: null });
    const created = { id: "new-followup", signal_key: "stool_change", status: "pending" };
    let maybeSingleCalls = 0;
    const followupQuery: Record<string, unknown> = {
      select: jest.fn(() => followupQuery),
      eq: jest.fn(() => followupQuery),
      insert: jest.fn(() => followupQuery),
      // 1st call = the pending pre-check (none open); 2nd = the insert result.
      maybeSingle: jest.fn(async () =>
        maybeSingleCalls++ === 0
          ? { data: null, error: null }
          : { data: created, error: null },
      ),
    };
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {
        from: jest.fn((t: string) => (t === "pets" ? petQuery : followupQuery)),
      },
      user: { id: "user-1" },
    });

    const { POST } = await import("../src/app/api/dog-brain/followups/route");
    const res = await POST(postRequest(VALID_BODY));
    const payload = (await res.json()) as { data?: { id?: string } };

    expect(res.status).toBe(201);
    expect(payload.data?.id).toBe("new-followup");
    expect(followupQuery.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid body before touching the database", async () => {
    const { POST } = await import("../src/app/api/dog-brain/followups/route");
    const res = await POST(postRequest({ pet_id: "not-a-uuid", signal_key: "" }));
    const payload = (await res.json()) as { code?: string };
    expect(res.status).toBe(400);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(mockRequireAuthenticatedApiUser).not.toHaveBeenCalled();
  });
});
