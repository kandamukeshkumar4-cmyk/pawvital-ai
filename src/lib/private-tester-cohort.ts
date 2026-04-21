import type { AdminFeedbackLedgerDashboardData } from "./admin-feedback-ledger";
import type {
  PrivateTesterDashboardData,
  PrivateTesterDataSummary,
} from "./private-tester-admin";
import type { TesterFeedbackCaseSummary } from "./tester-feedback-contract";

export type PrivateTesterTriageSeverity = "P0" | "P1" | "P2" | "P3";

export interface PrivateTesterAccessIssueSummary {
  accessReason: string;
  accessDisabled: boolean;
  blocked: boolean;
  deletionRequested: boolean;
  email: string | null;
  negativeFeedbackEntries: number;
  symptomChecks: number;
  testerId: string;
}

export interface PrivateTesterTriageCase {
  caseSummary: TesterFeedbackCaseSummary;
  category: string;
  rationale: string;
  severity: PrivateTesterTriageSeverity;
}

export interface PrivateTesterCohortCommandCenter {
  filters: {
    emergencySessions: TesterFeedbackCaseSummary[];
    failedReportSessions: TesterFeedbackCaseSummary[];
    failedSignInOrAccessSessions: PrivateTesterAccessIssueSummary[];
    latestSessions: TesterFeedbackCaseSummary[];
    negativeFeedbackSessions: TesterFeedbackCaseSummary[];
    noFeedbackSessions: TesterFeedbackCaseSummary[];
    repeatedQuestionSessions: TesterFeedbackCaseSummary[];
  };
  highRiskSessions: TesterFeedbackCaseSummary[];
  notes: string[];
  summary: {
    completedSymptomChecks: number;
    dataDeletionRequests: number;
    emergencyResults: number;
    feedbackSubmitted: number;
    negativeFeedback: number;
    repeatedQuestionFlags: number;
    reportFailures: number;
    reportsOpened: number;
    signInFailures: number;
    signedInTesters: number;
    testerAccessDisabled: number;
    testersInvited: number;
  };
  triage: Record<PrivateTesterTriageSeverity, PrivateTesterTriageCase[]>;
}

