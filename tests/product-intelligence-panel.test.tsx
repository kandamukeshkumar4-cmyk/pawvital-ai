/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ProductIntelligencePanel from "@/components/analytics/product-intelligence-panel";
import type { ProductIntelligenceSnapshot } from "@/lib/product-intelligence";

interface BaselineShiftForTest {
  direction: string;
  confidence: string;
  latestScore: number | null;
  baselineScore: number | null;
  delta: number | null;
  evidenceChips: string[];
  missingEvidenceChips: string[];
  ownerSummary: string;
  deterministicOverride: string | null;
}

type ProductIntelligenceSnapshotForTest = ProductIntelligenceSnapshot & {
  baselineShift: BaselineShiftForTest;
};

function buildSnapshot(
  overrides: Partial<ProductIntelligenceSnapshotForTest> = {}
): ProductIntelligenceSnapshotForTest {
  return {
    state: "unknown",
    confidence: "insufficient",
    displayScore: null,
    baselineShift: {
      direction: "unknown",
      confidence: "insufficient",
      latestScore: null,
      baselineScore: null,
      delta: null,
      evidenceChips: [],
      missingEvidenceChips: ["comparable baseline"],
      ownerSummary: "Not enough comparable baseline evidence yet.",
      deterministicOverride: null,
    },
    evidenceCoverage: 0.25,
    evidenceChips: ["latest symptom check"],
    missingEvidenceChips: ["wellness index", "7-day trend"],
    nextEvidencePrompt: "Add a symptom check to establish today's baseline.",
    deterministicOverride: null,
    ownerSummary: "Not enough comparable evidence yet.",
    claimGuard:
      "Evidence only - not a diagnosis, prognosis, treatment plan, or emergency clearance.",
    persistenceAllowed: false,
    persistenceBlockedReasons: ["insufficient evidence coverage"],
    ...overrides,
  };
}

describe("ProductIntelligencePanel", () => {
  it("renders the evidence ring, missing evidence, and claim guard", () => {
    render(
      React.createElement(ProductIntelligencePanel, {
        snapshot: buildSnapshot(),
        historyCount: 2,
      })
    );

    expect(screen.getByText("Evidence ring")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("wellness index")).toBeTruthy();
    expect(screen.getByText("7-day trend")).toBeTruthy();
    expect(
      screen.getByText(
        "Evidence only - not a diagnosis, prognosis, treatment plan, or emergency clearance."
      )
    ).toBeTruthy();
    expect(screen.getByText("2 saved snapshots")).toBeTruthy();
  });

  it("shows urgent overrides without save-ready language", () => {
    render(
      React.createElement(ProductIntelligencePanel, {
        snapshot: buildSnapshot({
          state: "urgent",
          confidence: "high",
          displayScore: 34,
          evidenceCoverage: 0.75,
          missingEvidenceChips: [],
          deterministicOverride: "Emergency symptom check forces urgent state.",
          nextEvidencePrompt: null,
          ownerSummary: "Urgent evidence is active.",
          persistenceBlockedReasons: ["urgent override active"],
        }),
      })
    );

    expect(screen.getByText("Urgent")).toBeTruthy();
    expect(screen.getByText("Emergency symptom check forces urgent state.")).toBeTruthy();
    expect(screen.queryByText(/ready to save/i)).toBeNull();
    expect(screen.getByText("urgent override active")).toBeTruthy();
  });

  it("runs the selected-dog save command for persistable snapshots", () => {
    const onSaveSnapshot = jest.fn();

    render(
      React.createElement(ProductIntelligencePanel, {
        snapshot: buildSnapshot({
          state: "stable",
          confidence: "high",
          displayScore: 91,
          evidenceCoverage: 1,
          evidenceChips: ["wellness index", "latest symptom check", "7-day trend"],
          missingEvidenceChips: [],
          nextEvidencePrompt: null,
          ownerSummary: "Available evidence looks close to baseline.",
          persistenceAllowed: true,
          persistenceBlockedReasons: [],
        }),
        historyCount: 2,
        onSaveSnapshot,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Save snapshot" }));

    expect(onSaveSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2 saved snapshots")).toBeTruthy();
  });

  it("renders the baseline-shift comparison without medical claim language", () => {
    render(
      React.createElement(ProductIntelligencePanel, {
        snapshot: buildSnapshot({
          state: "watch",
          confidence: "high",
          displayScore: 91,
          evidenceCoverage: 1,
          evidenceChips: ["wellness index", "latest symptom check", "7-day trend"],
          missingEvidenceChips: [],
          nextEvidencePrompt: null,
          ownerSummary: "Latest check is below recent baseline. Keep collecting comparable evidence.",
          persistenceAllowed: true,
          persistenceBlockedReasons: [],
          baselineShift: {
            direction: "declining",
            confidence: "high",
            latestScore: 78,
            baselineScore: 92,
            delta: -14,
            evidenceChips: ["latest symptom check", "comparable baseline"],
            missingEvidenceChips: [],
            ownerSummary: "Latest check is below recent baseline. Keep collecting comparable evidence.",
            deterministicOverride: null,
          },
        }),
      })
    );

    expect(screen.getByText("Baseline shift")).toBeTruthy();
    expect(screen.getByText("Below baseline")).toBeTruthy();
    expect(screen.getByText("-14")).toBeTruthy();
    expect(screen.getByText("Latest 78 / baseline 92")).toBeTruthy();
    expect(screen.queryByText(/disease progression|diagnosed|treat with|safe to wait/i)).toBeNull();
  });
});
