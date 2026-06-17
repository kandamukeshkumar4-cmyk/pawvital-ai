function numberFrom(value, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^null$/i.test(text) || /^n\/a$/i.test(text)) return null;
  return text;
}

function parseBacktickField(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`${escaped}:\\s*\`([^\`]+)\``, "i"));
  return match?.[1]?.trim() ?? null;
}

function parseMarkdownField(body, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^\\s*-\\s*${escaped}:\\s*(.+?)\\s*$`, "im"));
  return match?.[1]?.trim() ?? null;
}

function parseCountRecord(value) {
  if (!value || /^none$/i.test(String(value).trim())) return {};

  return Object.fromEntries(
    String(value)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [key, count] = entry.split("=");
        return [key?.trim(), numberFrom(count, 0)];
      })
      .filter(([key, count]) => Boolean(key) && count > 0)
  );
}

function sortReports(left, right) {
  const leftTime = Date.parse(left.commentCreatedAt ?? left.generatedAt ?? "");
  const rightTime = Date.parse(right.commentCreatedAt ?? right.generatedAt ?? "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return numberFrom(left.commentId, 0) - numberFrom(right.commentId, 0);
}

function parseIssueSchedulerReport(comment) {
  const body = typeof comment?.body === "string" ? comment.body : "";
  if (!body.includes("Scheduled Shadow Readout")) return null;

  const requestOutcomeCounts = parseCountRecord(
    parseMarkdownField(body, "request_outcome")
  );
  const status =
    parseMarkdownField(body, "status") ?? parseBacktickField(body, "Status");
  const schedulerDecision =
    parseMarkdownField(body, "decision") ??
    parseBacktickField(body, "Decision");
  const warning = normalizeNullableText(
    parseMarkdownField(body, "warning") ?? parseBacktickField(body, "Warning")
  );

  return {
    source: "issue_comment",
    commentId: comment.id ?? null,
    commentCreatedAt: comment.created_at ?? null,
    generatedAt: parseMarkdownField(body, "generated_at"),
    status,
    schedulerDecision,
    reportCount: numberFrom(
      parseMarkdownField(body, "report_count") ??
        parseBacktickField(body, "Report count"),
      0
    ),
    latestWindowReportCreatedAt: normalizeNullableText(
      parseMarkdownField(body, "latest_window_report_created_at")
    ),
    observationCount: numberFrom(parseMarkdownField(body, "observation_count"), 0),
    shadowComparisonCount: numberFrom(
      parseMarkdownField(body, "shadow_comparison_count"),
      0
    ),
    warning,
    secondOpinionTrace: {
      requested: numberFrom(requestOutcomeCounts.requested, 0),
      notRequested: numberFrom(requestOutcomeCounts.not_requested, 0),
      requestOutcomeCounts,
    },
  };
}

function parseIssueSchedulerReports(comments) {
  if (!Array.isArray(comments)) return [];
  return comments
    .map(parseIssueSchedulerReport)
    .filter(Boolean)
    .sort(sortReports);
}

function parseSchedulerArtifactReport(report, source = "artifact") {
  const readout = report?.readout ?? {};
  const trace = readout.secondOpinionTrace ?? {};
  const requestOutcomeCounts =
    trace.requestOutcomeCounts && typeof trace.requestOutcomeCounts === "object"
      ? trace.requestOutcomeCounts
      : {};

  return {
    source,
    commentId: null,
    commentCreatedAt: null,
    generatedAt: report?.generatedAt ?? null,
    status: report?.status ?? null,
    schedulerDecision: report?.decision ?? null,
    reportCount: numberFrom(readout.reportCount, 0),
    latestWindowReportCreatedAt: normalizeNullableText(
      readout.latestWindowReportCreatedAt
    ),
    observationCount: numberFrom(readout.observationCount, 0),
    shadowComparisonCount: numberFrom(readout.shadowComparisonCount, 0),
    warning: normalizeNullableText(readout.warning),
    secondOpinionTrace: {
      requested: numberFrom(requestOutcomeCounts.requested, 0),
      notRequested: numberFrom(requestOutcomeCounts.not_requested, 0),
      requestOutcomeCounts,
    },
  };
}

function isReadyDeploymentStatus(value) {
  return /^(ready|success)$/i.test(String(value ?? "").trim());
}

function hold(reason, text) {
  return { status: "HOLD", reason, text };
}

function buildGateDecision({ production, current, previous }) {
  if (!current) {
    return hold(
      "missing_scheduler_report",
      "HOLD - no scheduler report was found on issue #495"
    );
  }

  if (!isReadyDeploymentStatus(production?.deploymentStatus)) {
    return hold(
      "production_deployment_not_ready",
      "HOLD - production deployment is not confirmed ready"
    );
  }

  if (
    /^(blocked_missing_secret|fetch_failed|not_due|dry_run)/i.test(
      current.status ?? ""
    )
  ) {
    return hold(
      "scheduler_blocked",
      `HOLD - latest scheduler report is ${current.status}`
    );
  }

  if (current.warning) {
    return hold("readout_warning", "HOLD - scheduler readout warning is non-null");
  }

  if (
    previous &&
    Number.isFinite(previous.reportCount) &&
    current.reportCount <= previous.reportCount
  ) {
    return hold(
      "report_count_unchanged",
      "HOLD - report_count did not increase since the previous scheduler report"
    );
  }

  if (current.secondOpinionTrace.requested <= 0) {
    return hold(
      "second_opinion_not_requested",
      "HOLD - second-opinion trace requested count is zero"
    );
  }

  if (current.shadowComparisonCount <= 0) {
    return hold(
      "missing_shadow_comparisons",
      "HOLD - shadow_comparison_count is zero"
    );
  }

  return {
    status: "GO",
    reason: "shadow_readout_ready",
    text: "GO - requested second-opinion traces and shadow comparisons are present",
  };
}

function summarizeGateRun({ production, reports }) {
  const orderedReports = [...(Array.isArray(reports) ? reports : [])].sort(sortReports);
  const current = orderedReports.at(-1) ?? null;
  const previous = orderedReports.length > 1 ? orderedReports.at(-2) : null;
  const decision = buildGateDecision({ production, current, previous });
  const requested = numberFrom(current?.secondOpinionTrace?.requested, 0);
  const notRequested = numberFrom(current?.secondOpinionTrace?.notRequested, 0);
  const previousReportCount = previous?.reportCount ?? null;
  const reportCount = current?.reportCount ?? 0;

  return {
    production_sha: production?.sha ?? "unknown",
    production_deployment_status: production?.deploymentStatus ?? "unknown",
    production_deployment_url: production?.deploymentUrl ?? null,
    scheduler_status: current?.status ?? null,
    scheduler_comment_id: current?.commentId ?? null,
    scheduler_comment_created_at: current?.commentCreatedAt ?? null,
    scheduler_generated_at: current?.generatedAt ?? null,
    report_count: reportCount,
    previous_report_count: previousReportCount,
    report_count_delta:
      previousReportCount === null ? null : reportCount - previousReportCount,
    latest_window_report_created_at:
      current?.latestWindowReportCreatedAt ?? null,
    observation_count: current?.observationCount ?? 0,
    second_opinion_trace: {
      requested,
      not_requested: notRequested,
      state: requested > 0 ? "requested" : "not_requested",
    },
    shadow_comparison_count: current?.shadowComparisonCount ?? 0,
    warning: current?.warning ?? null,
    decision,
  };
}

module.exports = {
  buildGateDecision,
  parseIssueSchedulerReports,
  parseSchedulerArtifactReport,
  summarizeGateRun,
};
