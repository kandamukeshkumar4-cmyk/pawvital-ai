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
  };
}

describe("OutcomeFeedbackSection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
  });

  it("submits same-origin tester feedback and shows a saved state", async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          case: {
            flagged: true,
          },
        }),
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

    fireEvent.click(screen.getAllByRole("button", { name: "No" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Wording" }));
    fireEvent.click(screen.getByRole("button", { name: "Not sure" }));
    fireEvent.change(screen.getByLabelText("Optional notes"), {
      target: { value: "The wording felt confusing and scary." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

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
      helpfulness: "no",
      confusingAreas: ["wording"],
      trustLevel: "not_sure",
      notes: "The wording felt confusing and scary.",
      surface: "result_page",
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Feedback saved" }),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText(
        /Saved and flagged for follow-up review\./,
      ),
    ).toBeTruthy();
  });

  it("shows a safe failure state without echoing raw sensitive server text", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        ok: false,
        error: "Piper needed sedation after the emergency visit.",
      }),
    });
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

    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Feedback is temporarily unavailable. Please try again shortly.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/Piper needed sedation/i)).toBeNull();
  });
});
