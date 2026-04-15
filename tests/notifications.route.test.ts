const mockCheckRateLimit = jest.fn();
const mockCreateServerSupabaseClient = jest.fn();
const mockGetRateLimitId = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: (...args: unknown[]) =>
    mockCreateServerSupabaseClient(...args),
}));

// ── Shared request helpers ────────────────────────────────────────────────────

function makeGetRequest(path = "http://localhost/api/notifications") {
  return new Request(path, { method: "GET" });
}

function makePostRequest(path: string, body: Record<string, unknown> = {}) {
  return new Request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(
  path: string,
  body: Record<string, unknown>
) {
  return new Request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePutRequest(path: string, body: Record<string, unknown>) {
  return new Request(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Supabase mock builder ────────────────────────────────────────────────────

type SupabaseMockOptions = {
  userId?: string | null;
  notificationsData?: unknown[] | null;
  notificationDbError?: { message: string } | null;
  updateData?: { id: string; read: boolean } | null;
  updateError?: { message: string } | null;
  preferencesData?: Record<string, unknown> | null;
  preferencesError?: { message: string } | null;
};

/**
 * Returns a fully chainable Supabase-like mock.
 * The terminal result is controlled by resolved values set in options.
 */
function buildSupabaseMock(options: SupabaseMockOptions = {}) {
  const userId = "userId" in options ? options.userId : "user-1";

  // Default notification list
  const defaultNotifications = [
    {
      id: "notif-1",
      type: "report_ready",
      title: "Report ready",
      body: null,
      metadata: {},
      read: false,
      created_at: "2026-04-07T10:00:00.000Z",
    },
  ];

  // ── notifications table chains ───────────────────────────────────────────

  // GET chain: .select().eq().eq().order().range() — thenable so `await chain` works
  // even when additional .eq() calls happen after .range()
  const rangeResult = {
    data:
      "notificationsData" in options
        ? (options.notificationsData ?? [])
        : defaultNotifications,
    error: options.notificationDbError ?? null,
  };
  const notifGetChain: Record<string, unknown> & PromiseLike<typeof rangeResult> = {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    then: (
      resolve: (value: typeof rangeResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(rangeResult).then(resolve, reject),
  };

  // PATCH chain: .update().eq().eq().select().maybeSingle() => resolves patchResult
  const patchResult = {
    data: options.updateData !== undefined ? options.updateData : { id: "notif-1", read: true },
    error: options.updateError ?? null,
  };
  const patchInnerChain = {
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(patchResult),
  };
  const notifPatchChain = {
    eq: jest.fn().mockReturnValue(patchInnerChain),
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(patchResult),
  };

  // ── notification_preferences table chains ────────────────────────────────

  const prefsGetChain = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: options.preferencesData !== undefined ? options.preferencesData : null,
      error: options.preferencesError ?? null,
    }),
  };

  const prefsUpsertChain = {
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: options.preferencesData !== undefined
        ? options.preferencesData
        : {
            email_digest: true,
            push_enabled: false,
            urgency_alerts: true,
            outcome_reminders: true,
            digest_frequency: "daily",
          },
      error: options.preferencesError ?? null,
    }),
  };

  // ── Main from() dispatcher ───────────────────────────────────────────────

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: userId === null ? null : { id: userId ?? "user-1" },
        },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === "notifications") {
        return {
          // GET path
          select: jest.fn().mockReturnValue(notifGetChain),
          // PATCH path
          update: jest.fn().mockReturnValue(notifPatchChain),
        };
      }
      if (table === "notification_preferences") {
        return {
          // GET path: .select().eq().maybeSingle()
          select: jest.fn().mockReturnValue(prefsGetChain),
          // PUT path: .upsert().select().maybeSingle()
          upsert: jest.fn().mockReturnValue(prefsUpsertChain),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    }),
  };

  return {
    supabase,
    notifGetChain,
    notifPatchChain,
    prefsGetChain,
    prefsUpsertChain,
  };
}

