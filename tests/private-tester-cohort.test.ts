import { buildPrivateTesterCohortCommandCenter } from "@/lib/private-tester-cohort";
import type { AdminFeedbackLedgerDashboardData } from "@/lib/admin-feedback-ledger";
import type { PrivateTesterDashboardData } from "@/lib/private-tester-admin";

function buildPrivateTesterDashboard(): PrivateTesterDashboardData {
  return {
    config: {
      allowedEmailCount: 5,
      allowedEmails: ["alpha@example.com", "beta@example.com"],
      blockedEmailCount: 1,
      blockedEmails: ["blocked@example.com"],
      freeAccess: true,
      guestSymptomChecker: false,
      inviteOnly: true,
      modeEnabled: true,
    },
    summary: {
      active: 2,
      authAccessDisabled: 1,
      blocked: 1,
      deletionRequested: 1,
      negativeFeedbackEntries: 2,
      symptomChecks: 4,
      total: 3,
    },
    testers: [
      {
        access: {
          allowed: true,
          blocked: false,
          email: "alpha@example.com",
          freeAccess: true,
          guestSymptomChecker: false,
          inviteOnly: true,
          modeEnabled: true,
          reason: "allowlisted_email",
        },
        adminState: {
          accessDisabled: false,
          accessDisabledAt: null,
          auditLog: [],
          deletionRequested: false,
          deletionRequestedAt: null,
        },
        config: {
          allowedEmailCount: 5,
          allowedEmails: ["alpha@example.com", "beta@example.com"],
          blockedEmailCount: 1,
          blockedEmails: ["blocked@example.com"],
          freeAccess: true,
          guestSymptomChecker: false,
          inviteOnly: true,
          modeEnabled: true,
        },
        counts: {
          caseOutcomes: 0,
          journalEntries: 0,
          negativeFeedbackEntries: 1,
          notifications: 0,
          outcomeFeedbackEntries: 1,
          pets: 1,
          sharedReports: 0,
          subscriptions: 0,
          symptomChecks: 2,
          thresholdProposals: 0,
        },
        recentCases: [],
        user: {
          email: "alpha@example.com",
          fullName: "Alpha",
          id: "tester-1",
        },
      },
      {
        access: {
          allowed: false,
          blocked: true,
          email: "blocked@example.com",
          freeAccess: true,
          guestSymptomChecker: false,
          inviteOnly: true,
          modeEnabled: true,
          reason: "blocked_email",
        },
        adminState: {
          accessDisabled: true,
          accessDisabledAt: "2026-04-21T09:10:00.000Z",
          auditLog: [
            {
              action: "disable_access" as const,
              actorEmail: "admin@pawvital.ai",
              at: "2026-04-21T09:10:00.000Z",
              note: null,
            },
            {
              action: "mark_deletion" as const,
              actorEmail: "admin@pawvital.ai",
              at: "2026-04-21T09:11:00.000Z",
              note: null,
            },
          ],
          deletionRequested: true,
          deletionRequestedAt: "2026-04-21T09:11:00.000Z",
        },
        config: {
          allowedEmailCount: 5,
          allowedEmails: ["alpha@example.com", "beta@example.com"],
          blockedEmailCount: 1,
          blockedEmails: ["blocked@example.com"],
          freeAccess: true,
          guestSymptomChecker: false,
          inviteOnly: true,
          modeEnabled: true,
        },
        counts: {
          caseOutcomes: 0,
          journalEntries: 0,
          negativeFeedbackEntries: 1,
          notifications: 0,
          outcomeFeedbackEntries: 0,
          pets: 1,
          sharedReports: 0,
          subscriptions: 0,
          symptomChecks: 2,
          thresholdProposals: 0,
        },
        recentCases: [],
        user: {
          email: "blocked@example.com",
          fullName: "Blocked",
          id: "tester-2",
        },
      },
    ],
    warning: undefined,
  };
}

