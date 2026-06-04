import { buildRecoveryCheckpoint } from "@/lib/recovery-checkpoint";
import type { SymptomCheckEntry } from "@/components/timeline/types";

function entry(overrides: Partial<SymptomCheckEntry> = {}): SymptomCheckEntry {
  return {
    id: "check-1",
    pet_id: "pet-1",
    pet_name: "Miso",
    created_at: "2026-06-02T14:00:00.000Z",
    primary_symptom: "normal appetite",
    severity: "mild",
    urgency: "monitor",
    top_diagnosis: "No emergency signal",
    confidence: 0.84,
    ...overrides,
  };
}

describe("recovery checkpoints", () => {
  it("builds a report-linked recovery checkpoint when follow-up evidence exists", () => {
    const checkpoint = buildRecoveryCheckpoint({
      petId: "pet-1",
      reportSourceId: "report-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      entries: [
        entry({
          id: "check-follow-up",
          created_at: "2026-06-02T14:00:00.000Z",
          report_summary: "Follow-up notes say appetite returned.",
        }),
        entry({
          id: "check-baseline",
          created_at: "2026-05-30T14:00:00.000Z",
        }),
      ],
    });

    expect(checkpoint.petId).toBe("pet-1");
    expect(checkpoint.reportSourceId).toBe("report-1");
    expect(checkpoint.checkpointDate).toBe("2026-06-02");
    expect(checkpoint.status).toBe("ready");
    expect(checkpoint.persistenceAllowed).toBe(true);
    expect(checkpoint.sourceCheckIds).toEqual(["check-follow-up", "check-baseline"]);
    expect(checkpoint.ownerSummary).toContain("follow-up evidence");
    expect(checkpoint.ownerSummary).not.toMatch(/prognosis|treatment|cleared/i);
  });

  it("blocks persistence when follow-up evidence is missing", () => {
    const checkpoint = buildRecoveryCheckpoint({
      petId: "pet-1",
      reportSourceId: "report-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      entries: [entry({ id: "check-baseline" })],
    });

    expect(checkpoint.status).toBe("insufficient_evidence");
    expect(checkpoint.persistenceAllowed).toBe(false);
    expect(checkpoint.persistenceBlockedReasons).toContain("missing report-linked follow-up evidence");
    expect(checkpoint.nextEvidencePrompt).toBe("Add a report-linked follow-up before saving recovery history.");
  });

  it("blocks recovery persistence when urgent evidence is active", () => {
    const checkpoint = buildRecoveryCheckpoint({
      petId: "pet-1",
      reportSourceId: "report-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      entries: [
        entry({
          id: "check-emergency",
          severity: "critical",
          urgency: "emergency",
          report_summary: "Follow-up notes exist, but emergency evidence is active.",
        }),
      ],
    });

    expect(checkpoint.status).toBe("urgent_override");
    expect(checkpoint.persistenceAllowed).toBe(false);
    expect(checkpoint.persistenceBlockedReasons).toContain("urgent override active");
    expect(checkpoint.deterministicOverride).toBe("Emergency symptom check forces urgent state.");
  });
});
