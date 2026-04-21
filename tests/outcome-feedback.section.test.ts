/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OutcomeFeedbackSection } from "@/components/symptom-report/outcome-feedback";
import type { SymptomReport } from "@/components/symptom-report";

function buildReport(): SymptomReport {
  return {
    severity: "medium",
    recommendation: "vet_48h",
    title: "Ear irritation follow-up",
    explanation: "A saved report for browser smoke coverage.",
    actions: ["Schedule a vet visit."],
    warning_signs: ["Head tilt"],
    report_storage_id: "check-123",
    outcome_feedback_enabled: true,
  };
}

describe("OutcomeFeedbackSection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
  });

  it("submits same-origin outcome feedback and shows a saved state", async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      {
        ok: true,
        status: 200,
      },
    );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchSpy,
    });

    render(
      React.createElement(OutcomeFeedbackSection, {
        report: buildReport(),
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /After Your Vet Visit/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Very close" }));
    fireEvent.change(screen.getByPlaceholderText("Example: otitis externa"), {
      target: { value: "otitis externa" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Example: ear cytology + meds prescribed"),
      {
        target: { value: "Cytology and medication" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "Anything useful that the vet found, ruled out, or corrected.",
      ),
      {
        target: { value: "The threshold felt right." },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save Outcome Feedback" }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/ai/outcome-feedback",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      symptomCheckId: "check-123",
      matchedExpectation: "yes",
      confirmedDiagnosis: "otitis externa",
      vetOutcome: "Cytology and medication",
      ownerNotes: "The threshold felt right.",
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Feedback Saved" }),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText(
        /This case can now be used for future quality review and proposal drafting\./,
      ),
    ).toBeTruthy();
  });
});
