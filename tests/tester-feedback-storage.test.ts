const mockGetServiceSupabase = jest.fn();

jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: (...args: unknown[]) => mockGetServiceSupabase(...args),
}));

interface MutableSymptomCheckRow {
  ai_response: string | Record<string, unknown> | null;
  created_at: string;
  id: string;
  pet_id: string | null;
  recommendation: string | null;
  severity: string | null;
  symptoms: string;
}

function createSupabaseMock(row: MutableSymptomCheckRow) {
  const petQuery = {
    data: row.pet_id ? [{ id: row.pet_id }] : [],
    error: null,
    eq() {
      return petQuery;
    },
  };

  const symptomSelectQuery = {
    data: [row],
    error: null,
    eq() {
      return symptomSelectQuery;
    },
    in() {
      return symptomSelectQuery;
    },
    order() {
      return symptomSelectQuery;
    },
  };

  const symptomUpdateQuery = {
    data: null,
    error: null,
    eq() {
      return symptomUpdateQuery;
    },
  };

  return {
    from(table: string) {
      if (table === "pets") {
        return {
          select() {
            return petQuery;
          },
        };
      }

      if (table === "symptom_checks") {
        return {
          select() {
            return symptomSelectQuery;
          },
          update(payload: { ai_response: string }) {
            row.ai_response = payload.ai_response;
            return symptomUpdateQuery;
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("tester feedback storage", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("persists negative feedback into the saved report so founder review can query it", async () => {
    const row: MutableSymptomCheckRow = {
      id: "11111111-1111-1111-1111-111111111111",
      pet_id: "pet-1",
      symptoms: "Repeated vomiting with pale gums",
      ai_response: JSON.stringify({
        recommendation: "emergency_vet",
        title: "Emergency vomiting case",
      }),
      severity: "emergency",
      recommendation: "emergency_vet",
      created_at: "2026-04-20T12:00:00.000Z",
    };

    mockGetServiceSupabase.mockReturnValue(createSupabaseMock(row));

    const { buildAdminFeedbackLedgerDashboardData } = await import(
      "@/lib/admin-feedback-ledger"
    );
    const { saveTesterFeedbackToDB } = await import(
      "@/lib/tester-feedback-storage"
    );

    const result = await saveTesterFeedbackToDB({
      userId: "owner-1",
      feedback: {
        symptomCheckId: row.id,
        helpfulness: "no",
        confusingAreas: ["report"],
        trustLevel: "not_sure",
        notes: "The wording felt scary for how urgent this looked.",
        surface: "history_page",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.caseSummary).toEqual(
      expect.objectContaining({
        feedbackStatus: "flagged",
        flagged: true,
        negativeFeedbackFlag: true,
        reportFailed: true,
        trustLevel: "not_sure",
      }),
    );
    expect(result.caseSummary?.flagReasons).toEqual(
      expect.arrayContaining([
        "emergency_result",
        "helpfulness_no",
        "trust_not_sure",
        "confusing_report",
        "report_failed",
        "notes_concern_language",
      ]),
    );

    const persistedReport = JSON.parse(String(row.ai_response)) as {
      tester_feedback?: {
        helpfulness?: string;
        notes?: string | null;
        surface?: string;
      };
      tester_feedback_case?: {
        feedback_status?: string;
        negative_feedback_flag?: boolean;
      };
    };

    expect(persistedReport.tester_feedback_case).toEqual(
      expect.objectContaining({
        feedback_status: "flagged",
        negative_feedback_flag: true,
      }),
    );
    expect(persistedReport.tester_feedback).toEqual(
      expect.objectContaining({
        helpfulness: "no",
        notes: "The wording felt scary for how urgent this looked.",
        surface: "history_page",
      }),
    );

    const founderDashboard = buildAdminFeedbackLedgerDashboardData([row]);

    expect(founderDashboard.negativeFeedbackCases).toHaveLength(1);
    expect(founderDashboard.negativeFeedbackCases[0]).toEqual(
      expect.objectContaining({
        symptomCheckId: row.id,
        feedbackStatus: "flagged",
        flagged: true,
        notes: "The wording felt scary for how urgent this looked.",
      }),
    );
  });
});
