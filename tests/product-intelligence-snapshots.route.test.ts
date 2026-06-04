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

function makeGetRequest(petId = "pet-1") {
  return new Request(`http://localhost/api/product-intelligence/snapshots?pet_id=${petId}`);
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/product-intelligence/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function symptomRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "check-1",
    pet_id: "pet-1",
    symptoms: "normal appetite and energy",
    ai_response: JSON.stringify({
      title: "Normal appetite",
      severity: "low",
      recommendation: "monitor",
      explanation: "Owner reports normal appetite and energy.",
      differential_diagnoses: [{ condition: "No emergency signal", likelihood: "high" }],
      actions: [],
      warning_signs: [],
    }),
    severity: "low",
    recommendation: "monitor",
    created_at: "2026-06-02T14:00:00.000Z",
    ...overrides,
  };
}

function tableBuilder(
  result: { data: unknown; error: unknown },
  maybeSingleResult = result
) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(maybeSingleResult),
    insert: jest.fn().mockReturnThis(),
  };
}

function buildSupabaseMock(options?: {
  userId?: string | null;
  pet?: Record<string, unknown> | null;
  readinessRows?: unknown[];
  readinessInsert?: unknown;
  recoveryRows?: unknown[];
  recoveryInsert?: unknown;
  symptomRows?: unknown[];
}) {
  const petBuilder = tableBuilder({
    data: options && "pet" in options ? options.pet : { id: "pet-1", user_id: "user-1" },
    error: null,
  });
  const readinessBuilder = tableBuilder(
    {
      data: options?.readinessRows ?? [],
      error: null,
    },
    {
      data: options?.readinessInsert ?? { id: "ready-1" },
      error: null,
    }
  );
  const recoveryBuilder = tableBuilder(
    {
      data: options?.recoveryRows ?? [],
      error: null,
    },
    {
      data: options?.recoveryInsert ?? { id: "recovery-1" },
      error: null,
    }
  );
  const symptomChecksBuilder = tableBuilder({
    data: options?.symptomRows ?? [],
    error: null,
  });

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
      if (table === "pets") return petBuilder;
      if (table === "symptom_checks") return symptomChecksBuilder;
      if (table === "daily_readiness_snapshots") return readinessBuilder;
      if (table === "recovery_checkpoints") return recoveryBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, petBuilder, readinessBuilder, recoveryBuilder, symptomChecksBuilder };
}

