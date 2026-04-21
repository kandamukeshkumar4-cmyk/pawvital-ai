const mockGetAdminRequestContext = jest.fn();
const mockGetServiceSupabase = jest.fn();

jest.mock("@/lib/admin-auth", () => ({
  getAdminRequestContext: (...args: unknown[]) =>
    mockGetAdminRequestContext(...args),
}));

jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: (...args: unknown[]) => mockGetServiceSupabase(...args),
}));

function buildSupabaseMock(rows: unknown[]) {
  const result = { data: rows, error: null };
  const queryChain: Record<string, unknown> & PromiseLike<typeof result> = {
    limit: jest.fn().mockResolvedValue(result),
    order: jest.fn().mockReturnThis(),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return {
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnValue(queryChain),
      })),
    },
    queryChain,
  };
}

describe("admin tester feedback route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGetAdminRequestContext.mockResolvedValue({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
  });

  it("returns founder review buckets for admins", async () => {
    const { supabase } = buildSupabaseMock([
      {
        id: "11111111-1111-1111-1111-111111111111",
        pet_id: "pet-1",
        symptoms: "collapse",
        ai_response: {
          recommendation: "emergency_vet",
          title: "Emergency collapse",
          tester_feedback_case: {
            answers_given: {},
            case_flags: ["emergency_result"],
            created_at: "2026-04-20T13:10:00.000Z",
            feedback_status: "pending",
            negative_feedback_flag: true,
            pet_id: "pet-1",
            questions_asked: [],
            repeated_question_state: false,
            report_failed: false,
            report_id: "11111111-1111-1111-1111-111111111111",
            symptom_check_id: "11111111-1111-1111-1111-111111111111",
            symptom_input: "collapse",
            tester_user_id: "owner-1",
            urgency_result: "emergency_vet",
            cannot_assess_state: false,
          },
        },
        severity: "emergency",
        recommendation: "emergency_vet",
        created_at: "2026-04-20T13:10:00.000Z",
      },
    ]);
    mockGetServiceSupabase.mockReturnValue(supabase);

    const { GET } = await import("@/app/api/admin/tester-feedback/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.totalCases).toBe(1);
    expect(payload.emergencyCases).toHaveLength(1);
    expect(payload.latestCases[0].testerUserId).toBe("owner-1");
  });
});