// ── GET /api/notifications ────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("user:user-1");
  });

  it("returns notifications for authenticated user", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].type).toBe("report_ready");
  });

  it("returns 401 when user is not authenticated", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      reset: Date.now() + 10_000,
    });

    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(429);
  });

  it("returns 503 in demo mode", async () => {
    mockCreateServerSupabaseClient.mockRejectedValue(new Error("DEMO_MODE"));

    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(503);
  });

  it("filters unread notifications when ?unread=true", async () => {
    const { supabase, notifGetChain } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/notifications/route");
    await GET(
      makeGetRequest(
        "http://localhost/api/notifications?unread=true&limit=10&offset=0"
      )
    );

    // The chainable eq() for read=false should have been called somewhere in the chain
    expect(notifGetChain.eq).toHaveBeenCalledWith("read", false);
  });
});

// ── PATCH /api/notifications/[id] ────────────────────────────────────────────

describe("PATCH /api/notifications/[id]", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("user:user-1");
  });

  it("marks a notification as read for the owning user", async () => {
    const { supabase } = buildSupabaseMock({
      updateData: { id: "notif-1", read: true },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/notifications/[id]/route");
    const res = await PATCH(
      makePatchRequest("http://localhost/api/notifications/notif-1", {
        read: true,
      }),
      { params: { id: "notif-1" } }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.read).toBe(true);
  });

  it("returns 400 when body is not { read: true }", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/notifications/[id]/route");
    const res = await PATCH(
      makePatchRequest("http://localhost/api/notifications/notif-1", {
        read: false,
      }),
      { params: { id: "notif-1" } }
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when notification does not belong to user", async () => {
    const { supabase } = buildSupabaseMock({ updateData: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/notifications/[id]/route");
    const res = await PATCH(
      makePatchRequest("http://localhost/api/notifications/other-notif", {
        read: true,
      }),
      { params: { id: "other-notif" } }
    );

    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/notifications/[id]/route");
    const res = await PATCH(
      makePatchRequest("http://localhost/api/notifications/notif-1", {
        read: true,
      }),
      { params: { id: "notif-1" } }
    );

    expect(res.status).toBe(401);
  });
});

// ── POST /api/notifications/mark-all-read ─────────────────────────────────────

describe("POST /api/notifications/mark-all-read", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("user:user-1");
  });

  it("marks all unread notifications as read", async () => {
    const updateEqReadFn = jest.fn().mockResolvedValue({ error: null });
    const updateEqUserFn = jest.fn().mockReturnValue({
      eq: updateEqReadFn,
    });
    const updateFn = jest.fn().mockReturnValue({
      eq: updateEqUserFn,
    });
    const selectEqReadFn = jest.fn().mockResolvedValue({
      data: [{ id: "notif-1" }, { id: "notif-2" }],
      error: null,
    });
    const selectEqUserFn = jest.fn().mockReturnValue({
      eq: selectEqReadFn,
    });
    const selectFn = jest.fn().mockReturnValue({
      eq: selectEqUserFn,
    });

    const supabaseCustom = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({ select: selectFn, update: updateFn })),
    };
    mockCreateServerSupabaseClient.mockResolvedValue(supabaseCustom);

    const { POST } = await import(
      "@/app/api/notifications/mark-all-read/route"
    );
    const res = await POST(
      makePostRequest("http://localhost/api/notifications/mark-all-read")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.updatedCount).toBe(2);
    expect(body.alreadyRead).toBe(false);
    expect(selectFn).toHaveBeenCalledWith("id");
    expect(updateFn).toHaveBeenCalledWith({ read: true });
    expect(updateEqUserFn).toHaveBeenCalledWith("user_id", "user-1");
    expect(updateEqReadFn).toHaveBeenCalledWith("read", false);
  });

  it("returns success without updating when everything is already read", async () => {
    const updateFn = jest.fn();
    const selectEqReadFn = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const selectEqUserFn = jest.fn().mockReturnValue({
      eq: selectEqReadFn,
    });
    const selectFn = jest.fn().mockReturnValue({
      eq: selectEqUserFn,
    });

    const supabaseCustom = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({ select: selectFn, update: updateFn })),
    };
    mockCreateServerSupabaseClient.mockResolvedValue(supabaseCustom);

    const { POST } = await import(
      "@/app/api/notifications/mark-all-read/route"
    );
    const res = await POST(
      makePostRequest("http://localhost/api/notifications/mark-all-read")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.updatedCount).toBe(0);
    expect(body.alreadyRead).toBe(true);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import(
      "@/app/api/notifications/mark-all-read/route"
    );
    const res = await POST(
      makePostRequest("http://localhost/api/notifications/mark-all-read")
    );

    expect(res.status).toBe(401);
  });
});

