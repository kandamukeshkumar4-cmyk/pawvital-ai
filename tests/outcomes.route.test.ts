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

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/outcomes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildSupabaseMock(options?: {
  userId?: string | null;
  symptomCheck?: { id: string } | null;
  insertedOutcome?: Record<string, unknown> | null;
}) {
  const symptomCheckData =
    options && "symptomCheck" in options
      ? options.symptomCheck
      : { id: "check-1" };
  const insertedOutcomeData =
    options && "insertedOutcome" in options
      ? options.insertedOutcome
      : {
          id: "outcome-1",
          check_id: "check-1",
          reported_diagnosis: "gastroenteritis",
          vet_confirmed: true,
          outcome_notes: "Improved with fluids",
          recorded_at: "2026-04-07T12:00:00.000Z",
        };

  const symptomCheckBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: symptomCheckData,
      error: null,
    }),
  };

  const insertOutcomeBuilder = {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: insertedOutcomeData,
      error: null,
    }),
  };

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user:
            options?.userId === null
              ? null
              : { id: options?.userId ?? "user-1" },
        },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === "symptom_checks") {
        return symptomCheckBuilder;
      }

      if (table === "case_outcomes") {
        return insertOutcomeBuilder;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    supabase,
    symptomCheckBuilder,
    insertOutcomeBuilder,
  };
}

describe("outcomes route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("user:user-1");
  });

  it("stores an outcome for an owned symptom check", async () => {
    const { supabase, insertOutcomeBuilder } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/outcomes/route");
    const response = await POST(
      makeRequest({
        check_id: "4c7d2d59-2f43-49d3-bc5e-b64053439bb0",
        reported_diagnosis: "gastroenteritis",
        vet_confirmed: true,
        outcome_notes: "Improved with fluids",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data.reported_diagnosis).toBe("gastroenteritis");
    expect(insertOutcomeBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        check_id: "4c7d2d59-2f43-49d3-bc5e-b64053439bb0",
        reported_diagnosis: "gastroenteritis",
        vet_confirmed: true,
      })
    );
  });

  it("rejects unauthenticated users", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/outcomes/route");
    const response = await POST(
      makeRequest({
        check_id: "4c7d2d59-2f43-49d3-bc5e-b64053439bb0",
        reported_diagnosis: "gastroenteritis",
        vet_confirmed: true,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toContain("authenticated");
  });

  it("rejects unknown or unowned symptom checks", async () => {
    const { supabase } = buildSupabaseMock({ symptomCheck: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/outcomes/route");
    const response = await POST(
      makeRequest({
        check_id: "4c7d2d59-2f43-49d3-bc5e-b64053439bb0",
        reported_diagnosis: "gastroenteritis",
        vet_confirmed: true,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain("not found");
  });

  it("rejects invalid request bodies", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/outcomes/route");
    const response = await POST(
      makeRequest({
        reported_diagnosis: "gastroenteritis",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Invalid request body");
  });
});