function dedupeCases(
  groups: TesterFeedbackCaseSummary[][]
): TesterFeedbackCaseSummary[] {
  const casesById = new Map<string, TesterFeedbackCaseSummary>();

  for (const group of groups) {
    for (const entry of group) {
      casesById.set(entry.symptomCheckId, entry);
    }
  }

  return [...casesById.values()].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function hasQuestionFlowIssue(entry: TesterFeedbackCaseSummary) {
  return entry.flagReasons.includes("question_flow_issue");
}

function classifyCase(entry: TesterFeedbackCaseSummary): PrivateTesterTriageCase {
  if (entry.emergencyCase && entry.reportFailed) {
    return {
      caseSummary: entry,
      category: "Emergency report failure",
      rationale:
        "Emergency case with a report failure. Treat as a release-blocking founder review item.",
      severity: "P0",
    };
  }

  if (entry.emergencyCase && entry.trustLevel === "no") {
    return {
      caseSummary: entry,
      category: "Emergency low-trust result",
      rationale:
        "Emergency case where the tester did not trust the result. Requires same-day founder review.",
      severity: "P0",
    };
  }

  if (hasQuestionFlowIssue(entry)) {
    return {
      caseSummary: entry,
      category: "Repeated question / flow loop",
      rationale:
        "The stored case ledger flagged a repeated-question or clarification-loop issue.",
      severity: "P1",
    };
  }

  if (entry.reportFailed) {
    return {
      caseSummary: entry,
      category: "Report generation failure",
      rationale:
        "A private-tester report failed or feedback flagged the report path as broken.",
      severity: "P1",
    };
  }

  if (entry.flagged || entry.trustLevel === "not_sure" || entry.trustLevel === "no") {
    return {
      caseSummary: entry,
      category: "Trust or clarity concern",
      rationale:
        "Tester feedback indicates a clarity, confidence, or trust concern that should land as a follow-up ticket.",
      severity: "P2",
    };
  }

  return {
    caseSummary: entry,
    category: "Routine follow-up",
    rationale:
      "No release-blocking signal was captured. Keep this in the polish queue unless other evidence raises severity.",
    severity: "P3",
  };
}

function buildAccessIssueSummaries(
  dashboard: PrivateTesterDashboardData
): PrivateTesterAccessIssueSummary[] {
  return dashboard.testers
    .filter(
      (tester) =>
        tester.access.blocked ||
        !tester.access.allowed ||
        tester.adminState.accessDisabled ||
        tester.adminState.deletionRequested
    )
    .map((tester) => ({
      accessDisabled: tester.adminState.accessDisabled,
      accessReason: tester.adminState.accessDisabled
        ? "auth_access_disabled"
        : tester.adminState.deletionRequested
          ? "deletion_requested"
          : tester.access.reason,
      blocked: tester.access.blocked || tester.adminState.accessDisabled,
      deletionRequested: tester.adminState.deletionRequested,
      email: tester.user.email,
      negativeFeedbackEntries: tester.counts.negativeFeedbackEntries,
      symptomChecks: tester.counts.symptomChecks,
      testerId: tester.user.id,
    }));
}

function buildNotes(
  dashboard: PrivateTesterDashboardData,
  accessIssues: PrivateTesterAccessIssueSummary[]
): string[] {
  const notes = [
    "Sign-in failures and deletion-request counts remain zero until a dedicated auth/admin incident log is wired into production storage.",
    "Reports opened is derived from report-linked case rows in the founder review ledger, not browser-level analytics.",
    "The current command center is cohort-aware only when private-tester cases are present in the stored feedback ledger.",
  ];

  if (dashboard.warning) {
    notes.unshift(dashboard.warning);
  }

  if (accessIssues.length > 0) {
    notes.push(
      `${accessIssues.length} tester account(s) currently need access follow-up or are actively blocked.`
    );
  }

  const deletionRequested = dashboard.testers.filter(
    (tester) => tester.adminState.deletionRequested
  ).length;
  if (deletionRequested > 0) {
    notes.push(
      `${deletionRequested} tester account(s) are marked for deletion follow-up in admin auth metadata.`
    );
  }

  return notes;
}

export function buildPrivateTesterCohortCommandCenter(input: {
  feedbackDashboard: AdminFeedbackLedgerDashboardData;
  privateTesterDashboard: PrivateTesterDashboardData;
}): PrivateTesterCohortCommandCenter {
  const allCases = dedupeCases([
    input.feedbackDashboard.latestCases,
    input.feedbackDashboard.emergencyCases,
    input.feedbackDashboard.negativeFeedbackCases,
    input.feedbackDashboard.noFeedbackCases,
    input.feedbackDashboard.reportFailureCases,
  ]);

  const repeatedQuestionSessions = allCases.filter(hasQuestionFlowIssue);
  const highRiskSessions = allCases.filter(
    (entry) =>
      entry.emergencyCase ||
      entry.reportFailed ||
      entry.trustLevel === "no" ||
      hasQuestionFlowIssue(entry)
  );
  const triageEntries = allCases.map(classifyCase);
  const accessIssues = buildAccessIssueSummaries(input.privateTesterDashboard);

  return {
    filters: {
      emergencySessions: input.feedbackDashboard.emergencyCases,
      failedReportSessions: input.feedbackDashboard.reportFailureCases,
      failedSignInOrAccessSessions: accessIssues,
      latestSessions: input.feedbackDashboard.latestCases,
      negativeFeedbackSessions: input.feedbackDashboard.negativeFeedbackCases,
      noFeedbackSessions: input.feedbackDashboard.noFeedbackCases,
      repeatedQuestionSessions,
    },
    highRiskSessions,
    notes: buildNotes(input.privateTesterDashboard, accessIssues),
    summary: {
      completedSymptomChecks: input.privateTesterDashboard.testers.reduce(
        (total, tester) => total + tester.counts.symptomChecks,
        0
      ),
      dataDeletionRequests: input.privateTesterDashboard.summary.deletionRequested,
      emergencyResults: input.feedbackDashboard.summary.emergencyCases,
      feedbackSubmitted: input.feedbackDashboard.summary.feedbackSubmittedCases,
      negativeFeedback: input.feedbackDashboard.summary.negativeFeedbackCases,
      repeatedQuestionFlags: repeatedQuestionSessions.length,
      reportFailures: input.feedbackDashboard.summary.reportFailureCases,
      reportsOpened: allCases.filter((entry) => Boolean(entry.reportId)).length,
      signInFailures: 0,
      signedInTesters: input.privateTesterDashboard.testers.length,
      testerAccessDisabled: input.privateTesterDashboard.summary.authAccessDisabled,
      testersInvited: input.privateTesterDashboard.config.allowedEmailCount,
    },
    triage: {
      P0: triageEntries.filter((entry) => entry.severity === "P0"),
      P1: triageEntries.filter((entry) => entry.severity === "P1"),
      P2: triageEntries.filter((entry) => entry.severity === "P2"),
      P3: triageEntries.filter((entry) => entry.severity === "P3"),
    },
  };
}

export function buildPrivateTesterRegistryTemplateRows(
  testers: PrivateTesterDataSummary[]
) {
  return testers.map((tester) => ({
    access_disabled: tester.access.blocked ? "yes" : "no",
    consent_status: "manual-verify",
    deletion_requested: "manual-verify",
    device_browser: "capture-during-invite",
    dog_age: "capture-during-invite",
    dog_breed_size: "capture-during-invite",
    email: tester.user.email ?? "",
    feedback_submitted: tester.counts.outcomeFeedbackEntries > 0 ? "yes" : "no",
    first_login_timestamp: "capture-during-launch",
    first_symptom_check_timestamp: tester.recentCases.at(-1)?.createdAt ?? "",
    invite_status: tester.access.allowed ? "invited" : tester.access.blocked ? "blocked" : "not-invited",
    tester_alias: tester.user.fullName ?? tester.user.id,
  }));
}