// ── GET /api/notifications/preferences ───────────────────────────────────────

describe("GET /api/notifications/preferences", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("user:user-1");
  });

  it("returns stored preferences when they exist", async () => {
    const { supabase } = buildSupabaseMock({
      preferencesData: {
        email_digest: false,
        push_enabled: true,
        urgency_alerts: true,
        outcome_reminders: false,
        digest_frequency: "weekly",
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import(
      "@/app/api/notifications/preferences/route"
    );
    const res = await GET(
      makeGetRequest("http://localhost/api/notifications/preferences")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.digest_frequency).toBe("weekly");
    expect(body.data.email_digest).toBe(false);
  });

  it("returns default preferences when row does not exist", async () => {
    const { supabase } = buildSupabaseMock({ preferencesData: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import(
      "@/app/api/notifications/preferences/route"
    );
    const res = await GET(
      makeGetRequest("http://localhost/api/notifications/preferences")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.email_digest).toBe(true);
    expect(body.data.digest_frequency).toBe("daily");
  });

  it("returns 401 when unauthenticated", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import(
      "@/app/api/notifications/preferences/route"
    );
    const res = await GET(
      makeGetRequest("http://localhost/api/notifications/preferences")
    );

    expect(res.status).toBe(401);
  });
});

// ── PUT /api/notifications/preferences ───────────────────────────────────────

describe("PUT /api/notifications/preferences", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("user:user-1");
  });

  it("upserts valid preference fields", async () => {
    const upsertFn = jest.fn().mockReturnThis();
    const maybeSingleFn = jest.fn().mockResolvedValue({
      data: {
        email_digest: false,
        push_enabled: false,
        urgency_alerts: true,
        outcome_reminders: true,
        digest_frequency: "weekly",
      },
      error: null,
    });
    const selectFn = jest.fn().mockReturnValue({ maybeSingle: maybeSingleFn });

    const supabaseCustom = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        upsert: upsertFn,
        select: selectFn,
      })),
    };
    mockCreateServerSupabaseClient.mockResolvedValue(supabaseCustom);

    const { PUT } = await import(
      "@/app/api/notifications/preferences/route"
    );
    const res = await PUT(
      makePutRequest("http://localhost/api/notifications/preferences", {
        email_digest: false,
        digest_frequency: "weekly",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.digest_frequency).toBe("weekly");
  });

  it("returns 400 for invalid digest_frequency value", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PUT } = await import(
      "@/app/api/notifications/preferences/route"
    );
    const res = await PUT(
      makePutRequest("http://localhost/api/notifications/preferences", {
        digest_frequency: "hourly",
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when body has no valid fields", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PUT } = await import(
      "@/app/api/notifications/preferences/route"
    );
    const res = await PUT(
      makePutRequest("http://localhost/api/notifications/preferences", {})
    );

    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PUT } = await import(
      "@/app/api/notifications/preferences/route"
    );
    const res = await PUT(
      makePutRequest("http://localhost/api/notifications/preferences", {
        email_digest: false,
      })
    );

    expect(res.status).toBe(401);
  });
});
