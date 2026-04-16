/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TelemetryDashboardClient from "@/app/(dashboard)/admin/TelemetryDashboardClient";
import type { AdminTelemetryDashboardData } from "@/lib/admin-telemetry";

function buildTelemetry(
  overrides: Partial<AdminTelemetryDashboardData> = {}
): AdminTelemetryDashboardData {
  return {
    dataMode: "live",
    generatedAt: "2026-04-15T12:00:00.000Z",
    historyWindowDays: 7,
    notes: ["Read-only aggregates only."],
    pipeline: {
      extractionSuccess: {
        availability: "available",
        denominator24h: 4,
        denominator7d: 8,
        note: "Persisted extraction telemetry only.",
        numerator24h: 3,
        numerator7d: 6,
        rate24h: 0.75,
        rate7d: 0.75,
      },
      pendingQuestionRescue: {
        availability: "available",
        denominator24h: 3,
        denominator7d: 7,
        note: "Pending_after=false counts as rescued.",
        numerator24h: 2,
        numerator7d: 5,
        rate24h: 0.667,
        rate7d: 0.714,
      },
      repeatQuestionAttempt: {
        availability: "available",
        denominator24h: 4,
        denominator7d: 8,
        note: "Suppressed repeat attempts.",
        numerator24h: 1,
        numerator7d: 2,
        rate24h: 0.25,
        rate7d: 0.25,
      },
    },
    sidecars: [
      {
        errorRate24h: 0.1,
        lastSeenAt: "2026-04-15T11:59:00.000Z",
        observationCount24h: 10,
        p95LatencyMs: 420,
        service: "text-retrieval-service",
        shadowComparisonCount24h: 4,
        shadowDisagreementCount24h: 1,
        shadowDisagreementRate24h: 0.25,
        timeoutRate24h: 0.2,
      },
    ],
    sources: ["Persisted symptom-check reports"],
    symptomCheckCount7d: 12,
    ...overrides,
  };
}

describe("TelemetryDashboardClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders production telemetry cards", () => {
    render(
      React.createElement(TelemetryDashboardClient, {
        initialTelemetry: buildTelemetry(),
      })
    );

    expect(screen.getByText("Extraction success rate")).toBeTruthy();
    expect(screen.getByTestId("sidecar-text-retrieval-service")).toBeTruthy();
    expect(
      screen.getByText("12 persisted report(s) sampled across 7 day(s)")
    ).toBeTruthy();
  });

  it("refreshes telemetry without exposing raw event arrays", async () => {
    const baseline = buildTelemetry();
    const nextTelemetry = buildTelemetry({
      generatedAt: "2026-04-15T13:30:00.000Z",
      notes: ["Refreshed safely."],
      pipeline: {
        ...baseline.pipeline,
        extractionSuccess: {
          ...baseline.pipeline.extractionSuccess,
          numerator24h: 4,
          rate24h: 1,
        },
      },
    });

    global.fetch = jest.fn().mockResolvedValue({
      json: async () => nextTelemetry,
      ok: true,
    }) as jest.Mock;

    render(
      React.createElement(TelemetryDashboardClient, {
        initialTelemetry: baseline,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh telemetry" }));

    await waitFor(() => {
      expect(screen.getByText("Refreshed safely.")).toBeTruthy();
      expect(screen.getByText("100%")).toBeTruthy();
    });

    expect(nextTelemetry).not.toHaveProperty("recentServiceCalls");
    expect(nextTelemetry).not.toHaveProperty("recentShadowComparisons");
  });
});
