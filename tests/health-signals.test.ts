import {
  buildDailySignalsGrid,
  buildStatusTimeline,
} from "@/lib/analytics/health-signals";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { HealthLog } from "@/lib/health-log/types";

function entry(o: Partial<SymptomCheckEntry> = {}): SymptomCheckEntry {
  return {
    id: o.id ?? "e1",
    pet_id: "p1",
    pet_name: "Bruno",
    created_at: o.created_at ?? "2026-06-18T10:00:00.000Z",
    primary_symptom: o.primary_symptom ?? "Vomiting",
    severity: o.severity ?? "moderate",
    urgency: o.urgency ?? "monitor",
    top_diagnosis: "x",
    confidence: 0.8,
  };
}

function log(o: Partial<HealthLog> = {}): HealthLog {
  return {
    id: o.id ?? "l1",
    user_id: "u1",
    pet_id: "p1",
    log_date: o.log_date ?? "2026-06-18",
    appetite: o.appetite ?? "normal",
    water: o.water ?? "normal",
    stool: o.stool ?? "normal",
    urination: o.urination ?? "normal",
    vomiting_count: o.vomiting_count ?? 0,
    energy: o.energy ?? "normal",
    weight_kg: o.weight_kg ?? null,
    meds_given: o.meds_given ?? false,
    notes: null,
    photo_urls: [],
    created_at: "2026-06-18T08:00:00.000Z",
    updated_at: "2026-06-18T08:00:00.000Z",
  };
}

describe("buildStatusTimeline", () => {
  it("orders oldest→newest and maps urgency to plain labels", () => {
    const steps = buildStatusTimeline([
      entry({ id: "b", created_at: "2026-06-17T10:00:00.000Z", urgency: "urgent" }),
      entry({ id: "a", created_at: "2026-06-10T10:00:00.000Z", urgency: "monitor" }),
    ]);
    expect(steps.map((s) => s.label)).toEqual(["Monitor", "Call vet"]);
    expect(steps[0].tone).toBe("good");
    expect(steps[1].tone).toBe("watch");
  });

  it("caps at the max most-recent steps", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ id: `e${i}`, created_at: `2026-06-${String(i + 1).padStart(2, "0")}T10:00:00.000Z` }),
    );
    expect(buildStatusTimeline(entries, 6)).toHaveLength(6);
  });

  it("returns empty for no entries", () => {
    expect(buildStatusTimeline([])).toHaveLength(0);
  });
});

describe("buildDailySignalsGrid", () => {
  const now = new Date("2026-06-18T12:00:00");

  it("builds a 7-day window ending today with missing cells where no log", () => {
    const grid = buildDailySignalsGrid([], now, 7);
    expect(grid.dates).toHaveLength(7);
    expect(grid.dates[6]).toBe("2026-06-18");
    expect(grid.hasData).toBe(false);
    expect(grid.rows.every((r) => r.cells.every((c) => c.state === "missing"))).toBe(true);
  });

  it("marks normal vs changed per signal", () => {
    const logs = [
      log({ log_date: "2026-06-18", appetite: "reduced", vomiting_count: 2 }),
      log({ id: "l2", log_date: "2026-06-17" }),
    ];
    const grid = buildDailySignalsGrid(logs, now, 7);
    expect(grid.hasData).toBe(true);

    const appetite = grid.rows.find((r) => r.key === "appetite")!;
    expect(appetite.cells.find((c) => c.date === "2026-06-18")!.state).toBe("changed");
    expect(appetite.cells.find((c) => c.date === "2026-06-17")!.state).toBe("normal");

    const vomiting = grid.rows.find((r) => r.key === "vomiting")!;
    expect(vomiting.cells.find((c) => c.date === "2026-06-18")!.state).toBe("changed");
  });

  it("treats bathroom as changed when stool OR urination is off", () => {
    const logs = [log({ log_date: "2026-06-18", urination: "straining" })];
    const grid = buildDailySignalsGrid(logs, now, 7);
    const bathroom = grid.rows.find((r) => r.key === "bathroom")!;
    expect(bathroom.cells.find((c) => c.date === "2026-06-18")!.state).toBe("changed");
  });
});
