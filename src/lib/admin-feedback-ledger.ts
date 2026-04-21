import {
  buildTesterFeedbackCaseSummary,
  hasNegativeFeedbackFlags,
  parseStoredReportPayload,
  type TesterFeedbackCaseSummary,
} from "./tester-feedback";

export interface AdminFeedbackLedgerRow {
  id: string;
  pet_id: string | null;
  symptoms: string;
  ai_response: string | Record<string, unknown> | null;
  severity: string | null;
  recommendation: string | null;
  created_at: string;
}

export interface AdminFeedbackLedgerSummary {
  emergencyCases: number;
  feedbackSubmittedCases: number;
  flaggedCases: number;
  negativeFeedbackCases: number;
  noFeedbackCases: number;
  reportFailureCases: number;
  totalCases: number;
}

export interface AdminFeedbackLedgerDashboardData {
  emergencyCases: TesterFeedbackCaseSummary[];
  latestCases: TesterFeedbackCaseSummary[];
  negativeFeedbackCases: TesterFeedbackCaseSummary[];
  noFeedbackCases: TesterFeedbackCaseSummary[];
  reportFailureCases: TesterFeedbackCaseSummary[];
  summary: AdminFeedbackLedgerSummary;
}

function compareNewestFirst(
  left: TesterFeedbackCaseSummary,
  right: TesterFeedbackCaseSummary
) {
  return (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function summarizeCaseRow(row: AdminFeedbackLedgerRow) {
  const report = parseStoredReportPayload(row.ai_response);

  return buildTesterFeedbackCaseSummary({
    symptomCheckId: row.id,
    petId: row.pet_id,
    createdAt: row.created_at,
    report,
    symptoms: row.symptoms,
    recommendation: row.recommendation ?? row.severity ?? "monitor",
  });
}

function sliceNewest(
  cases: TesterFeedbackCaseSummary[],
  limit: number
): TesterFeedbackCaseSummary[] {
  return [...cases].sort(compareNewestFirst).slice(0, limit);
}

export function buildAdminFeedbackLedgerDashboardData(
  rows: AdminFeedbackLedgerRow[],
  options: {
    emergencyLimit?: number;
    latestLimit?: number;
    negativeLimit?: number;
    noFeedbackLimit?: number;
    reportFailureLimit?: number;
  } = {}
): AdminFeedbackLedgerDashboardData {
  const latestLimit = options.latestLimit ?? 12;
  const emergencyLimit = options.emergencyLimit ?? 10;
  const negativeLimit = options.negativeLimit ?? 10;
  const noFeedbackLimit = options.noFeedbackLimit ?? 10;
  const reportFailureLimit = options.reportFailureLimit ?? 10;

  const allCases = rows.map(summarizeCaseRow).sort(compareNewestFirst);
  const emergencyCases = allCases.filter((entry) => entry.emergencyCase);
  const negativeFeedbackCases = allCases.filter((entry) =>
    hasNegativeFeedbackFlags(entry.flagReasons)
  );
  const noFeedbackCases = allCases.filter(
    (entry) => entry.feedbackStatus === "pending"
  );
  const reportFailureCases = allCases.filter((entry) => entry.reportFailed);

  return {
    latestCases: sliceNewest(allCases, latestLimit),
    emergencyCases: sliceNewest(emergencyCases, emergencyLimit),
    negativeFeedbackCases: sliceNewest(negativeFeedbackCases, negativeLimit),
    noFeedbackCases: sliceNewest(noFeedbackCases, noFeedbackLimit),
    reportFailureCases: sliceNewest(reportFailureCases, reportFailureLimit),
    summary: {
      totalCases: allCases.length,
      emergencyCases: emergencyCases.length,
      feedbackSubmittedCases: allCases.filter(
        (entry) => entry.feedbackStatus !== "pending"
      ).length,
      flaggedCases: allCases.filter((entry) => entry.flagged).length,
      negativeFeedbackCases: negativeFeedbackCases.length,
      noFeedbackCases: noFeedbackCases.length,
      reportFailureCases: reportFailureCases.length,
    },
  };
}

function buildDemoCase(
  input: Partial<TesterFeedbackCaseSummary> &
    Pick<
      TesterFeedbackCaseSummary,
      "symptomCheckId" | "symptomInput" | "urgencyResult" | "createdAt"
    >
): TesterFeedbackCaseSummary {
  return {
    answerCount: input.answerCount ?? 4,
    answersGiven: input.answersGiven ?? {
      appetite: "reduced",
      duration_hours: 6,
      vomiting_frequency: "repeated",
    },
    confusingAreas: input.confusingAreas ?? [],
    createdAt: input.createdAt,
    emergencyCase: input.emergencyCase ?? input.urgencyResult === "emergency_vet",
    feedbackStatus: input.feedbackStatus ?? "pending",
    flagReasons: input.flagReasons ?? [],
    flagged: input.flagged ?? (input.flagReasons?.length ?? 0) > 0,
    helpfulness: input.helpfulness ?? null,
    knownSymptoms: input.knownSymptoms ?? [],
    negativeFeedbackFlag:
      input.negativeFeedbackFlag ?? (input.flagReasons?.length ?? 0) > 0,
    notes: input.notes ?? null,
    petId: input.petId ?? "demo-pet-1",
    questionCount: input.questionCount ?? 4,
    questionsAsked: input.questionsAsked ?? [
      { id: "q1", prompt: "How long has this been happening?" },
      { id: "q2", prompt: "Is your dog keeping water down?" },
    ],
    reportFailed: input.reportFailed ?? false,
    reportId: input.reportId ?? input.symptomCheckId,
    reportTitle: input.reportTitle ?? null,
    submittedAt: input.submittedAt ?? null,
    symptomCheckId: input.symptomCheckId,
    symptomInput: input.symptomInput,
    testerUserId: input.testerUserId ?? "demo-user-1",
    trustLevel: input.trustLevel ?? null,
    urgencyResult: input.urgencyResult,
  };
}

export function buildDemoAdminFeedbackLedgerDashboardData(): AdminFeedbackLedgerDashboardData {
  const demoCases = [
    buildDemoCase({
      symptomCheckId: "demo-check-emergency",
      symptomInput: "collapse, pale gums, trouble breathing",
      urgencyResult: "emergency_vet",
      createdAt: "2026-04-20T13:10:00.000Z",
      feedbackStatus: "flagged",
      helpfulness: "no",
      trustLevel: "no",
      confusingAreas: ["report", "wording"],
      notes: "Scary wording and the report felt wrong for how severe this looked.",
      flagReasons: [
        "emergency_result",
        "helpfulness_no",
        "trust_no",
        "confusing_wording",
        "confusing_report",
        "report_failed",
        "notes_concern_language",
      ],
      reportFailed: true,
      reportTitle: "Urgent breathing emergency",
    }),
    buildDemoCase({
      symptomCheckId: "demo-check-monitor",
      symptomInput: "mild limp after fetch",
      urgencyResult: "monitor",
      createdAt: "2026-04-20T12:40:00.000Z",
      feedbackStatus: "submitted",
      helpfulness: "yes",
      trustLevel: "yes",
      reportTitle: "Mild soft tissue strain",
    }),
    buildDemoCase({
      symptomCheckId: "demo-check-no-feedback",
      symptomInput: "ear scratching and odor",
      urgencyResult: "vet_48h",
      createdAt: "2026-04-20T11:20:00.000Z",
      feedbackStatus: "pending",
      reportTitle: "Ear irritation",
    }),
  ];

  return buildAdminFeedbackLedgerDashboardData(
    demoCases.map((entry) => ({
      id: entry.symptomCheckId,
      pet_id: entry.petId,
      symptoms: entry.symptomInput,
      ai_response: {
        recommendation: entry.urgencyResult,
        report_storage_id: entry.reportId,
        tester_feedback_case: {
          answers_given: entry.answersGiven,
          case_flags: entry.flagReasons,
          cannot_assess_state: entry.flagReasons.includes("cannot_assess_state"),
          created_at: entry.createdAt,
          feedback_status: entry.feedbackStatus,
          negative_feedback_flag: entry.negativeFeedbackFlag,
          pet_id: entry.petId,
          questions_asked: entry.questionsAsked,
          repeated_question_state: entry.flagReasons.includes("question_flow_issue"),
          report_failed: entry.reportFailed,
          report_id: entry.reportId,
          symptom_check_id: entry.symptomCheckId,
          symptom_input: entry.symptomInput,
          tester_user_id: entry.testerUserId,
          urgency_result: entry.urgencyResult,
        },
        tester_feedback:
          entry.feedbackStatus === "pending"
            ? undefined
            : {
                confusing_areas: entry.confusingAreas,
                flags: entry.flagReasons,
                helpfulness: entry.helpfulness,
                notes: entry.notes,
                submitted_at: entry.submittedAt ?? entry.createdAt,
                surface: "result_page",
                symptom_check_id: entry.symptomCheckId,
                trust_level: entry.trustLevel,
                updated_at: entry.submittedAt ?? entry.createdAt,
              },
        title: entry.reportTitle,
      },
      severity: entry.emergencyCase ? "emergency" : "low",
      recommendation: entry.urgencyResult,
      created_at: entry.createdAt,
    }))
  );
}
