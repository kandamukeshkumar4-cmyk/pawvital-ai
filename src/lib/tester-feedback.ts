import { FOLLOW_UP_QUESTIONS } from "./clinical-matrix";
import {
  TESTER_FEEDBACK_CONFUSING_AREA_VALUES,
  TESTER_FEEDBACK_FLAG_VALUES,
  TESTER_FEEDBACK_HELPFULNESS_VALUES,
  TESTER_FEEDBACK_NEGATIVE_FLAG_VALUES,
  TESTER_FEEDBACK_STATUS_VALUES,
  TESTER_FEEDBACK_SURFACE_VALUES,
  TESTER_FEEDBACK_TRUST_VALUES,
  type TesterFeedbackAskedQuestion,
  type TesterFeedbackCaseLedger,
  type TesterFeedbackCaseSummary,
  type TesterFeedbackConfusingArea,
  type TesterFeedbackFlag,
  type TesterFeedbackHelpfulness,
  type TesterFeedbackRecord,
  type TesterFeedbackStatus,
  type TesterFeedbackSubmissionInput,
  type TesterFeedbackSurface,
  type TesterFeedbackTrustLevel,
} from "./tester-feedback-contract";
import type { PetProfile, TriageSession } from "./triage-engine";

export {
  TESTER_FEEDBACK_CONFUSING_AREA_VALUES,
  TESTER_FEEDBACK_FLAG_VALUES,
  TESTER_FEEDBACK_HELPFULNESS_VALUES,
  TESTER_FEEDBACK_NEGATIVE_FLAG_VALUES,
  TESTER_FEEDBACK_STATUS_VALUES,
  TESTER_FEEDBACK_SURFACE_VALUES,
  TESTER_FEEDBACK_TRUST_VALUES,
} from "./tester-feedback-contract";
export type {
  TesterFeedbackAskedQuestion,
  TesterFeedbackCaseLedger,
  TesterFeedbackCaseSummary,
  TesterFeedbackConfusingArea,
  TesterFeedbackFlag,
  TesterFeedbackHelpfulness,
  TesterFeedbackRecord,
  TesterFeedbackStatus,
  TesterFeedbackSubmissionInput,
  TesterFeedbackSurface,
  TesterFeedbackTrustLevel,
} from "./tester-feedback-contract";

export interface BuildTesterCaseLedgerInput {
  symptomCheckId: string;
  verifiedUserId?: string | null;
  petId?: string | null;
  session: TriageSession;
  pet: PetProfile;
  report: Record<string, unknown>;
  createdAt?: string;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const allowedSet = new Set(allowed);
  return value.filter(
    (item): item is T =>
      typeof item === "string" && allowedSet.has(item as T)
  );
}

function asLooseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function dedupeFlags(flags: Array<TesterFeedbackFlag | null | undefined>) {
  return Array.from(
    new Set(flags.filter((flag): flag is TesterFeedbackFlag => Boolean(flag)))
  );
}

function deriveSymptomInput(session: TriageSession, pet: PetProfile): string {
  const latestOwnerTurn = asString(session.case_memory?.latest_owner_turn);
  if (latestOwnerTurn) {
    return latestOwnerTurn;
  }

  if ((session.case_memory?.chief_complaints?.length ?? 0) > 0) {
    return session.case_memory!.chief_complaints.join(", ");
  }

  if (session.known_symptoms.length > 0) {
    return session.known_symptoms.join(", ");
  }

  return `${pet.name || "Dog"} symptom check`;
}

function buildAskedQuestions(session: TriageSession): TesterFeedbackAskedQuestion[] {
  return (session.answered_questions ?? []).map((questionId) => ({
    id: questionId,
    prompt: FOLLOW_UP_QUESTIONS[questionId]?.question_text ?? questionId,
  }));
}

export function buildTesterFeedbackFlags(input: {
  feedback: TesterFeedbackSubmissionInput;
  ledger: Pick<
    TesterFeedbackCaseLedger,
    "case_flags" | "repeated_question_state" | "cannot_assess_state" | "report_failed"
  >;
}): TesterFeedbackFlag[] {
  const confusingFlags = input.feedback.confusingAreas.map((area) => {
    switch (area) {
      case "questions":
        return "confusing_questions";
      case "result":
        return "confusing_result";
      case "wording":
        return "confusing_wording";
      case "next_steps":
        return "confusing_next_steps";
      case "report":
        return "confusing_report";
      default:
        return "confusing_other";
    }
  });

  return dedupeFlags([
    input.feedback.helpfulness === "no" ? "helpfulness_no" : null,
    input.feedback.trustLevel === "not_sure" ? "trust_not_sure" : null,
    input.feedback.trustLevel === "no" ? "trust_no" : null,
    ...confusingFlags,
    ...input.ledger.case_flags,
    input.ledger.report_failed ? "report_failed" : null,
    input.ledger.repeated_question_state ? "question_flow_issue" : null,
    input.ledger.cannot_assess_state ? "cannot_assess_state" : null,
  ]);
}

