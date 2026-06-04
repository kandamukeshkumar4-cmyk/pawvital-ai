import {
  mapReadinessSnapshotToRow,
  mapRecoveryCheckpointToRow,
} from "@/lib/product-intelligence-persistence";
import { buildDailyReadinessSnapshot } from "@/lib/readiness-snapshot";
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

describe("product intelligence persistence mappers", () => {
  it("maps a persistable daily readiness snapshot to an owner-scoped row", () => {
    const snapshot = buildDailyReadinessSnapshot({
      petId: "pet-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      healthScore: 91,
      entries: [
        entry({ id: "check-2", created_at: "2026-06-02T14:00:00.000Z" }),
        entry({ id: "check-1", created_at: "2026-06-01T14:00:00.000Z" }),
      ],
    });

    const row = mapReadinessSnapshotToRow({
      userId: "user-1",
      snapshot,
      generatedBy: "analytics-evidence-ring",
    });

    expect(row).toEqual(
      expect.objectContaining({
        user_id: "user-1",
        pet_id: "pet-1",
        snapshot_date: "2026-06-02",
        readiness_state: "stable",
        confidence: "high",
        generated_by: "analytics-evidence-ring",
      })
    );
    expect(row.source_check_ids).toEqual(["check-2", "check-1"]);
    expect(row.payload.claimGuard).toContain("not a diagnosis");
    expect(JSON.stringify(row.payload)).not.toMatch(
      /diagnosis certainty|treatment recommendation|prognosis promise|emergency clearance granted/i
    );
  });

  it("refuses to map a blocked daily readiness snapshot", () => {
    const snapshot = buildDailyReadinessSnapshot({
      petId: "pet-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      entries: [],
    });

    expect(() =>
      mapReadinessSnapshotToRow({
        userId: "user-1",
        snapshot,
        generatedBy: "analytics-evidence-ring",
      })
    ).toThrow("Daily readiness snapshot is not persistable");
  });

  it("maps a persistable recovery checkpoint to an owner-scoped row", () => {
    const checkpoint = buildRecoveryCheckpoint({
      petId: "pet-1",
      reportSourceId: "report-1",
      generatedAt: "2026-06-02T15:00:00.000Z",
      entries: [
        entry({
          id: "check-follow-up",
          report_summary: "Follow-up notes say appetite returned.",
        }),
        entry({ id: "check-baseline", created_at: "2026-05-30T14:00:00.000Z" }),
      ],
    });

    const row = mapRecoveryCheckpointToRow({
      userId: "user-1",
      checkpoint,
      generatedBy: "analytics-evidence-ring",
    });

    expect(row).toEqual(
      expect.objectContaining({
        user_id: "user-1",
        pet_id: "pet-1",
        report_source_id: "report-1",
        checkpoint_date: "2026-06-02",
        recovery_status: "ready",
        generated_by: "analytics-evidence-ring",
      })
    );
    expect(row.source_check_ids).toEqual(["check-follow-up", "check-baseline"]);
    expect(row.payload.ownerSummary).toContain("follow-up evidence");
  });
});
