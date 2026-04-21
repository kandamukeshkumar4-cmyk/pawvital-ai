/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SymptomReport } from "@/components/symptom-report/types";
import { buildReportPresentation } from "@/components/symptom-report/report-presentation";
import { SeverityHeader } from "@/components/symptom-report/severity-header";

function makeReport(
  overrides: Partial<SymptomReport> = {}
): SymptomReport {
  return {
    severity: "emergency",
    recommendation: "emergency_vet",
    title: "Acute breathing distress",
    explanation: "Rapid breathing and blue gums require immediate care.",
    actions: ["Go to the emergency clinic now."],
    warning_signs: ["Collapse"],
    vet_handoff_summary:
      "Acute respiratory distress with cyanosis reported by owner.",
    ...overrides,
  };
}

describe("severity header escalation UI", () => {
  it("renders emergency clinic handoff actions", () => {
    const handleCopy = jest.fn();
    const handleJump = jest.fn();
    const report = makeReport();
    const presentation = buildReportPresentation(report);

    render(
      React.createElement(SeverityHeader, {
        banner: presentation.headerBanner,
        recommendationLabel: presentation.recommendationLabel,
        report,
        tone: presentation.tone,
        urgencyBody: presentation.urgencyBody,
        urgencyLabel: presentation.urgencyLabel,
        copyState: "idle",
        onCopyVetSummary: handleCopy,
        onJumpToHandoff: handleJump,
      })
    );

    expect(screen.getByText("Emergency clinic handoff")).toBeTruthy();
    expect(screen.getByText("Act before you travel")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Copy Clinic Handoff" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Jump to Handoff" }));

    expect(handleCopy).toHaveBeenCalledTimes(1);
    expect(handleJump).toHaveBeenCalledTimes(1);
  });

  it("renders same-day follow-up guidance for high concern reports", () => {
    const report = makeReport({
      severity: "high",
      recommendation: "vet_24h",
      title: "Painful ear infection",
    });
    const presentation = buildReportPresentation(report);

    render(
      React.createElement(SeverityHeader, {
        banner: presentation.headerBanner,
        recommendationLabel: presentation.recommendationLabel,
        report,
        tone: presentation.tone,
        urgencyBody: presentation.urgencyBody,
        urgencyLabel: presentation.urgencyLabel,
        copyState: "idle",
        onCopyVetSummary: jest.fn(),
      })
    );

    expect(screen.getByText("Same-day veterinary follow-up")).toBeTruthy();
    expect(
      screen.getByText(
        "Arrange same-day veterinary follow-up and copy the clinic handoff before you leave."
      )
    ).toBeTruthy();
  });
});
