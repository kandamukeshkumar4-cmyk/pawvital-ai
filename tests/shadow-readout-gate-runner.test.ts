import fs from "node:fs";
import path from "node:path";

import gateRunnerLogic from "../scripts/shadow-readout-gate-runner-logic.cjs";

const {
  buildGateDecision,
  parseIssueSchedulerReports,
  summarizeGateRun,
} = gateRunnerLogic;

const fixtureDir = path.join(
  __dirname,
  "fixtures",
  "shadow-readout-gate-runner"
);

function readFixture(name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDir, `${name}.json`), "utf8")
  );
}

const readyProduction = {
  sha: "9fb6d05ef71336c57afd7666e35fb656d6daf0d1",
  deploymentStatus: "Ready",
  deploymentUrl: "https://pawvital-ai.vercel.app",
};

describe("shadow readout gate runner logic", () => {
  it("returns GO when requested traces and shadow comparisons are present", () => {
    const reports = parseIssueSchedulerReports(readFixture("go-comments"));
    const summary = summarizeGateRun({ production: readyProduction, reports });

    expect(summary.production_sha).toBe(readyProduction.sha);
    expect(summary.production_deployment_status).toBe("Ready");
    expect(summary.report_count).toBe(3);
    expect(summary.previous_report_count).toBe(2);
    expect(summary.report_count_delta).toBe(1);
    expect(summary.latest_window_report_created_at).toBe(
      "2026-05-28T16:55:00.000Z"
    );
    expect(summary.observation_count).toBe(2);
    expect(summary.second_opinion_trace).toEqual({
      requested: 2,
      not_requested: 1,
      state: "requested",
    });
    expect(summary.shadow_comparison_count).toBe(1);
    expect(summary.warning).toBeNull();
    expect(summary.decision).toEqual({
      status: "GO",
      reason: "shadow_readout_ready",
      text: "GO - requested second-opinion traces and shadow comparisons are present",
    });
  });

  it("holds when second opinion was never requested", () => {
    const reports = parseIssueSchedulerReports(
      readFixture("requested-zero-comments")
    );
    const summary = summarizeGateRun({ production: readyProduction, reports });

    expect(summary.second_opinion_trace).toEqual({
      requested: 0,
      not_requested: 3,
      state: "not_requested",
    });
    expect(summary.decision).toEqual({
      status: "HOLD",
      reason: "second_opinion_not_requested",
      text: "HOLD - second-opinion trace requested count is zero",
    });
  });

  it("holds when the scheduler warning is non-null", () => {
    const reports = parseIssueSchedulerReports(readFixture("warning-comments"));
    const summary = summarizeGateRun({ production: readyProduction, reports });

    expect(summary.warning).toBe("Supabase telemetry read failed");
    expect(summary.decision).toEqual({
      status: "HOLD",
      reason: "readout_warning",
      text: "HOLD - scheduler readout warning is non-null",
    });
  });

  it("holds when report_count did not increase from the previous scheduler report", () => {
    const reports = parseIssueSchedulerReports(
      readFixture("unchanged-comments")
    );
    const summary = summarizeGateRun({ production: readyProduction, reports });

    expect(summary.report_count).toBe(5);
    expect(summary.previous_report_count).toBe(5);
    expect(summary.report_count_delta).toBe(0);
    expect(summary.decision).toEqual({
      status: "HOLD",
      reason: "report_count_unchanged",
      text: "HOLD - report_count did not increase since the previous scheduler report",
    });
  });

  it("holds when requested traces exist but shadow comparisons are still zero", () => {
    const reports = parseIssueSchedulerReports(
      readFixture("missing-comparison-comments")
    );
    const summary = summarizeGateRun({ production: readyProduction, reports });

    expect(summary.second_opinion_trace.requested).toBe(2);
    expect(summary.shadow_comparison_count).toBe(0);
    expect(summary.decision).toEqual({
      status: "HOLD",
      reason: "missing_shadow_comparisons",
      text: "HOLD - shadow_comparison_count is zero",
    });
  });

  it("holds when the latest scheduler report is blocked", () => {
    const reports = parseIssueSchedulerReports(readFixture("blocked-comments"));
    const decision = buildGateDecision({
      production: readyProduction,
      current: reports[0],
      previous: null,
    });

    expect(decision).toEqual({
      status: "HOLD",
      reason: "scheduler_blocked",
      text: "HOLD - latest scheduler report is blocked_missing_secret",
    });
  });
});
