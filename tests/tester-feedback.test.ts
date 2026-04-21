import type { TriageSession } from "@/lib/triage-engine";
import {
  buildTesterFeedbackCaseLedger,
  buildTesterFeedbackFlags,
  buildTesterFeedbackRecord,
  buildTesterFeedbackCaseSummary,
  mergeTesterFeedbackIntoReport,
  updateLedgerAfterFeedback,
} from "@/lib/tester-feedback";

const BASE_SESSION: TriageSession = {
  known_symptoms: ["vomiting", "lethargy"],
  answered_questions: ["vomit_frequency", "gum_color"],
  extracted_answers: {
    vomit_frequency: "repeated",
    gum_color: "pale",
  },
  red_flags_triggered: [],
  candidate_diseases: [],
  body_systems_involved: [],
  case_memory: {
    turn_count: 4,
    chief_complaints: ["vomiting", "lethargy"],
    active_focus_symptoms: ["vomiting", "lethargy"],
    confirmed_facts: {},
    image_findings: [],
    red_flag_notes: [],
    unresolved_question_ids: ["vomit_frequency"],
    clarification_reasons: {
      vomit_frequency: "needed more detail",
    },
    timeline_notes: [],
    visual_evidence: [],
    retrieval_evidence: [],
    consult_opinions: [],
    evidence_chain: [],
    service_timeouts: [],
    service_observations: [],
    shadow_comparisons: [],
    ambiguity_flags: ["question_loop"],
    latest_owner_turn: "He keeps vomiting and looks weak.",
  },
};

describe("tester feedback helpers", () => {
  it("flags emergency and confusing feedback for founder review", () => {
    const ledger = buildTesterFeedbackCaseLedger({
      symptomCheckId: "11111111-1111-1111-1111-111111111111",
      verifiedUserId: "owner-1",
      petId: "pet-1",
      session: BASE_SESSION,
      pet: {
        id: "pet-1",
        name: "Maple",
        breed: "Labrador Retriever",
        age_years: 6,
        weight: 58,
      },
      report: {
        severity: "emergency",
        recommendation: "emergency_vet",
        title: "Emergency vomiting case",
      },
      createdAt: "2026-04-20T12:00:00.000Z",
    });

    expect(ledger.case_flags).toEqual(
      expect.arrayContaining(["emergency_result", "question_flow_issue"])
    );

    const flags = buildTesterFeedbackFlags({
      feedback: {
        symptomCheckId: ledger.symptom_check_id,
        helpfulness: "no",
        confusingAreas: ["wording"],
        trustLevel: "not_sure",
        notes: "The wording felt too vague for an emergency.",
      },
      ledger,
    });

    expect(flags).toEqual(
      expect.arrayContaining([
        "helpfulness_no",
        "trust_not_sure",
        "confusing_wording",
        "emergency_result",
        "question_flow_issue",
      ])
    );
  });

  it("keeps mild feedback queryable without negative flags", () => {
    const session: TriageSession = {
      ...BASE_SESSION,
      known_symptoms: ["limping"],
      answered_questions: ["weight_bearing"],
      extracted_answers: {
        weight_bearing: "yes",
      },
      case_memory: {
        ...BASE_SESSION.case_memory!,
        unresolved_question_ids: [],
        clarification_reasons: {},
        ambiguity_flags: [],
        latest_owner_turn: "Mild limp after playing fetch, but still walking.",
      },
    };

    const ledger = buildTesterFeedbackCaseLedger({
      symptomCheckId: "22222222-2222-2222-2222-222222222222",
      verifiedUserId: "owner-2",
      petId: "pet-2",
      session,
      pet: {
        id: "pet-2",
        name: "Scout",
        breed: "Border Collie",
        age_years: 4,
        weight: 42,
      },
      report: {
        severity: "low",
        recommendation: "monitor",
        title: "Mild limp after activity",
      },
      createdAt: "2026-04-20T12:30:00.000Z",
    });

    const feedback = buildTesterFeedbackRecord(
      {
        symptomCheckId: ledger.symptom_check_id,
        helpfulness: "yes",
        confusingAreas: [],
        trustLevel: "yes",
        notes: "Clear and calm.",
      },
      ledger,
      "2026-04-20T12:35:00.000Z"
    );
    const updatedLedger = updateLedgerAfterFeedback(ledger, feedback);
    const persistedReport = mergeTesterFeedbackIntoReport(
      {
        title: "Mild limp after activity",
        recommendation: "monitor",
      },
      updatedLedger,
      feedback
    );
    const summary = buildTesterFeedbackCaseSummary({
      symptomCheckId: ledger.symptom_check_id,
      petId: "pet-2",
      createdAt: "2026-04-20T12:30:00.000Z",
      report: persistedReport,
      symptoms: "limping",
      recommendation: "monitor",
    });

    expect(updatedLedger.feedback_status).toBe("submitted");
    expect(summary.flagged).toBe(false);
    expect(summary.helpfulness).toBe("yes");
    expect(summary.trustLevel).toBe("yes");
    expect(summary.questionCount).toBe(1);
    expect(summary.answerCount).toBe(1);
  });
});
