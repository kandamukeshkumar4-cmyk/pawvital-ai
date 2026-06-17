import {
  buildOwnerRecoveryCheckpoint,
  formatSavedReadinessCount,
  loadProductIntelligenceHistory,
  saveProductIntelligenceSnapshot,
  selectRecoveryReportSourceId,
} from "@/lib/product-intelligence-owner-workflow";
import type { SymptomCheckEntry } from "@/components/timeline/types";

function buildEntry(overrides: Partial<SymptomCheckEntry>): SymptomCheckEntry {
  return {
    id: "check-1",
    pet_id: "pet-1",
    pet_name: "Biscuit",
    created_at: "2026-06-01T12:00:00.000Z",
    primary_symptom: "Vomiting",
    severity: "mild",
    urgency: "monitor",
    top_diagnosis: "Wellness trend",
    confidence: 0.7,
    ...overrides,
  };
}

describe("analytics product owner workflow", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("loads selected dog history through the authenticated snapshots route", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          readiness: [{ id: "ready-1" }, { id: "ready-2" }],
          recovery: [],
        },
      }),
    });

    const history = await loadProductIntelligenceHistory("pet-1", fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/product-intelligence/snapshots?pet_id=pet-1",
      expect.objectContaining({ credentials: "include" })
    );
    expect(formatSavedReadinessCount(history.readiness.length)).toBe(
      "2 saved readiness records"
    );
  });

  it("saves a persistable selected-dog snapshot through an authenticated POST", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { readiness: { id: "ready-1" } } }),
    });

    await saveProductIntelligenceSnapshot(
      {
        petId: "pet-1",
        readiness: {
          generatedAt: "2026-06-02T15:00:00.000Z",
          sourceCheckIds: ["check-1", "check-2"],
        },
      },
      fetchMock
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/product-intelligence/snapshots",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          pet_id: "pet-1",
          readiness: {
            generated_at: "2026-06-02T15:00:00.000Z",
            source_check_ids: ["check-1", "check-2"],
          },
        }),
      })
    );
  });

  it("saves a recovery checkpoint through an authenticated POST", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { recovery: { id: "recovery-1" } } }),
    });

    await saveProductIntelligenceSnapshot(
      {
        petId: "pet-1",
        recovery: {
          reportSourceId: "check-follow-up",
          generatedAt: "2026-06-03T15:00:00.000Z",
          sourceCheckIds: ["check-follow-up", "check-baseline"],
        },
      },
      fetchMock
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/product-intelligence/snapshots",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          pet_id: "pet-1",
          recovery: {
            report_source_id: "check-follow-up",
            generated_at: "2026-06-03T15:00:00.000Z",
            source_check_ids: ["check-follow-up", "check-baseline"],
          },
        }),
      })
    );
  });

  it("selects the newest report-linked check as the recovery source", () => {
    const entries = [
      buildEntry({
        id: "latest-without-report",
        created_at: "2026-06-04T12:00:00.000Z",
      }),
      buildEntry({
        id: "older-with-report",
        created_at: "2026-06-03T12:00:00.000Z",
        report_summary: "Follow-up report generated.",
      }),
      buildEntry({
        id: "oldest-with-report",
        created_at: "2026-06-02T12:00:00.000Z",
        report_summary: "Earlier report generated.",
      }),
    ];

    expect(selectRecoveryReportSourceId(entries)).toBe("older-with-report");
  });

  it("builds blocked recovery checkpoint state when report-linked evidence is missing", () => {
    const checkpoint = buildOwnerRecoveryCheckpoint({
      petId: "pet-1",
      generatedAt: "2026-06-04T12:00:00.000Z",
      entries: [
        buildEntry({ id: "latest", created_at: "2026-06-04T12:00:00.000Z" }),
        buildEntry({ id: "baseline", created_at: "2026-06-02T12:00:00.000Z" }),
      ],
    });

    expect(checkpoint).toEqual(
      expect.objectContaining({
        reportSourceId: "latest",
        status: "insufficient_evidence",
        persistenceAllowed: false,
      })
    );
    expect(checkpoint?.persistenceBlockedReasons).toContain(
      "missing report-linked follow-up evidence"
    );
  });
});
