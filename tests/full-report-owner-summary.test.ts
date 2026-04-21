/** @jest-environment jsdom */

import * as React from "react";
import { render, screen } from "@testing-library/react";
import { FullReport } from "@/components/symptom-report";
import type { SymptomReport } from "@/components/symptom-report/types";

function makeReport(overrides: Partial<SymptomReport> = {}): SymptomReport {
  return {
    severity: "emergency",
    recommendation: "emergency_vet",
    title: "Acute breathing distress",
    explanation: "Rapid breathing and pale gums can signal a true emergency.",
    actions: [
      "Leave for an emergency veterinary clinic now.",
      "Call the clinic on the way if you can do so safely.",
    ],
    warning_signs: ["Collapse", "Blue, gray, or very pale gums"],
    vet_handoff_summary:
      "Acute breathing distress with pale gums and progressive weakness.",
    ...overrides,
  };
}

describe("full report owner summary", () => {
  it("renders the owner-first hierarchy with feedback placeholder when the widget is not ready", () => {
    render(React.createElement(FullReport, { report: makeReport() }));

    expect(
      screen.getByText("What this result means for your dog right now"),
    ).toBeTruthy();
    expect(screen.getAllByText("Emergency care now")).toHaveLength(2);
    expect(screen.getByText("Do this now")).toBeTruthy();
    expect(
      screen.getByText("Get urgent help even faster if you notice"),
    ).toBeTruthy();
    expect(screen.getByText("Why PawVital recommended this")).toBeTruthy();
    expect(
      screen.getByText("What PawVital still can't determine"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy Shareable Summary" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "See Feedback Area" })).toBeTruthy();
    expect(screen.getByText("Feedback for this report")).toBeTruthy();
  });

  it("keeps the feedback CTA wired to the live widget when enabled", () => {
    render(
      React.createElement(FullReport, {
        report: makeReport({
          severity: "low",
          recommendation: "monitor",
          report_storage_id: "check-123",
          outcome_feedback_enabled: true,
        }),
      }),
    );

    expect(screen.getByRole("button", { name: "Open Feedback" })).toBeTruthy();
    expect(screen.getByText("After Your Vet Visit")).toBeTruthy();
  });
});
