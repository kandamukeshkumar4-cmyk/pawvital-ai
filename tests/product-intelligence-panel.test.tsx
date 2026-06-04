/** @jest-environment jsdom */

import * as React from "react";
import { render, screen } from "@testing-library/react";
import ProductIntelligencePanel from "@/components/analytics/product-intelligence-panel";
import type { ProductIntelligenceSnapshot } from "@/lib/product-intelligence";

function buildSnapshot(
  overrides: Partial<ProductIntelligenceSnapshot> = {}
): ProductIntelligenceSnapshot {
  return {
    state: "unknown",
    confidence: "insufficient",
    displayScore: null,
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
});
