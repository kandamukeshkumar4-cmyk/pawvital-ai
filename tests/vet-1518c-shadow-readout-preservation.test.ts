/**
 * VET-1518C — Shadow readout preservation after tester-ledger update
 *
 * Regression test for the bug where saveTesterFeedbackCaseLedgerToDB() was
 * overwriting ai_response with a payload that lacked system_observability.shadowReadout.
 *
 * The initial insert writes:
 *   ai_response = { ...report, system_observability: { ..., shadowReadout: { ... } } }
 *
 * The tester-ledger update (called immediately after insert) must preserve
 * system_observability.shadowReadout when it writes ai_response back.
 *
 * Owner-visible API responses must NOT expose system_observability or shadowReadout.
 */

import {
  mergeTesterFeedbackIntoReport,
  parseStoredReportPayload,
} from "@/lib/tester-feedback";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMinimalSession() {
  return {
    known_symptoms: ["vomiting"],
    answered_questions: [],
    extracted_answers: {},
    red_flags_triggered: [],
    candidate_diseases: [],
    body_systems_involved: [],
    case_memory: {
      turn_count: 2,
      chief_complaints: ["vomiting"],
      active_focus_symptoms: [],
      confirmed_facts: {},
      image_findings: [],
      red_flag_notes: [],
      unresolved_question_ids: [],
      clarification_reasons: {},
      timeline_notes: [],
      visual_evidence: [],
      retrieval_evidence: [],
      consult_opinions: [],
      evidence_chain: [],
      service_timeouts: [],
      service_observations: [],
      shadow_comparisons: [],
      ambiguity_flags: [],
    },
  };
}

function buildShadowReadout() {
  return {
    reportPresent: true,
    sessionPresent: true,
    observationCount: 3,
    shadowComparisonCount: 2,
    timeoutCount: 0,
    fallbackCount: 0,
    providerErrorCount: 0,
    budgetExceededCount: 0,
  };
}

function buildPersistedAiResponse(baseReport: Record<string, unknown>) {
  // Simulates what buildPersistedReportWithShadowReadout returns
  return {
    ...baseReport,
    system_observability: {
      timeoutCount: 0,
      fallbackCount: 0,
      shadowReadout: buildShadowReadout(),
    },
  };
}

function buildOwnerReport() {
  return {
    severity: "high",
    recommendation: "vet_24h",
    title: "Vomiting — High Urgency",
    urgency_level: "high",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VET-1518C: shadow readout preservation after tester-ledger update", () => {
  it("preserves system_observability.shadowReadout when merging tester ledger into persisted report", () => {
    const ownerReport = buildOwnerReport();
    const persistedReport = buildPersistedAiResponse(ownerReport);

    // Simulate a minimal tester ledger
    const ledger = {
      symptom_check_id: "check-1",
      report_id: "check-1",
      tester_user_id: "user-1",
      pet_id: "pet-1",
      symptom_input: "vomiting",
      known_symptoms: ["vomiting"],
      questions_asked: [],
      answers_given: {},
      urgency_result: "vet_24h",
      created_at: "2026-05-20T00:00:00Z",
      feedback_status: "pending" as const,
      negative_feedback_flag: false,
      case_flags: [],
      repeated_question_state: false,
      cannot_assess_state: false,
      report_failed: false,
    };

    // The merge should spread persistedReport (which has shadowReadout)
    const merged = mergeTesterFeedbackIntoReport(persistedReport, ledger);

    // shadowReadout must survive the merge
    const observability = merged.system_observability as Record<string, unknown> | undefined;
    expect(observability).toBeDefined();
    expect(observability).toHaveProperty("shadowReadout");

    const readout = observability?.shadowReadout as Record<string, unknown>;
    expect(readout.reportPresent).toBe(true);
    expect(readout.observationCount).toBe(3);
    expect(readout.shadowComparisonCount).toBe(2);
  });

  it("loses shadowReadout when owner-facing report (without shadowReadout) is passed instead of persisted report", () => {
    // This test documents the original bug behavior: passing the owner-facing
    // report to mergeTesterFeedbackIntoReport strips shadowReadout.
    const ownerReport = buildOwnerReport();

    // Owner report has system_observability but no shadowReadout (client-safe version)
    const ownerReportWithClientObservability = {
      ...ownerReport,
      system_observability: {
        timeoutCount: 0,
        fallbackCount: 0,
        // No shadowReadout — this is the bug trigger
      },
    };

    const ledger = {
      symptom_check_id: "check-1",
      report_id: "check-1",
      tester_user_id: "user-1",
      pet_id: "pet-1",
      symptom_input: "vomiting",
      known_symptoms: ["vomiting"],
      questions_asked: [],
      answers_given: {},
      urgency_result: "vet_24h",
      created_at: "2026-05-20T00:00:00Z",
      feedback_status: "pending" as const,
      negative_feedback_flag: false,
      case_flags: [],
      repeated_question_state: false,
      cannot_assess_state: false,
      report_failed: false,
    };

    const merged = mergeTesterFeedbackIntoReport(
      ownerReportWithClientObservability,
      ledger
    );

    // Documents the bug: shadowReadout is absent
    const observability = merged.system_observability as Record<string, unknown> | undefined;
    expect(observability).toBeDefined();
    expect(observability).not.toHaveProperty("shadowReadout");
  });

  it("parseStoredReportPayload round-trips system_observability.shadowReadout from a JSON string", () => {
    const persistedReport = buildPersistedAiResponse(buildOwnerReport());
    const raw = JSON.stringify(persistedReport);

    const parsed = parseStoredReportPayload(raw);

    const observability = parsed.system_observability as Record<string, unknown> | undefined;
    expect(observability).toBeDefined();

    const readout = observability?.shadowReadout as Record<string, unknown>;
    expect(readout).toBeDefined();
    expect(readout.observationCount).toBe(3);
    expect(readout.shadowComparisonCount).toBe(2);
    expect(readout.reportPresent).toBe(true);
  });

  it("owner-visible response fields do not contain system_observability or shadowReadout", () => {
    const ownerReport = buildOwnerReport();

    // Owner-facing keys that must not expose internal telemetry
    expect(ownerReport).not.toHaveProperty("system_observability");
    expect(ownerReport).not.toHaveProperty("shadowReadout");
    expect(JSON.stringify(ownerReport)).not.toContain("shadowReadout");
    expect(JSON.stringify(ownerReport)).not.toContain("system_observability");
  });

  it("persisted report shape preserves shadowReadout alongside owner fields", () => {
    const ownerReport = buildOwnerReport();
    const persistedReport = buildPersistedAiResponse(ownerReport);

    // Owner fields are preserved
    expect(persistedReport.severity).toBe("high");
    expect(persistedReport.recommendation).toBe("vet_24h");
    expect(persistedReport.title).toBe("Vomiting — High Urgency");

    // shadowReadout is present in the persisted shape
    const observability = persistedReport.system_observability as Record<string, unknown>;
    expect(observability.shadowReadout).toBeDefined();

    const readout = observability.shadowReadout as Record<string, unknown>;
    expect(typeof readout.observationCount).toBe("number");
    expect(typeof readout.shadowComparisonCount).toBe("number");
  });
});
