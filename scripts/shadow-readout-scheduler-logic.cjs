function numberFrom(value, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function countFromRate(rate, total) {
  const parsedRate = Number(rate);
  if (!Number.isFinite(parsedRate) || parsedRate <= 0 || total <= 0) {
    return 0;
  }
  return Math.round(parsedRate * total);
}

function summarizeServiceMetrics(service) {
  const observations = numberFrom(
    service.observations ??
      service.totalObservations ??
      service.observationCount,
    0
  );
  const shadowComparisons = numberFrom(
    service.shadowComparisons ??
      service.shadowComparisonCount ??
      service.comparisonCount,
    0
  );

  return {
    service: service.service,
    observations,
    shadowComparisons,
    errors: numberFrom(
      service.errors ??
        service.errorObservations ??
        service.errorCount ??
        countFromRate(service.errorRate, observations),
      0
    ),
    timeouts: numberFrom(
      service.timeouts ??
        service.timeoutObservations ??
        service.timeoutCount ??
        countFromRate(service.timeoutRate, observations),
      0
    ),
  };
}

function summarizePayload(payload) {
  const baseline = payload?.baseline ?? {};
  const summary = payload?.summary ?? {};
  const serviceMetrics = Array.isArray(baseline.serviceMetrics)
    ? baseline.serviceMetrics.map(summarizeServiceMetrics)
    : [];

  return {
    ok: payload?.ok === true,
    overallStatus: summary.overallStatus ?? null,
    reportCount: numberFrom(baseline.reportCount, 0),
    parsedReportCount: numberFrom(baseline.parsedReportCount, 0),
    malformedReportCount: numberFrom(baseline.malformedReportCount, 0),
    observationCount: numberFrom(baseline.observationCount, 0),
    shadowComparisonCount: numberFrom(baseline.shadowComparisonCount, 0),
    warning: baseline.warning ?? null,
    serviceMetrics,
  };
}

function decideStatus(readout) {
  if (readout.warning) {
    return {
      status: "readout_warning",
      decision: "HOLD - telemetry readout returned a warning",
    };
  }

  if (readout.shadowComparisonCount > 0) {
    return {
      status: "ready_for_formal_readout",
      decision: "RUN FORMAL VET-1492C RERUN",
    };
  }

  if (readout.reportCount > 0 || readout.observationCount > 0) {
    return {
      status: "blocked_missing_shadow_comparisons",
      decision: "HOLD - production sessions found but no shadow comparisons recorded",
    };
  }

  return {
    status: "healthy_empty_readout",
    decision: "HOLD - no completed production sessions found yet",
  };
}

function nextActionForStatus(status) {
  if (status === "ready_for_formal_readout") {
    return "Start the formal VET-1492C rerun against this production window before any model promotion.";
  }
  if (status === "blocked_missing_shadow_comparisons") {
    return "Trigger a tester flow that reaches an accepted second-opinion shadow comparison, then rerun the scheduler before starting a formal readout.";
  }
  if (status === "readout_warning") {
    return "Keep flags in shadow/off and repair the telemetry readout warning before collecting formal readout evidence.";
  }
  return "Keep flags in shadow/off and continue collecting invited tester sessions.";
}

module.exports = {
  decideStatus,
  nextActionForStatus,
  summarizePayload,
};
