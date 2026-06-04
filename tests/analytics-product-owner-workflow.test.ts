import {
  formatSavedReadinessCount,
  loadProductIntelligenceHistory,
  saveProductIntelligenceSnapshot,
} from "@/lib/product-intelligence-owner-workflow";

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
});
