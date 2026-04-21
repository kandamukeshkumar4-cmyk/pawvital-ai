const mockCreateClient = jest.fn();
const mockBuildThresholdProposalDraft = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

jest.mock("@/lib/threshold-proposals", () => ({
  buildThresholdProposalDraft: (...args: unknown[]) =>
    mockBuildThresholdProposalDraft(...args),
}));

type QueryResult = {
  data: unknown;
  error: unknown;
};

type TableConfig = {
  selectResult?: QueryResult;
  updateError?: unknown;
  insertResult?: QueryResult;
  insertError?: unknown;
};

type TableOperation = {
  type: "eq" | "insert" | "select" | "update";
  mode?: "insert" | "select" | "update";
  column?: string;
  payload?: Record<string, unknown>;
  value?: unknown;
};

function createQueryBuilder(
  tableName: string,
  config: TableConfig,
  operations: TableOperation[]
) {
  let mode: "insert" | "select" | "update" | null = null;
  const builder: {
    error: unknown;
    eq: (column: string, value: unknown) => typeof builder;
    insert: (payload: Record<string, unknown>) => typeof builder | { error: unknown };
    maybeSingle: () => Promise<QueryResult>;
    select: (columns: string) => typeof builder;
    update: (payload: Record<string, unknown>) => typeof builder;
  } = {
    error: null,
    eq(column, value) {
      operations.push({ type: "eq", mode: mode ?? undefined, column, value });
      return builder;
    },
    insert(payload) {
      operations.push({ type: "insert", payload });
      if (tableName === "threshold_proposals") {
        return { error: config.insertError ?? null };
      }
      mode = "insert";
      builder.error = null;
      return builder;
    },
    maybeSingle() {
      if (mode === "insert") {
        return Promise.resolve(config.insertResult ?? { data: null, error: null });
      }
      return Promise.resolve(config.selectResult ?? { data: null, error: null });
    },
    select(columns) {
      operations.push({ type: "select", payload: { columns } });
      if (mode !== "insert") {
        mode = "select";
      }
      return builder;
    },
    update(payload) {
      operations.push({ type: "update", payload });
      mode = "update";
      builder.error = config.updateError ?? null;
      return builder;
    },
  };

  return builder;
}

function createSupabaseMock(configByTable: Record<string, TableConfig>) {
  const operations: Record<string, TableOperation[]> = {};
  const supabase = {
    from(tableName: string) {
      const tableOperations = operations[tableName] ?? [];
      operations[tableName] = tableOperations;
      return createQueryBuilder(
        tableName,
        configByTable[tableName] ?? {},
        tableOperations
      );
    },
  };

  return { operations, supabase };
}

describe("saveOutcomeFeedbackToDB ownership guards", () => {
  const SUPABASE_URL = "https://paw-vital.supabase.co";
  const SERVICE_ROLE_KEY = "service-role-key";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    mockBuildThresholdProposalDraft.mockReturnValue({
      payload: { change: "threshold" },
      proposalType: "threshold_review",
      rationale: "owner feedback materially disagreed with the report",
      summary: "Review this threshold",
    });
  });

  it("blocks non-owner writes before any service-role update or insert happens", async () => {
    const { supabase, operations } = createSupabaseMock({
      pets: {
        selectResult: {
          data: { user_id: "22222222-2222-2222-2222-222222222222" },
          error: null,
        },
      },
      symptom_checks: {
        selectResult: {
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            pet_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            symptoms: "vomiting",
            severity: "high",
            recommendation: "vet_24h",
            ai_response: JSON.stringify({
              title: "Private report title",
              private_notes: "Do not leak",
            }),
          },
          error: null,
        },
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const { saveOutcomeFeedbackToDB } = await import("@/lib/report-storage");
    const result = await saveOutcomeFeedbackToDB({
      symptomCheckId: "11111111-1111-1111-1111-111111111111",
      matchedExpectation: "no",
      confirmedDiagnosis: "pancreatitis",
      requestingUserId: "33333333-3333-3333-3333-333333333333",
      vetOutcome: "hospitalized",
      ownerNotes: "private owner note",
    });

    expect(result).toEqual({
      errorCode: "forbidden",
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Symptom check does not belong to the authenticated user"],
    });
    expect(operations.symptom_checks?.some((entry) => entry.type === "update")).toBe(
      false
    );
    expect(operations.outcome_feedback_entries).toBeUndefined();
    expect(operations.threshold_proposals).toBeUndefined();
  });

  it("stores valid owner feedback only after ownership passes", async () => {
    const { supabase, operations } = createSupabaseMock({
      outcome_feedback_entries: {
        insertResult: {
          data: { id: "44444444-4444-4444-4444-444444444444" },
          error: null,
        },
      },
      pets: {
        selectResult: {
          data: { user_id: "33333333-3333-3333-3333-333333333333" },
          error: null,
        },
      },
      symptom_checks: {
        selectResult: {
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            pet_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            symptoms: "vomiting",
            severity: "high",
            recommendation: "vet_24h",
            ai_response: JSON.stringify({
              title: "GI upset report",
            }),
          },
          error: null,
        },
      },
      threshold_proposals: {
        insertError: null,
      },
    });
    mockCreateClient.mockReturnValue(supabase);

    const { saveOutcomeFeedbackToDB } = await import("@/lib/report-storage");
    const result = await saveOutcomeFeedbackToDB({
      symptomCheckId: "11111111-1111-1111-1111-111111111111",
      matchedExpectation: "partly",
      confirmedDiagnosis: "dietary indiscretion",
      requestingUserId: "33333333-3333-3333-3333-333333333333",
      vetOutcome: "supportive care",
      ownerNotes: "  responded to fluids  ",
    });

    expect(result).toEqual({
      ok: true,
      legacyUpdated: true,
      proposalCreated: true,
      structuredStored: true,
      warnings: [],
    });

    const updateOperation = operations.symptom_checks?.find(
      (entry) => entry.type === "update"
    );
    expect(updateOperation?.payload?.ai_response).toBeDefined();
    const updatedResponse = JSON.parse(
      String(updateOperation?.payload?.ai_response)
    ) as {
      outcome_feedback: {
        matched_expectation: string;
        owner_notes: string | null;
      };
    };
    expect(updatedResponse.outcome_feedback).toMatchObject({
      matched_expectation: "partly",
      owner_notes: "responded to fluids",
    });

    const updateEqFilters =
      operations.symptom_checks?.filter((entry) => entry.type === "eq") ?? [];
    expect(updateEqFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column: "id",
          value: "11111111-1111-1111-1111-111111111111",
        }),
        expect.objectContaining({
          column: "pet_id",
          value: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        }),
      ])
    );

    expect(
      operations.outcome_feedback_entries?.find((entry) => entry.type === "insert")
    ).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          owner_notes: "responded to fluids",
          symptom_check_id: "11111111-1111-1111-1111-111111111111",
        }),
      })
    );
    expect(
      operations.threshold_proposals?.find((entry) => entry.type === "insert")
    ).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          outcome_feedback_id: "44444444-4444-4444-4444-444444444444",
          symptom_check_id: "11111111-1111-1111-1111-111111111111",
        }),
      })
    );
  });

  it("fails malformed identifiers without creating a service-role client", async () => {
    const { saveOutcomeFeedbackToDB } = await import("@/lib/report-storage");
    const result = await saveOutcomeFeedbackToDB({
      symptomCheckId: "not-a-uuid",
      matchedExpectation: "yes",
      requestingUserId: "33333333-3333-3333-3333-333333333333",
    });

    expect(result).toEqual({
      errorCode: "not_found",
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Invalid symptom check identifier"],
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
