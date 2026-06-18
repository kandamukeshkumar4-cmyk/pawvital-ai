import { summarizeDailyLogsForContext } from "@/lib/health-log/context";
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

describe("summarizeDailyLogsForContext", () => {
  it("returns empty string for no logs", () => {
    expect(summarizeDailyLogsForContext([], "Bruno")).toBe("");
  });

  it("says all-normal when nothing is off, and always carries the non-override disclaimer", () => {
    const out = summarizeDailyLogsForContext([log()], "Bruno");
    expect(out).toContain("Bruno");
    expect(out.toLowerCase()).toContain("all signs logged as normal");
    expect(out.toLowerCase()).toContain("do not override clinical assessment");
  });

  it("summarizes off signs with counts and values", () => {
    const out = summarizeDailyLogsForContext(
      [
        log({ id: "a", log_date: "2026-06-16", appetite: "reduced" }),
        log({ id: "b", log_date: "2026-06-17", appetite: "reduced", stool: "diarrhea" }),
        log({ id: "c", log_date: "2026-06-18", appetite: "normal" }),
      ],
      "Bruno",
    );
    expect(out.toLowerCase()).toContain("appetite off on 2 of 3 days");
    expect(out.toLowerCase()).toContain("reduced");
    expect(out.toLowerCase()).toContain("stool off on 1 of 3 days");
  });

  it("aggregates vomiting episodes across days", () => {
    const out = summarizeDailyLogsForContext(
      [
        log({ id: "a", log_date: "2026-06-17", vomiting_count: 1 }),
        log({ id: "b", log_date: "2026-06-18", vomiting_count: 2 }),
      ],
      "Bruno",
    );
    expect(out.toLowerCase()).toContain("vomiting reported on 2 days");
    expect(out.toLowerCase()).toContain("3 episodes total");
  });

  it("reports a weight trend over the period", () => {
    const out = summarizeDailyLogsForContext(
      [
        log({ id: "a", log_date: "2026-06-12", weight_kg: 30 }),
        log({ id: "b", log_date: "2026-06-18", weight_kg: 28.5 }),
      ],
      "Bruno",
    );
    expect(out.toLowerCase()).toContain("weight down 1.5 kg over the period");
    expect(out.toLowerCase()).toContain("now 28.5 kg");
  });

  it("labels itself owner-reported and never claims a diagnosis", () => {
    const out = summarizeDailyLogsForContext(
      [log({ appetite: "none", stool: "blood", vomiting_count: 4 })],
      "Bruno",
    );
    expect(out.toLowerCase()).toContain("owner-reported observations");
    expect(out.toLowerCase()).toContain("not clinical measurements");
    // no diagnostic language
    expect(out.toLowerCase()).not.toMatch(/diagnos|likely (has|disease)|gastro/);
  });

  it("caps at 14 logs and frames the window with the date range", () => {
    const many: HealthLog[] = Array.from({ length: 20 }, (_, i) =>
      log({ id: `l${i}`, log_date: `2026-06-${String(i + 1).padStart(2, "0")}` }),
    );
    const out = summarizeDailyLogsForContext(many, "Bruno");
    expect(out).toContain("last 14 days");
  });
});
