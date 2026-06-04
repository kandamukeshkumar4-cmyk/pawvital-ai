import {
  buildProductIntelligenceSnapshot,
  type ProductIntelligenceInput,
} from "@/lib/product-intelligence";
import { symptomCheckRowToEntry } from "@/lib/symptom-check-entry-map";

function input(overrides: Partial<ProductIntelligenceInput> = {}): ProductIntelligenceInput {
  return {
    entries: [],
    ...overrides,
  };
}

describe("product intelligence snapshot", () => {
  it("keeps missing evidence as unknown instead of converting it into a low score", () => {
    const snapshot = buildProductIntelligenceSnapshot(input());

    expect(snapshot.state).toBe("unknown");
    expect(snapshot.confidence).toBe("insufficient");
    expect(snapshot.evidenceCoverage).toBe(0);
    expect(snapshot.missingEvidenceChips).toContain("latest symptom check");
    expect(snapshot.missingEvidenceChips).toContain("wellness index");
    expect(snapshot.nextEvidencePrompt).toBe("Add a symptom check to establish today's baseline.");
    expect(snapshot.displayScore).toBeNull();
    expect(snapshot.claimGuard).toContain("not a diagnosis, prognosis, treatment plan, or emergency clearance");
  });

  it("uses deterministic emergency evidence as an urgent override and suppresses coaching prompts", () => {
    const snapshot = buildProductIntelligenceSnapshot(
      input({
        entries: [
          {
            id: "check-emergency",
            pet_id: "pet-1",
            pet_name: "Miso",
            created_at: "2026-06-02T14:00:00.000Z",
            primary_symptom: "blue gums",
            severity: "critical",
            urgency: "emergency",
            top_diagnosis: "Emergency red flag",
            confidence: 0.98,
          },
        ],
      })
    );

    expect(snapshot.state).toBe("urgent");
    expect(snapshot.confidence).toBe("high");
    expect(snapshot.deterministicOverride).toBe("Emergency symptom check forces urgent state.");
    expect(snapshot.nextEvidencePrompt).toBeNull();
    expect(snapshot.persistenceAllowed).toBe(false);
    expect(snapshot.persistenceBlockedReasons).toContain("urgent override active");
  });

  it("summarizes stable readiness from existing evidence without medical clearance claims", () => {
    const snapshot = buildProductIntelligenceSnapshot(
      input({
        healthScore: 91,
        entries: [
          {
            id: "check-1",
            pet_id: "pet-1",
            pet_name: "Miso",
            created_at: "2026-06-01T14:00:00.000Z",
            primary_symptom: "routine wellness check",
            severity: "mild",
            urgency: "monitor",
            top_diagnosis: "No emergency signal",
            confidence: 0.82,
          },
          {
            id: "check-2",
            pet_id: "pet-1",
            pet_name: "Miso",
            created_at: "2026-06-02T14:00:00.000Z",
            primary_symptom: "normal appetite",
            severity: "mild",
            urgency: "monitor",
            top_diagnosis: "No emergency signal",
            confidence: 0.84,
          },
        ],
      })
    );

    expect(snapshot.state).toBe("stable");
    expect(snapshot.displayScore).toBe(91);
    expect(snapshot.evidenceCoverage).toBeGreaterThanOrEqual(0.75);
    expect(snapshot.evidenceChips).toContain("wellness index");
    expect(snapshot.evidenceChips).toContain("latest symptom check");
    expect(snapshot.evidenceChips).toContain("7-day trend");
    expect(snapshot.ownerSummary).toContain("baseline");
    expect(snapshot.ownerSummary).not.toMatch(/cleared|diagnosed|treatment/i);
  });

  it("does not treat initial report summaries as recovery checkpoints", () => {
    const entry = symptomCheckRowToEntry(
      {
        id: "check-with-report-summary",
        pet_id: "pet-1",
        symptoms: "mild itching after a walk",
        severity: "low",
        recommendation: "monitor",
        created_at: "2026-06-02T14:00:00.000Z",
        ai_response: JSON.stringify({
          title: "Mild skin irritation",
          severity: "low",
          recommendation: "monitor",
          explanation: "Initial report explanation, not a follow-up recovery checkpoint.",
          actions: [],
          warning_signs: [],
        }),
      },
      "Miso"
    );

    const snapshot = buildProductIntelligenceSnapshot(input({ entries: [entry], healthScore: 88 }));

    expect(entry.report_summary).toContain("Initial report explanation");
    expect(snapshot.evidenceChips).not.toContain("recovery checkpoint");
    expect(snapshot.missingEvidenceChips).not.toContain("recovery checkpoint");
    expect(snapshot.evidenceCoverage).toBeLessThan(0.75);
    expect(snapshot.persistenceAllowed).toBe(false);
    expect(snapshot.persistenceBlockedReasons).toContain("insufficient evidence coverage");
  });
});