describe("product intelligence snapshots route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("user:user-1");
  });

  it("reads saved readiness and recovery history for an owned pet only", async () => {
    const { supabase, readinessBuilder, recoveryBuilder } = buildSupabaseMock({
      readinessRows: [{ id: "ready-1", user_id: "user-1", pet_id: "pet-1" }],
      recoveryRows: [{ id: "recovery-1", user_id: "user-1", pet_id: "pet-1" }],
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/product-intelligence/snapshots/route");
    const response = await GET(makeGetRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.readiness).toHaveLength(1);
    expect(payload.data.recovery).toHaveLength(1);
    expect(readinessBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(readinessBuilder.eq).toHaveBeenCalledWith("pet_id", "pet-1");
    expect(recoveryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(recoveryBuilder.eq).toHaveBeenCalledWith("pet_id", "pet-1");
  });

  it("rejects unauthenticated history reads", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/product-intelligence/snapshots/route");
    const response = await GET(makeGetRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toContain("authenticated");
  });

  it("rejects persistence for an unowned pet", async () => {
    const { supabase } = buildSupabaseMock({ pet: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/product-intelligence/snapshots/route");
    const response = await POST(
      makePostRequest({
        pet_id: "pet-1",
        readiness: {},
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain("not found");
  });

  it("persists server-derived readiness for owned source checks", async () => {
    const { supabase, readinessBuilder, symptomChecksBuilder } = buildSupabaseMock({
      symptomRows: [
        symptomRow({
          id: "check-2",
          created_at: "2026-06-02T15:00:00.000Z",
          symptoms: "normal activity",
        }),
        symptomRow({
          id: "check-1",
          created_at: "2026-06-01T15:00:00.000Z",
        }),
      ],
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/product-intelligence/snapshots/route");
    const response = await POST(
      makePostRequest({
        pet_id: "pet-1",
        readiness: {
          generated_at: "2026-06-02T16:00:00.000Z",
          source_check_ids: ["check-1", "check-2"],
        },
      })
    );
    const payload = await response.json();
    const insertedRow = readinessBuilder.insert.mock.calls[0][0];

    expect(response.status).toBe(201);
    expect(payload.data.readiness).toEqual({ id: "ready-1" });
    expect(symptomChecksBuilder.eq).toHaveBeenCalledWith("pet_id", "pet-1");
    expect(symptomChecksBuilder.in).toHaveBeenCalledWith("id", ["check-1", "check-2"]);
    expect(insertedRow).toEqual(
      expect.objectContaining({
        user_id: "user-1",
        pet_id: "pet-1",
        snapshot_date: "2026-06-02",
        readiness_state: "stable",
      })
    );
    expect(insertedRow.source_check_ids).toEqual(["check-2", "check-1"]);
    expect(JSON.stringify(insertedRow.payload)).not.toMatch(
      /diagnosis certainty|treatment recommendation|emergency clearance granted/i
    );
  });

  it("persists server-derived recovery checkpoints for owned report source checks", async () => {
    const { supabase, recoveryBuilder, symptomChecksBuilder } = buildSupabaseMock({
      symptomRows: [
        symptomRow({
          id: "check-follow-up",
          created_at: "2026-06-03T15:00:00.000Z",
          symptoms: "appetite returned after report",
        }),
        symptomRow({
          id: "check-baseline",
          created_at: "2026-06-01T15:00:00.000Z",
          symptoms: "low appetite",
        }),
      ],
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/product-intelligence/snapshots/route");
    const response = await POST(
      makePostRequest({
        pet_id: "pet-1",
        recovery: {
          report_source_id: "check-follow-up",
          generated_at: "2026-06-03T16:00:00.000Z",
          source_check_ids: ["check-baseline"],
        },
      })
    );
    const payload = await response.json();
    const insertedRow = recoveryBuilder.insert.mock.calls[0][0];

    expect(response.status).toBe(201);
    expect(payload.data.recovery).toEqual({ id: "recovery-1" });
    expect(symptomChecksBuilder.in).toHaveBeenCalledWith("id", [
      "check-baseline",
      "check-follow-up",
    ]);
    expect(insertedRow).toEqual(
      expect.objectContaining({
        user_id: "user-1",
        pet_id: "pet-1",
        report_source_id: "check-follow-up",
        recovery_status: "ready",
      })
    );
    expect(insertedRow.source_check_ids).toEqual(["check-follow-up", "check-baseline"]);
  });

  it("rejects client-authored readiness copy and persistence flags", async () => {
    const { supabase, readinessBuilder } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/product-intelligence/snapshots/route");
    const response = await POST(
      makePostRequest({
        pet_id: "pet-1",
        readiness: {
          source_check_ids: ["check-1"],
          persistenceAllowed: true,
          ownerSummary: "Diagnosis certainty: recovered.",
          claimGuard: "Emergency clearance granted.",
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.error).toContain("Invalid request body");
    expect(readinessBuilder.insert).not.toHaveBeenCalled();
  });

  it("rejects source check ids that are not returned for the verified pet", async () => {
    const { supabase, readinessBuilder } = buildSupabaseMock({
      symptomRows: [symptomRow({ id: "check-1" })],
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/product-intelligence/snapshots/route");
    const response = await POST(
      makePostRequest({
        pet_id: "pet-1",
        readiness: {
          source_check_ids: ["check-1", "check-other-pet"],
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.error).toContain("source symptom checks");
    expect(readinessBuilder.insert).not.toHaveBeenCalled();
  });
});
