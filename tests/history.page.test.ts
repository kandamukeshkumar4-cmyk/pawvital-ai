/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HistoryPage from "@/app/(dashboard)/history/page";

const mockUseAppStore = jest.fn();
const mockCreateClient = jest.fn();
const mockFullReport = jest.fn();

jest.mock("@/store/app-store", () => ({
  useAppStore: () => mockUseAppStore(),
}));

jest.mock("@/lib/supabase", () => ({
  createClient: () => mockCreateClient(),
  isSupabaseConfigured: true,
}));

jest.mock("@/components/symptom-report", () => {
  const React = require("react");
  const icon = (props: Record<string, unknown>) =>
    React.createElement("svg", props);

  return {
    FullReport: ({
      report,
    }: {
      report: { title: string; report_storage_id?: string };
    }) => {
      mockFullReport(report);
      return React.createElement(
        "div",
        {
          "data-testid": "full-report",
          "data-report-id": report.report_storage_id ?? "",
        },
        report.title
      );
    },
    severityConfig: {
      low: { label: "Low", icon },
      medium: { label: "Medium", icon },
      high: { label: "High", icon },
      emergency: { label: "Emergency", icon },
    },
  };
});

type HistoryRow = {
  id: string;
  symptoms: string;
  ai_response: string;
  severity: "low" | "medium" | "high" | "emergency";
  recommendation: "monitor" | "vet_48h" | "vet_24h" | "emergency_vet";
  created_at: string;
};

function buildHistorySupabase(result: {
  data: HistoryRow[] | null;
  error: unknown;
}) {
  const range = jest.fn().mockResolvedValue(result);
  const order = jest.fn().mockReturnValue({ range });
  const eq = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });

  return {
    supabase: { from },
    range,
  };
}

function makeRow(
  id: string,
  report: {
    severity: HistoryRow["severity"];
    recommendation: HistoryRow["recommendation"];
    title: string;
    explanation: string;
  }
): HistoryRow {
  return {
    id,
    symptoms: report.title,
    ai_response: JSON.stringify({
      ...report,
      actions: ["Action"],
      warning_signs: ["Warning"],
    }),
    severity: report.severity,
    recommendation: report.recommendation,
    created_at: new Date("2026-04-20T12:00:00.000Z").toISOString(),
  };
}

describe("HistoryPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppStore.mockReturnValue({
      activePet: { id: "pet-real-1", name: "Bruno" },
    });
  });

  it("fails safely instead of showing demo rows when production history loading fails", async () => {
    const { supabase } = buildHistorySupabase({
      data: null,
      error: new Error("db unavailable"),
    });
    mockCreateClient.mockReturnValue(supabase);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      render(React.createElement(HistoryPage));

      await waitFor(() =>
        expect(
          screen.getAllByText(
            "Saved symptom-check reports are temporarily unavailable. Please try again shortly."
          ).length
        ).toBeGreaterThan(0)
      );

      expect(screen.queryByText("Vomiting and Lethargy")).toBeNull();
      expect(screen.queryByText("Excessive Scratching")).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("opens the clicked stored report with the correct storage id", async () => {
    const { supabase } = buildHistorySupabase({
      data: [
        makeRow("check-1", {
          severity: "medium",
          recommendation: "vet_48h",
          title: "Stomach upset follow-up",
          explanation: "Monitor hydration and appetite.",
        }),
        makeRow("check-2", {
          severity: "emergency",
          recommendation: "emergency_vet",
          title: "Emergency breathing distress",
          explanation: "Blue gums and labored breathing need immediate care.",
        }),
      ],
      error: null,
    });
    mockCreateClient.mockReturnValue(supabase);

    render(React.createElement(HistoryPage));

    await waitFor(() =>
      expect(screen.getByText("Stomach upset follow-up")).toBeTruthy()
    );

    const buttons = screen.getAllByRole("button", {
      name: "View Full Report",
    });
    fireEvent.click(buttons[1]);

    await waitFor(() =>
      expect(screen.getByTestId("full-report").textContent).toContain(
        "Emergency breathing distress"
      )
    );

    expect(
      screen.getByTestId("full-report").getAttribute("data-report-id")
    ).toBe("check-2");
    expect(mockFullReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Emergency breathing distress",
        report_storage_id: "check-2",
      })
    );
  });
});