function buildFeedbackDashboard(): AdminFeedbackLedgerDashboardData {
  const emergencyCase = {
    answerCount: 2,
    answersGiven: { gum_color: "pale" },
    confusingAreas: ["report"],
    createdAt: "2026-04-21T10:00:00.000Z",
    emergencyCase: true,
    feedbackStatus: "flagged" as const,
    flagged: true,
    flagReasons: ["emergency_result", "report_failed"],
    helpfulness: "no" as const,
    knownSymptoms: ["collapse"],
    negativeFeedbackFlag: true,
    notes: "This emergency report failed.",
    petId: "pet-1",
    questionCount: 2,
    questionsAsked: [],
    reportFailed: true,
    reportId: "report-1",
    reportTitle: "Emergency collapse",
    submittedAt: "2026-04-21T10:05:00.000Z",
    symptomCheckId: "case-1",
    symptomInput: "collapse and pale gums",
    testerUserId: "tester-1",
    trustLevel: "no" as const,
    urgencyResult: "emergency_vet",
  };

  const repeatedQuestionCase = {
    answerCount: 1,
    answersGiven: { appetite: "decreased" },
    confusingAreas: ["questions"],
    createdAt: "2026-04-21T09:00:00.000Z",
    emergencyCase: false,
    feedbackStatus: "flagged" as const,
    flagged: true,
    flagReasons: ["question_flow_issue", "confusing_questions"],
    helpfulness: "somewhat" as const,
    knownSymptoms: ["itching"],
    negativeFeedbackFlag: true,
    notes: "It asked me the same thing twice.",
    petId: "pet-2",
    questionCount: 2,
    questionsAsked: [],
    reportFailed: false,
    reportId: "report-2",
    reportTitle: "Itching follow-up",
    submittedAt: "2026-04-21T09:05:00.000Z",
    symptomCheckId: "case-2",
    symptomInput: "itching but eating normally",
    testerUserId: "tester-2",
    trustLevel: "not_sure" as const,
    urgencyResult: "vet_48h",
  };

  const mildCase = {
    answerCount: 1,
    answersGiven: { weight_bearing: "yes" },
    confusingAreas: [],
    createdAt: "2026-04-21T08:00:00.000Z",
    emergencyCase: false,
    feedbackStatus: "submitted" as const,
    flagged: false,
    flagReasons: [],
    helpfulness: "yes" as const,
    knownSymptoms: ["limping"],
    negativeFeedbackFlag: false,
    notes: "Clear and calm.",
    petId: "pet-3",
    questionCount: 1,
    questionsAsked: [],
    reportFailed: false,
    reportId: "report-3",
    reportTitle: "Mild limp",
    submittedAt: "2026-04-21T08:05:00.000Z",
    symptomCheckId: "case-3",
    symptomInput: "mild limp after playing",
    testerUserId: "tester-1",
    trustLevel: "yes" as const,
    urgencyResult: "monitor",
  };

  return {
    emergencyCases: [emergencyCase],
    latestCases: [emergencyCase, repeatedQuestionCase, mildCase],
    negativeFeedbackCases: [emergencyCase, repeatedQuestionCase],
    noFeedbackCases: [],
    reportFailureCases: [emergencyCase],
    summary: {
      emergencyCases: 1,
      feedbackSubmittedCases: 3,
      flaggedCases: 2,
      negativeFeedbackCases: 2,
      noFeedbackCases: 0,
      reportFailureCases: 1,
      totalCases: 3,
    },
  };
}

describe("private tester cohort command center helpers", () => {
  it("builds command-center summaries, access issues, and triage buckets", () => {
    const dashboard = buildPrivateTesterCohortCommandCenter({
      feedbackDashboard: buildFeedbackDashboard(),
      privateTesterDashboard: buildPrivateTesterDashboard(),
    });

    expect(dashboard.summary).toMatchObject({
      completedSymptomChecks: 4,
      dataDeletionRequests: 1,
      emergencyResults: 1,
      feedbackSubmitted: 3,
      negativeFeedback: 2,
      repeatedQuestionFlags: 1,
      reportFailures: 1,
      reportsOpened: 3,
      signedInTesters: 2,
      testerAccessDisabled: 1,
      testersInvited: 5,
    });
    expect(dashboard.filters.failedSignInOrAccessSessions).toEqual([
      expect.objectContaining({
        accessDisabled: true,
        blocked: true,
        deletionRequested: true,
        email: "blocked@example.com",
      }),
    ]);
    expect(dashboard.highRiskSessions).toHaveLength(2);
    expect(dashboard.triage.P0).toHaveLength(1);
    expect(dashboard.triage.P1).toHaveLength(1);
    expect(dashboard.triage.P3).toHaveLength(1);
  });
});
