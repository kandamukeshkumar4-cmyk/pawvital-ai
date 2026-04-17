/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfidenceCalibrationSection } from "@/components/symptom-report/confidence-calibration";
import { EvidenceChainSection } from "@/components/symptom-report/evidence-chain";
import { EvidenceSourcesBar } from "@/components/symptom-report/evidence-sources-bar";

describe("symptom report trust UI", () => {
  it("renders deterministic provenance metadata in the evidence chain section", () => {
    render(
      React.createElement(EvidenceChainSection, {
        items: [
          {
            source: "deterministic rule",
            source_kind: "deterministic_rule",
            finding: "Emergency red flag identified: blue gums",
            supporting: ["Merck Veterinary Manual"],
            contradicting: [],
            confidence: 0.99,
            claim_id: "red_flag.blue_gums",
            provenance_ids: ["red_flag.blue_gums"],
            evidence_tier: "A",
            last_reviewed_at: "2026-04-10",
            high_stakes: true,
          },
        ],
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /Evidence Chain/i }));

    expect(screen.getByText("Deterministic")).toBeTruthy();
    expect(screen.getByText("Tier A")).toBeTruthy();
    expect(screen.getByText("High stakes")).toBeTruthy();
    expect(screen.getByText(/Claim ID: red_flag.blue_gums/)).toBeTruthy();
    expect(screen.getByText(/Last reviewed: 2026-04-10/)).toBeTruthy();
  });

  it("shows deterministic-vs-retrieval trust messaging and suppression note", () => {
    render(
      React.createElement(EvidenceSourcesBar, {
        report: {
          severity: "high",
          recommendation: "vet_24h",
          title: "Test",
          explanation: "Test explanation",
          actions: [],
          warning_signs: [],
          evidence_summary: {
            cases_found: 2,
            knowledge_chunks_found: 3,
            reference_images_found: 1,
            deterministic_rules_applied: 4,
            provenance_backed_claims: 4,
          },
          knowledge_sources_used: ["Merck Vet Manual", "Clinical corpus"],
          high_stakes_claims_suppressed: true,
        },
      })
    );

    expect(screen.getByText(/4 deterministic rules/)).toBeTruthy();
    expect(
      screen.getByText(
        /Deterministic clinical rules are primary. Retrieval and similar cases are supportive context only./
      )
    ).toBeTruthy();
    expect(
      screen.getByText(/Some high-stakes details were phrased conservatively/)
    ).toBeTruthy();
  });

  it("renders the strongest confidence adjustments inline", () => {
    render(
      React.createElement(ConfidenceCalibrationSection, {
        calibration: {
          final_confidence: 0.82,
          base_confidence: 0.64,
          confidence_level: "high",
          recommendation: "Confidence improved with consistent deterministic findings.",
          adjustments: [
            {
              factor: "red_flags",
              delta: 0.12,
              direction: "increase",
              reason: "Emergency red flags aligned",
            },
            {
              factor: "retrieval_support",
              delta: 0.06,
              direction: "increase",
              reason: "Knowledge support found",
            },
          ],
        },
      })
    );

    expect(screen.getByText("red_flags: +12%")).toBeTruthy();
    expect(screen.getByText("retrieval_support: +6%")).toBeTruthy();
  });
});
