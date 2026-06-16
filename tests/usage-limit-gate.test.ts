import { createSession, recordAnswer } from "@/lib/triage-engine";
import {
  hasConversationStarted,
  hasEmergencyUsageGateBypassSignal,
  maybeBuildUsageLimitResponse,
} from "@/lib/symptom-chat/usage-limit-gate";
import { createServerSupabaseClient } from "@/lib/supabase-server";

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: jest.fn(),
}));

jest.mock("@/lib/private-tester-access", () => ({
  shouldBypassUsageLimitForPrivateTester: jest.fn(() => false),
}));

const mockCreateServerSupabaseClient =
  createServerSupabaseClient as jest.MockedFunction<
    typeof createServerSupabaseClient
  >;

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

// Minimal chainable Supabase query stub: every builder method returns the
// builder, and awaiting it (or calling maybeSingle) resolves the configured
// result — covering the .select().eq() / .in().gte() / .maybeSingle() chains.
function makeQuery(result: QueryResult) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    in: () => builder,
    gte: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

function buildSupabaseMock(opts: {
  user?: { id: string; email?: string } | null;
  subscriptions?: QueryResult;
  pets?: QueryResult;
  symptomChecks?: QueryResult;
}) {
  return {
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: opts.user ?? null }, error: null }),
    },
    from: jest.fn((table: string) => {
      if (table === "subscriptions") {
        return makeQuery(opts.subscriptions ?? { data: null, error: null });
      }
      if (table === "pets") {
        return makeQuery(opts.pets ?? { data: [], error: null });
      }
      if (table === "symptom_checks") {
        return makeQuery(opts.symptomChecks ?? { count: 0, error: null });
      }
      return makeQuery({ data: null, error: null });
    }),
  };
}

describe("usage-limit-gate helpers", () => {
  it("detects when a conversation is already in progress", () => {
    const untouchedSession = createSession();
    let activeSession = createSession();
    activeSession = recordAnswer(activeSession, "appetite", false);

    expect(hasConversationStarted(undefined)).toBe(false);
    expect(hasConversationStarted(untouchedSession)).toBe(false);
    expect(hasConversationStarted(activeSession)).toBe(true);
  });

  it("bypasses the gate for emergency language even before extraction runs", () => {
    const session = createSession();

    expect(
      hasEmergencyUsageGateBypassSignal(session, [
        { role: "user", content: "My dog is struggling to breathe." },
      ])
    ).toBe(true);
    expect(
      hasEmergencyUsageGateBypassSignal(session, [
        { role: "user", content: "My dog seems itchy today." },
      ])
    ).toBe(false);
    expect(
      hasEmergencyUsageGateBypassSignal(session, [
        {
          role: "user",
          content:
            "My dog keeps trying to vomit but nothing comes up and his belly looks swollen.",
        },
      ])
    ).toBe(true);
  });
});

describe("maybeBuildUsageLimitResponse fail-closed behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function chatInput() {
    return {
      action: "chat" as const,
      messages: [
        { role: "user" as const, content: "My dog seems a bit off today." },
      ],
      session: createSession(),
    };
  }

  it("passes (null) in demo mode when the Supabase client throws DEMO_MODE", async () => {
    mockCreateServerSupabaseClient.mockRejectedValueOnce(new Error("DEMO_MODE"));

    await expect(maybeBuildUsageLimitResponse(chatInput())).resolves.toBeNull();
  });

  it("passes (null) for an unauthenticated user by design", async () => {
    mockCreateServerSupabaseClient.mockResolvedValueOnce(
      buildSupabaseMock({ user: null }) as never
    );

    await expect(maybeBuildUsageLimitResponse(chatInput())).resolves.toBeNull();
  });

  it("fails closed with 503 USAGE_GATE_UNAVAILABLE when the usage count query errors", async () => {
    mockCreateServerSupabaseClient.mockResolvedValueOnce(
      buildSupabaseMock({
        user: { id: "user-1", email: "owner@example.com" },
        subscriptions: { data: null, error: null },
        pets: { data: [{ id: "pet-1" }], error: null },
        symptomChecks: { count: null, error: { message: "db unavailable" } },
      }) as never
    );

    const response = await maybeBuildUsageLimitResponse(chatInput());
    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      type: "usage_limit",
      code: "USAGE_GATE_UNAVAILABLE",
      ready_for_report: false,
      conversationState: "idle",
    });
  });

  it("fails closed with 503 when the Supabase client throws a generic error", async () => {
    mockCreateServerSupabaseClient.mockRejectedValueOnce(
      new Error("network unreachable")
    );

    const response = await maybeBuildUsageLimitResponse(chatInput());
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      code: "USAGE_GATE_UNAVAILABLE",
    });
  });

  it("returns null for generate_report without touching Supabase", async () => {
    const response = await maybeBuildUsageLimitResponse({
      action: "generate_report",
      messages: [{ role: "user", content: "done" }],
      session: createSession(),
    });

    expect(response).toBeNull();
    expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
  });
});
