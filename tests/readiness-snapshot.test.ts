import { buildDailyReadinessSnapshot } from "@/lib/readiness-snapshot";
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

describe("daily readiness snapshots", () => {
  it("builds a persistable stable snapshot from comparable evidence", () => {
    const snapshot = buildDailyReadinessSnapshot({
      petId: "pet-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      entries: [
        entry({ id: "check-2", created_at: "2026-06-02T14:00:00.000Z" }),
        entry({ id: "check-1", created_at: "2026-06-01T14:00:00.000Z" }),
      ],
      healthScore: 91,
    });

    expect(snapshot.petId).toBe("pet-1");
    expect(snapshot.snapshotDate).toBe("2026-06-02");
    expect(snapshot.product.state).toBe("stable");
    expect(snapshot.persistenceAllowed).toBe(true);
    expect(snapshot.persistenceBlockedReasons).toEqual([]);
    expect(snapshot.sourceCheckIds).toEqual(["check-2", "check-1"]);
    expect(snapshot.claimGuard).toContain("not a diagnosis");
    expect(snapshot.ownerSummary).not.toMatch(/cleared|diagnosed|treatment/i);
  });

  it("keeps missing evidence explicit and blocks persistence", () => {
    const snapshot = buildDailyReadinessSnapshot({
      petId: "pet-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      entries: [],
    });

    expect(snapshot.product.state).toBe("unknown");
    expect(snapshot.persistenceAllowed).toBe(false);
    expect(snapshot.persistenceBlockedReasons).toContain("insufficient evidence coverage");
    expect(snapshot.persistenceBlockedReasons).toContain("unknown readiness state");
    expect(snapshot.nextEvidencePrompt).toBe("Add a symptom check to establish today's baseline.");
  });

  it("treats emergency evidence as a deterministic urgent override", () => {
    const snapshot = buildDailyReadinessSnapshot({
      petId: "pet-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      entries: [
        entry({
          id: "check-emergency",
          severity: "critical",
          urgency: "emergency",
          primary_symptom: "blue gums",
        }),
      ],
    });

    expect(snapshot.product.state).toBe("urgent");
    expect(snapshot.deterministicOverride).toBe("Emergency symptom check forces urgent state.");
    expect(snapshot.persistenceAllowed).toBe(false);
    expect(snapshot.persistenceBlockedReasons).toContain("urgent override active");
    expect(snapshot.nextEvidencePrompt).toBeNull();
  });
});