export function buildTesterFeedbackRecord(
  input: TesterFeedbackSubmissionInput,
  ledger: TesterFeedbackCaseLedger,
  now = new Date().toISOString()
): TesterFeedbackRecord {
  const flags = buildTesterFeedbackFlags({
    feedback: input,
    ledger,
  });

  return {
    symptom_check_id: input.symptomCheckId,
    helpfulness: input.helpfulness,
    confusing_areas: input.confusingAreas,
    trust_level: input.trustLevel,
    notes: asString(input.notes) ?? null,
    surface: input.surface ?? "result_page",
    flags,
    submitted_at: ledger.feedback_submitted_at ?? now,
    updated_at: now,
  };
}

export function buildTesterFeedbackCaseLedger(
  input: BuildTesterCaseLedgerInput
): TesterFeedbackCaseLedger {
  const recommendation = asString(input.report.recommendation) ?? "monitor";
  const severity = asString(input.report.severity);
  const ambiguityFlags = input.session.case_memory?.ambiguity_flags ?? [];
  const repeatedQuestionState =
    (input.session.case_memory?.unresolved_question_ids?.length ?? 0) > 0 ||
    Object.keys(input.session.case_memory?.clarification_reasons ?? {}).length > 0 ||
    ambiguityFlags.length > 0;
  const cannotAssessState = ambiguityFlags.some((flag) =>
    flag.toLowerCase().includes("cannot_assess")
  );

  const caseFlags = dedupeFlags([
    recommendation === "emergency_vet" || severity === "emergency"
      ? "emergency_result"
      : null,
    repeatedQuestionState ? "question_flow_issue" : null,
    cannotAssessState ? "cannot_assess_state" : null,
  ]);

  return {
    symptom_check_id: input.symptomCheckId,
    report_id: input.symptomCheckId,
    tester_user_id: input.verifiedUserId ?? null,
    pet_id: input.petId ?? null,
    symptom_input: deriveSymptomInput(input.session, input.pet),
    known_symptoms: [...(input.session.known_symptoms ?? [])],
    questions_asked: buildAskedQuestions(input.session),
    answers_given: { ...(input.session.extracted_answers ?? {}) },
    urgency_result: recommendation,
    created_at: input.createdAt ?? new Date().toISOString(),
    feedback_status: "pending",
    case_flags: caseFlags,
    repeated_question_state: repeatedQuestionState,
    cannot_assess_state: cannotAssessState,
    report_failed: false,
  };
}

export function updateLedgerAfterFeedback(
  ledger: TesterFeedbackCaseLedger,
  feedback: TesterFeedbackRecord
): TesterFeedbackCaseLedger {
  return {
    ...ledger,
    feedback_status: feedback.flags.length > 0 ? "flagged" : "submitted",
    feedback_submitted_at: feedback.updated_at,
    case_flags: dedupeFlags([...ledger.case_flags, ...feedback.flags]),
  };
}

export function mergeTesterFeedbackIntoReport(
  report: Record<string, unknown>,
  ledger: TesterFeedbackCaseLedger,
  feedback?: TesterFeedbackRecord
): Record<string, unknown> {
  return {
    ...report,
    report_storage_id: ledger.report_id,
    outcome_feedback_enabled: true,
    tester_feedback_case: ledger,
    ...(feedback ? { tester_feedback: feedback } : {}),
  };
}

export function parseStoredReportPayload(
  raw: string | Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return asRecord(parsed) ?? {};
    } catch {
      return {};
    }
  }
  return asRecord(raw) ?? {};
}

export function parseStoredTesterFeedbackCase(
  report: Record<string, unknown>,
  symptomCheckId: string,
  createdAt: string,
  fallback: {
    petId: string | null;
    symptoms: string;
    recommendation: string;
  }
): TesterFeedbackCaseLedger {
  const rawLedger = asRecord(report.tester_feedback_case);
  if (rawLedger) {
    return {
      symptom_check_id:
        asString(rawLedger.symptom_check_id) ?? symptomCheckId,
      report_id: asString(rawLedger.report_id) ?? symptomCheckId,
      tester_user_id: asString(rawLedger.tester_user_id),
      pet_id: asString(rawLedger.pet_id) ?? fallback.petId,
      symptom_input:
        asString(rawLedger.symptom_input) ?? fallback.symptoms,
      known_symptoms: asLooseStringArray(rawLedger.known_symptoms),
      questions_asked: Array.isArray(rawLedger.questions_asked)
        ? rawLedger.questions_asked
            .map((entry) => {
              const question = asRecord(entry);
              if (!question) return null;
              const id = asString(question.id);
              const prompt = asString(question.prompt);
              if (!id || !prompt) return null;
              return { id, prompt };
            })
            .filter(
              (
                entry
              ): entry is TesterFeedbackAskedQuestion => entry !== null
            )
        : [],
      answers_given: (asRecord(rawLedger.answers_given) ?? {}) as Record<
        string,
        string | boolean | number
      >,
      urgency_result:
        asString(rawLedger.urgency_result) ?? fallback.recommendation,
      created_at: asString(rawLedger.created_at) ?? createdAt,
      feedback_status: TESTER_FEEDBACK_STATUS_VALUES.includes(
        (asString(rawLedger.feedback_status) ?? "pending") as TesterFeedbackStatus
      )
        ? ((asString(rawLedger.feedback_status) ?? "pending") as TesterFeedbackStatus)
        : "pending",
      case_flags: asStringArray(
        rawLedger.case_flags,
        TESTER_FEEDBACK_FLAG_VALUES
      ),
      repeated_question_state: rawLedger.repeated_question_state === true,
      cannot_assess_state: rawLedger.cannot_assess_state === true,
      report_failed: rawLedger.report_failed === true,
      feedback_submitted_at: asString(rawLedger.feedback_submitted_at) ?? undefined,
    };
  }

  const emergencyFlag: TesterFeedbackFlag[] =
    fallback.recommendation === "emergency_vet" ||
    fallback.recommendation === "emergency"
      ? ["emergency_result"]
      : [];

  return {
    symptom_check_id: symptomCheckId,
    report_id: symptomCheckId,
    tester_user_id: null,
    pet_id: fallback.petId,
    symptom_input: fallback.symptoms,
    known_symptoms: [],
    questions_asked: [],
    answers_given: {},
    urgency_result: fallback.recommendation,
    created_at: createdAt,
    feedback_status: "pending",
    case_flags: emergencyFlag,
    repeated_question_state: false,
    cannot_assess_state: false,
    report_failed: false,
  };
}

