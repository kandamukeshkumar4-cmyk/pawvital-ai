import type {
  PrivateTesterDashboardData,
  PrivateTesterDataSummary,
  PrivateTesterDeleteResult,
  PrivateTesterRecentCase,
} from "./private-tester-admin";

function sanitizeRecentCaseCreatedAt(createdAt: string | null) {
  if (typeof createdAt !== "string") {
    return null;
  }

  const [day] = createdAt.trim().split("T");
  return day?.trim() || null;
}

function sanitizeRecentCase(
  recentCase: PrivateTesterRecentCase,
  index: number
): PrivateTesterRecentCase {
  return {
    createdAt: sanitizeRecentCaseCreatedAt(recentCase.createdAt),
    negativeFeedbackFlagged: recentCase.negativeFeedbackFlagged === true,
    petName: null,
    recommendation: null,
    severity:
      typeof recentCase.severity === "string" ? recentCase.severity : null,
    symptomCheckId: `case-${index + 1}`,
  };
}

export function sanitizePrivateTesterDataSummary(
  summary: PrivateTesterDataSummary
): PrivateTesterDataSummary {
  return {
    access: {
      allowed: summary.access.allowed,
      blocked: summary.access.blocked,
      email: summary.access.email,
      freeAccess: summary.access.freeAccess,
      guestSymptomChecker: summary.access.guestSymptomChecker,
      inviteOnly: summary.access.inviteOnly,
      modeEnabled: summary.access.modeEnabled,
      reason: summary.access.reason,
    },
    config: {
      allowedEmailCount: summary.config.allowedEmailCount,
      allowedEmails: [...(summary.config.allowedEmails ?? [])],
      blockedEmailCount: summary.config.blockedEmailCount,
      blockedEmails: [...(summary.config.blockedEmails ?? [])],
      freeAccess: summary.config.freeAccess,
      guestSymptomChecker: summary.config.guestSymptomChecker,
      inviteOnly: summary.config.inviteOnly,
      modeEnabled: summary.config.modeEnabled,
    },
    counts: {
      caseOutcomes: summary.counts.caseOutcomes,
      journalEntries: summary.counts.journalEntries,
      negativeFeedbackEntries: summary.counts.negativeFeedbackEntries,
      notifications: summary.counts.notifications,
      outcomeFeedbackEntries: summary.counts.outcomeFeedbackEntries,
      pets: summary.counts.pets,
      sharedReports: summary.counts.sharedReports,
      subscriptions: summary.counts.subscriptions,
      symptomChecks: summary.counts.symptomChecks,
      thresholdProposals: summary.counts.thresholdProposals,
    },
    recentCases: summary.recentCases.map(sanitizeRecentCase),
    user: {
      email: summary.user.email,
      fullName: summary.user.fullName,
      id: summary.user.id,
    },
  };
}

export function sanitizePrivateTesterDashboardData(
  dashboard: PrivateTesterDashboardData
): PrivateTesterDashboardData {
  return {
    config: {
      allowedEmailCount: dashboard.config.allowedEmailCount,
      allowedEmails: [...(dashboard.config.allowedEmails ?? [])],
      blockedEmailCount: dashboard.config.blockedEmailCount,
      blockedEmails: [...(dashboard.config.blockedEmails ?? [])],
      freeAccess: dashboard.config.freeAccess,
      guestSymptomChecker: dashboard.config.guestSymptomChecker,
      inviteOnly: dashboard.config.inviteOnly,
      modeEnabled: dashboard.config.modeEnabled,
    },
    summary: {
      active: dashboard.summary.active,
      blocked: dashboard.summary.blocked,
      negativeFeedbackEntries: dashboard.summary.negativeFeedbackEntries,
      symptomChecks: dashboard.summary.symptomChecks,
      total: dashboard.summary.total,
    },
    testers: dashboard.testers.map(sanitizePrivateTesterDataSummary),
    warning: dashboard.warning,
  };
}

export function sanitizePrivateTesterDeleteResult(
  result: PrivateTesterDeleteResult
): PrivateTesterDeleteResult {
  return {
    deleted: result.deleted,
    dryRun: result.dryRun,
    summary: sanitizePrivateTesterDataSummary(result.summary),
  };
}
