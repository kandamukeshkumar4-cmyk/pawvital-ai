import { buildAdminFeedbackLedgerDashboardData } from "@/lib/admin-feedback-ledger";

describe("admin feedback ledger helpers", () => {
  it("groups latest, emergency, negative, no-feedback, and report-failure cases", () => {
    const dashboard = buildAdminFeedbackLedgerDashboardData([
      {
        id: "11111111-1111-1111-1111-111111111111",
        pet_id: "pet-emergency",
        symptoms: "collapse, trouble breathing",
        ai_response: {
          recommendation: "emergency_vet",
          title: "Emergency collapse",
          tester_feedback_case: {
            answers_given: { gum_color: "pale" },
            case_flags: ["emergency_result"],
            created_at: "2026-04-20T13:10:00.000Z",
            feedback_status: "flagged",
            negative_feedback_flag: true,
            pet_id: "pet-emergency",
            questions_asked: [
              { id: "gum_color", prompt: "What color are the gums?" },
            ],
            repeated_question_state: false,
            report_failed: true,
            report_id: "11111111-1111-1111-1111-111111111111",
            symptom_check_id: "11111111-1111-1111-1111-111111111111",
            symptom_input: "collapse, trouble breathing",
            tester_user_id: "owner-emergency",
            urgency_result: "emergency_vet",
            cannot_assess_state: false,
          },
          tester_feedback: {
            confusing_areas: ["report"],
            flags: ["confusing_report", "report_failed"],
            helpfulness: "no",
            notes: "This felt wrong and scary.",
            submitted_at: "2026-04-20T13:15:00.000Z",
            symptom_check_id: "11111111-1111-1111-1111-111111111111",
            surface: "result_page",
            trust_level: "no",
            updated_at: "2026-04-20T13:15:00.000Z",
          },
        },
        severity: "emergency",
        recommendation: "emergency_vet",
        created_at: "2026-04-20T13:10:00.000Z",
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        pet_id: "pet-mild",
        symptoms: "mild limp after fetch",
        ai_response: {
          recommendation: "monitor",
          title: "Mild limp",
          tester_feedback_case: {
            answers_given: { weight_bearing: "yes" },
            case_flags: [],
            created_at: "2026-04-20T12:30:00.000Z",
            feedback_status: "submitted",
            negative_feedback_flag: false,
            pet_id: "pet-mild",
            questions_asked: [
              { id: "weight_bearing", prompt: "Can your dog walk on it?" },
            ],
            repeated_question_state: false,
            report_failed: false,
            report_id: "22222222-2222-2222-2222-222222222222",
            symptom_check_id: "22222222-2222-2222-2222-222222222222",
            symptom_input: "mild limp after fetch",
            tester_user_id: "owner-mild",
            urgency_result: "monitor",
            cannot_assess_state: false,
          },
          tester_feedback: {
            confusing_areas: [],
            flags: [],
            helpfulness: "yes",
            notes: "Clear and calm.",
            submitted_at: "2026-04-20T12:35:00.000Z",
            symptom_check_id: "22222222-2222-2222-2222-222222222222",
            surface: "result_page",
            trust_level: "yes",
            updated_at: "2026-04-20T12:35:00.000Z",
          },
        },
        severity: "low",
        recommendation: "monitor",
        created_at: "2026-04-20T12:30:00.000Z",
      },
      {
        id: "33333333-3333-3333-3333-333333333333",
        pet_id: "pet-pending",
        symptoms: "ear scratching and odor",
        ai_response: {
          recommendation: "vet_48h",
          title: "Ear irritation",
          tester_feedback_case: {
            answers_given: {},
            case_flags: [],
            created_at: "2026-04-20T11:20:00.000Z",
            feedback_status: "pending",
            negative_feedback_flag: false,
            pet_id: "pet-pending",
            questions_asked: [],
            repeated_question_state: false,
            report_failed: false,
            report_id: "33333333-3333-3333-3333-333333333333",
            symptom_check_id: "33333333-3333-3333-3333-333333333333",
            symptom_input: "ear scratching and odor",
            tester_user_id: "owner-pending",
            urgency_result: "vet_48h",
            cannot_assess_state: false,
          },
        },
        severity: "medium",
        recommendation: "vet_48h",
        created_at: "2026-04-20T11:20:00.000Z",
      },
    ]);

    expect(dashboard.summary.totalCases).toBe(3);
    expect(dashboard.latestCases).toHaveLength(3);
    expect(dashboard.emergencyCases).toHaveLength(1);
    expect(dashboard.negativeFeedbackCases).toHaveLength(1);
    expect(dashboard.noFeedbackCases).toHaveLength(1);
    expect(dashboard.reportFailureCases).toHaveLength(1);
    expect(dashboard.reportFailureCases[0].symptomCheckId).toBe(
      "11111111-1111-1111-1111-111111111111"
    );
  });
});
