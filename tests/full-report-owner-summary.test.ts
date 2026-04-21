/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FullReport } from "@/components/symptom-report";
import type { SymptomReport } from "@/components/symptom-report/types";

jest.mock("@/lib/report-handoff", () => ({
  buildVetHandoffPacket: jest.fn(() => "report-handoff should not be used"),
  getDefaultClinicLinkExpiry: jest.fn(() => "30d"),
  getRecommendationLabel: jest.fn(() => "report-handoff should not be used"),
  getUrgencyLevelBody: jest.fn(() => "report-handoff should not be used"),
  getUrgencyLevelLabel: jest.fn(() => "report-handoff should not be used"),
  isEmergencyReport: jest.fn(() => true),
  isEscalatedReport: jest.fn(() => true),
}));

const mockReportHandoff = jest.requireMock("@/lib/report-handoff") as {
  buildVetHandoffPacket: jest.Mock;
  getDefaultClinicLinkExpiry: jest.Mock;
  getRecommendationLabel: jest.Mock;
  getUrgencyLevelBody: jest.Mock;
  getUrgencyLevelLabel: jest.Mock;
  isEmergencyReport: jest.Mock;
  isEscalatedReport: jest.Mock;
};

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
    limitations: [
      "PawVital cannot confirm the exact cause without a hands-on veterinary exam.",
    ],
    warning_signs: ["Collapse", "Blue, gray, or very pale gums"],
    vet_handoff_summary:
      "Acute breathing distress with pale gums and progressive weakness.",
    ...overrides,
  };
}

describe("full report owner summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders a real feedback-unavailable state instead of placeholder copy when the report is not saved", () => {
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
      screen.getByText(
        "PawVital cannot confirm the exact cause without a hands-on veterinary exam.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy Shareable Summary" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "See Feedback Status" }),
    ).toBeTruthy();
    expect(screen.getByText("Feedback for this report")).toBeTruthy();
    expect(
      screen.getByText(
        "This report is not linked to a saved symptom check yet, so feedback cannot be submitted from this page right now.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(/still being connected in a parallel lane/i),
    ).toBeNull();
  });

  it("keeps the feedback CTA wired to the live widget for saved reports without requiring the legacy feedback flag", () => {
    render(
      React.createElement(FullReport, {
        report: makeReport({
          severity: "low",
          recommendation: "monitor",
          report_storage_id: "check-123",
        }),
      }),
    );

    expect(screen.getByRole("button", { name: "Open Feedback" })).toBeTruthy();
    expect(screen.getByText("Was this helpful?")).toBeTruthy();
  });

  it("renders provided monitor action text and limitations without synthesizing extra report language", () => {
    render(
      React.createElement(FullReport, {
        report: makeReport({
          severity: "low",
          recommendation: "monitor",
          title: "Mild stomach upset",
          explanation:
            "Mild stomach upset can often be watched closely at home if your dog is otherwise acting normally.",
          actions: [
            "Offer small amounts of water frequently.",
            "Feed a bland meal only if vomiting has stopped.",
          ],
          limitations: [
            "PawVital cannot confirm the cause without an in-person veterinary exam.",
          ],
          warning_signs: ["Vomiting returns more than twice"],
        }),
      }),
    );

    expect(screen.getAllByText("Home monitoring for now")).toHaveLength(2);
    expect(screen.getByText("What to do now")).toBeTruthy();
    expect(
      screen.getByText("Offer small amounts of water frequently."),
    ).toBeTruthy();
    expect(
      screen.getByText("Feed a bland meal only if vomiting has stopped."),
    ).toBeTruthy();
    expect(
      screen.getByText("Contact a veterinarian sooner if you notice"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "PawVital cannot confirm the cause without an in-person veterinary exam.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "whether your dog needs bloodwork, imaging, or other testing until your veterinarian examines them",
      ),
    ).toBeNull();
  });

  it("does not call report-handoff helpers when rendering or copying the deterministic UI summary", async () => {
    render(React.createElement(FullReport, { report: makeReport() }));

    fireEvent.click(
      screen.getByRole("button", { name: "Copy Shareable Summary" }),
    );

    const clipboard = window.navigator.clipboard as {
      writeText: jest.Mock<Promise<void>, [string]>;
    };

    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledTimes(1));
    expect(clipboard.writeText.mock.calls[0][0]).toContain(
      "Recommendation: Seek emergency veterinary care immediately",
    );
    expect(clipboard.writeText.mock.calls[0][0]).toContain(
      "Vet handoff summary\nAcute breathing distress with pale gums and progressive weakness.",
    );
    expect(mockReportHandoff.buildVetHandoffPacket).not.toHaveBeenCalled();
    expect(mockReportHandoff.getDefaultClinicLinkExpiry).not.toHaveBeenCalled();
    expect(mockReportHandoff.getRecommendationLabel).not.toHaveBeenCalled();
    expect(mockReportHandoff.getUrgencyLevelBody).not.toHaveBeenCalled();
    expect(mockReportHandoff.getUrgencyLevelLabel).not.toHaveBeenCalled();
    expect(mockReportHandoff.isEmergencyReport).not.toHaveBeenCalled();
    expect(mockReportHandoff.isEscalatedReport).not.toHaveBeenCalled();
  });
});
