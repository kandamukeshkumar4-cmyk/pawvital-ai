const mockGetServiceSupabase = jest.fn();

jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: (...args: unknown[]) => mockGetServiceSupabase(...args),
}));

type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

function buildDigestSupabase(
  notifications: NotificationRecord[]
) {
  const updateCalls: Array<{ metadata: Record<string, unknown> }> = [];
  const notificationSelectResult = {
    data: notifications,
    error: null,
  };
  const notificationsSelectChain = {
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(notificationSelectResult),
  };
  const notificationsUpdateChain = {
    eq: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  };
  const notificationPreferencesChain = {
    eq: jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          email_digest: true,
          digest_frequency: "daily",
        },
        error: null,
      }),
    }),
  };

  const supabase = {
    from: jest.fn((table: string) => {
      if (table === "notification_preferences") {
        return {
          select: jest.fn().mockReturnValue(notificationPreferencesChain),
        };
      }

      if (table === "notifications") {
        return {
          select: jest.fn().mockReturnValue(notificationsSelectChain),
          update: jest.fn((payload: { metadata: Record<string, unknown> }) => {
            updateCalls.push(payload);
            return notificationsUpdateChain;
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, updateCalls };
}

describe("email digest delivery reliability", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("filters out notifications that already have sent delivery confirmation", async () => {
    const notifications: NotificationRecord[] = [
      {
        id: "notif-pending",
        type: "report_ready",
        title: "Report ready",
        body: null,
        created_at: "2026-04-14T12:00:00.000Z",
        metadata: {
          delivery: { status: "pending", attempts: 0 },
        },
      },
      {
        id: "notif-sent",
        type: "system",
        title: "Already sent",
        body: null,
        created_at: "2026-04-14T11:00:00.000Z",
        metadata: {
          delivery: { status: "sent", attempts: 1 },
        },
      },
    ];
    const { supabase } = buildDigestSupabase(notifications);
    mockGetServiceSupabase.mockReturnValue(supabase);

    const { buildDigestForUser } = await import("@/lib/email-digest");
    const digest = await buildDigestForUser("user-1");

    expect(digest?.notificationCount).toBe(1);
    expect(digest?.notificationIds).toEqual(["notif-pending"]);
  });

  it("retries transient digest delivery failures before marking notifications sent", async () => {
    const notifications: NotificationRecord[] = [
      {
        id: "notif-1",
        type: "report_ready",
        title: "Report ready",
        body: null,
        created_at: "2026-04-14T12:00:00.000Z",
        metadata: {
          delivery: { status: "pending", attempts: 0 },
        },
      },
    ];
    const { supabase, updateCalls } = buildDigestSupabase(notifications);
    mockGetServiceSupabase.mockReturnValue(supabase);

    const transport = jest
      .fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockRejectedValueOnce(new Error("provider timeout"))
      .mockResolvedValueOnce({ confirmationId: "provider-123" });
    const sleep = jest.fn().mockResolvedValue(undefined);

    const { deliverDigestForUser } = await import("@/lib/email-digest");
    const result = await deliverDigestForUser("user-1", transport, sleep);

    expect(result.status).toBe("sent");
    expect(result.attempts).toBe(3);
    expect(result.deadLettered).toBe(false);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
    expect(updateCalls[0].metadata.delivery).toMatchObject({
      status: "sent",
      attempts: 3,
      confirmation_id: "provider-123",
      dead_lettered: false,
      last_error: null,
    });
  });

  it("dead-letters notifications after exhausting digest retries", async () => {
    const notifications: NotificationRecord[] = [
      {
        id: "notif-1",
        type: "report_ready",
        title: "Report ready",
        body: null,
        created_at: "2026-04-14T12:00:00.000Z",
        metadata: {
          delivery: { status: "pending", attempts: 0 },
        },
      },
    ];
    const { supabase, updateCalls } = buildDigestSupabase(notifications);
    mockGetServiceSupabase.mockReturnValue(supabase);

    const transport = jest.fn().mockRejectedValue(new Error("smtp offline"));
    const sleep = jest.fn().mockResolvedValue(undefined);

    const { deliverDigestForUser } = await import("@/lib/email-digest");
    const result = await deliverDigestForUser("user-1", transport, sleep);

    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(4);
    expect(result.deadLettered).toBe(true);
    expect(result.lastError).toBe("smtp offline");
    expect(transport).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
    expect(sleep).toHaveBeenNthCalledWith(3, 4000);
    expect(updateCalls[0].metadata.delivery).toMatchObject({
      status: "failed",
      attempts: 4,
      last_error: "smtp offline",
      dead_lettered: true,
    });
  });
});