export function parseStoredTesterFeedback(
  report: Record<string, unknown>,
  symptomCheckId: string
): TesterFeedbackRecord | null {
  const rawFeedback = asRecord(report.tester_feedback);
  if (!rawFeedback) {
    return null;
  }

  const helpfulness = asString(rawFeedback.helpfulness);
  const trustLevel = asString(rawFeedback.trust_level);
  const surface = asString(rawFeedback.surface);
  const submittedAt = asString(rawFeedback.submitted_at);
  const updatedAt = asString(rawFeedback.updated_at);

  if (
    !helpfulness ||
    !TESTER_FEEDBACK_HELPFULNESS_VALUES.includes(
      helpfulness as TesterFeedbackHelpfulness
    ) ||
    !trustLevel ||
    !TESTER_FEEDBACK_TRUST_VALUES.includes(trustLevel as TesterFeedbackTrustLevel)
  ) {
    return null;
  }

  return {
    symptom_check_id: asString(rawFeedback.symptom_check_id) ?? symptomCheckId,
    helpfulness: helpfulness as TesterFeedbackHelpfulness,
    confusing_areas: asStringArray(
      rawFeedback.confusing_areas,
      TESTER_FEEDBACK_CONFUSING_AREA_VALUES
    ),
    trust_level: trustLevel as TesterFeedbackTrustLevel,
    notes: asString(rawFeedback.notes) ?? null,
    surface:
      surface &&
      TESTER_FEEDBACK_SURFACE_VALUES.includes(surface as TesterFeedbackSurface)
        ? (surface as TesterFeedbackSurface)
        : "result_page",
    flags: asStringArray(rawFeedback.flags, TESTER_FEEDBACK_FLAG_VALUES),
    submitted_at: submittedAt ?? new Date(0).toISOString(),
    updated_at: updatedAt ?? submittedAt ?? new Date(0).toISOString(),
  };
}

export function buildTesterFeedbackCaseSummary(input: {
  symptomCheckId: string;
  petId: string | null;
  createdAt: string;
  report: Record<string, unknown>;
  symptoms: string;
  recommendation: string;
}): TesterFeedbackCaseSummary {
  const ledger = parseStoredTesterFeedbackCase(
    input.report,
    input.symptomCheckId,
    input.createdAt,
    {
      petId: input.petId,
      symptoms: input.symptoms,
      recommendation: input.recommendation,
    }
  );
  const feedback = parseStoredTesterFeedback(input.report, input.symptomCheckId);
  const flagReasons = dedupeFlags([
    ...ledger.case_flags,
    ...(feedback?.flags ?? []),
  ]);

  return {
    symptomCheckId: ledger.symptom_check_id,
    reportId: ledger.report_id,
    testerUserId: ledger.tester_user_id,
    petId: ledger.pet_id,
    reportTitle: asString(input.report.title),
    symptomInput: ledger.symptom_input,
    knownSymptoms: ledger.known_symptoms,
    urgencyResult: ledger.urgency_result,
    createdAt: ledger.created_at,
    feedbackStatus: ledger.feedback_status,
    flagged: flagReasons.length > 0,
    flagReasons,
    helpfulness: feedback?.helpfulness ?? null,
    confusingAreas: feedback?.confusing_areas ?? [],
    trustLevel: feedback?.trust_level ?? null,
    notes: feedback?.notes ?? null,
    submittedAt: feedback?.updated_at ?? null,
    questionCount: ledger.questions_asked.length,
    answerCount: Object.keys(ledger.answers_given).length,
  };
}
