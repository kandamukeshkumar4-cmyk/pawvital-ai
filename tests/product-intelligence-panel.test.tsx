/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ProductIntelligencePanel from "@/components/analytics/product-intelligence-panel";
import type { ProductIntelligenceSnapshot } from "@/lib/product-intelligence";
import type { RecoveryCheckpoint } from "@/lib/recovery-checkpoint";

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

function buildRecoveryCheckpoint(
  overrides: Partial<RecoveryCheckpoint> = {}
): RecoveryCheckpoint {
  return {
    petId: "pet-1",
    reportSourceId: "check-follow-up",
    checkpointDate: "2026-06-02",
    generatedAt: "2026-06-02T15:00:00.000Z",
    status: "ready",
    sourceCheckIds: ["check-follow-up", "check-baseline"],
    ownerSummary:
      "Recovery checkpoint is based on report-linked follow-up evidence and comparable history.",
    claimGuard:
      "Evidence only - not a diagnosis, prognosis, treatment plan, or emergency clearance.",
    deterministicOverride: null,
    nextEvidencePrompt: null,
    persistenceAllowed: true,
    persistenceBlockedReasons: [],
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

  it("renders and saves a ready recovery checkpoint", () => {
    const onSaveRecoveryCheckpoint = jest.fn();

    render(
      React.createElement(ProductIntelligencePanel, {
        snapshot: buildSnapshot(),
        recoveryCheckpoint: buildRecoveryCheckpoint(),
        recoveryHistoryCount: 1,
        onSaveRecoveryCheckpoint,
      })
    );

    expect(screen.getByText("Recovery checkpoint")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("1 saved recovery checkpoint")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save checkpoint" }));

    expect(onSaveRecoveryCheckpoint).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/diagnosed|recovered|safe to wait|emergency clearance granted/i)
    ).toBeNull();
  });

  it("shows blocked recovery reasons without a save command", () => {
    render(
      React.createElement(ProductIntelligencePanel, {
        snapshot: buildSnapshot(),
        recoveryCheckpoint: buildRecoveryCheckpoint({
          status: "insufficient_evidence",
          persistenceAllowed: false,
          ownerSummary: "Recovery checkpoint needs more evidence before it can be saved.",
          nextEvidencePrompt: "Add a report-linked follow-up before saving recovery history.",
          persistenceBlockedReasons: ["missing report-linked follow-up evidence"],
        }),
        onSaveRecoveryCheckpoint: jest.fn(),
      })
    );

    expect(screen.getByText("Needs evidence")).toBeTruthy();
    expect(screen.getByText("missing report-linked follow-up evidence")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save checkpoint" })).toBeNull();
  });
});
