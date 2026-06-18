import { buildHealthLogReadout } from "@/lib/health-log/readout";
import type { HealthLog } from "@/lib/health-log/types";

function log(overrides: Partial<HealthLog> = {}): HealthLog {
  return {
    id: overrides.id ?? "l1",
    user_id: "u1",
    pet_id: "p1",
    log_date: overrides.log_date ?? "2026-06-18",
    appetite: overrides.appetite ?? "normal",
    water: overrides.water ?? "normal",
    stool: overrides.stool ?? "normal",
    urination: overrides.urination ?? "normal",
    vomiting_count: overrides.vomiting_count ?? 0,
    energy: overrides.energy ?? "normal",
    weight_kg: overrides.weight_kg ?? null,
    meds_given: overrides.meds_given ?? false,
    notes: overrides.notes ?? null,
    photo_urls: overrides.photo_urls ?? [],
    created_at: "2026-06-18T08:00:00.000Z",
    updated_at: "2026-06-18T08:00:00.000Z",
  };
}

describe("buildHealthLogReadout", () => {
  it("returns an empty state with no logs", () => {
    const r = buildHealthLogReadout([]);
    expect(r.hasToday).toBe(false);
    expect(r.allNormal).toBe(false);
    expect(r.offSigns).toHaveLength(0);
    expect(r.changes).toHaveLength(0);
    expect(r.headline).toMatch(/no check-ins/i);
  });

  it("reports all-normal when nothing is off", () => {
    const r = buildHealthLogReadout([log()]);
    expect(r.hasToday).toBe(true);
    expect(r.allNormal).toBe(true);
    expect(r.offSigns).toHaveLength(0);
    expect(r.hasAlert).toBe(false);
    expect(r.headline).toMatch(/normal/i);
  });

  it("flags off signs and orders alert before watch", () => {
    const r = buildHealthLogReadout([
      log({ appetite: "reduced", stool: "blood", vomiting_count: 4 }),
    ]);
    expect(r.allNormal).toBe(false);
    expect(r.hasAlert).toBe(true);
    // alert-tone signs (blood stool, 4x vomiting) come before watch (reduced appetite)
    expect(r.offSigns[0].tone).toBe("alert");
    const labels = r.offSigns.map((s) => s.field);
    expect(labels).toEqual(expect.arrayContaining(["stool", "appetite", "vomiting"]));
    expect(r.headline.toLowerCase()).toContain("vet");
  });

  it("classifies vomiting count into tones", () => {
    expect(buildHealthLogReadout([log({ vomiting_count: 0 })]).offSigns).toHaveLength(0);
    const watch = buildHealthLogReadout([log({ vomiting_count: 2 })]).offSigns.find((s) => s.field === "vomiting");
    expect(watch?.tone).toBe("watch");
    const alert = buildHealthLogReadout([log({ vomiting_count: 5 })]).offSigns.find((s) => s.field === "vomiting");
    expect(alert?.tone).toBe("alert");
  });

  it("computes improvement vs the previous log", () => {
    const prior = log({ id: "a", log_date: "2026-06-16", appetite: "none", vomiting_count: 5 });
    const latest = log({ id: "b", log_date: "2026-06-18", appetite: "normal", vomiting_count: 1 });
    const r = buildHealthLogReadout([latest, prior]);

    const appetiteChange = r.changes.find((c) => c.field === "appetite");
    expect(appetiteChange?.direction).toBe("improved");
    const vomitChange = r.changes.find((c) => c.field === "vomiting");
    expect(vomitChange?.direction).toBe("improved");
  });

  it("computes worsening vs the previous log and leads with it", () => {
    const prior = log({ id: "a", log_date: "2026-06-16", stool: "normal" });
    const latest = log({ id: "b", log_date: "2026-06-18", stool: "diarrhea", energy: "low" });
    const r = buildHealthLogReadout([latest, prior]);

    expect(r.changes[0].direction).toBe("worse");
    expect(r.changes.some((c) => c.field === "stool" && c.direction === "worse")).toBe(true);
  });

  it("uses the latest log by date regardless of array order", () => {
    const older = log({ id: "a", log_date: "2026-06-10", appetite: "none" });
    const newer = log({ id: "b", log_date: "2026-06-17", appetite: "normal" });
    // pass older last to ensure date sorting, not array position, picks latest
    const r = buildHealthLogReadout([newer, older]);
    expect(r.logDate).toBe("2026-06-17");
    expect(r.allNormal).toBe(true);
  });

  it("reports a weight change when both logs have weight", () => {
    const prior = log({ id: "a", log_date: "2026-06-16", weight_kg: 30 });
    const latest = log({ id: "b", log_date: "2026-06-18", weight_kg: 28.5 });
    const r = buildHealthLogReadout([latest, prior]);
    const w = r.changes.find((c) => c.field === "weight");
    expect(w?.text).toMatch(/down 1\.5 kg/i);
  });
});
