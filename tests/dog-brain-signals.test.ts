import { detectDogBrainSignals } from "@/lib/dog-brain/signals";
import type { HealthLog } from "@/lib/health-log/types";

function log(overrides: Partial<HealthLog>): HealthLog {
  return {
    id: overrides.id ?? `log-${overrides.log_date ?? "2026-06-01"}`,
    user_id: "user-1",
    pet_id: "pet-1",
    log_date: "2026-06-01",
    appetite: "normal",
    water: "normal",
    stool: "normal",
    urination: "normal",
    vomiting_count: 0,
    energy: "normal",
    weight_kg: null,
    meds_given: false,
    notes: null,
    photo_urls: [],
    context_signals: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("detectDogBrainSignals", () => {
  it("returns stable with no signals for normal logs", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-03" }),
      log({ log_date: "2026-06-02" }),
      log({ log_date: "2026-06-01" }),
    ]);

    expect(result).toEqual({ state: "stable", signals: [] });
  });

  it("detects recent appetite and vomiting trends", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-03", appetite: "none", vomiting_count: 3 }),
      log({ log_date: "2026-06-02", appetite: "reduced", vomiting_count: 1 }),
      log({ log_date: "2026-06-01" }),
    ]);

    expect(result.state).toBe("needs_attention");
    expect(result.signals.map((signal) => signal.signal_type)).toEqual(
      expect.arrayContaining(["appetite_drop", "vomiting_trend"]),
    );
    expect(result.signals.find((signal) => signal.signal_type === "vomiting_trend")?.severity).toBe("alert");
  });

  it("flags blood in stool as needing attention", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-04", stool: "blood" }),
      log({ log_date: "2026-06-03" }),
    ]);

    expect(result.state).toBe("needs_attention");
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signal_type: "stool_change",
          severity: "alert",
        }),
      ]),
    );
  });

  it("detects weight downtrends and medication history without clinical dosing advice", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05", weight_kg: 18.8 }),
      log({
        log_date: "2026-06-03",
        weight_kg: 19.2,
        meds_given: true,
        context_signals: {
          medication: {
            name: "anti-nausea tablet",
            side_effect_notes: "sleepier than usual after the dose",
          },
        },
      }),
      log({ log_date: "2026-06-01", weight_kg: 20 }),
    ]);

    expect(result.state).toBe("needs_attention");
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signal_type: "weight_downtrend", severity: "alert" }),
        expect.objectContaining({ signal_type: "possible_med_side_effect", severity: "info" }),
      ]),
    );
    expect(result.signals.find((signal) => signal.signal_type === "possible_med_side_effect")?.next_action).toContain(
      "ask your vet before changing any dose",
    );
  });

  it("does not alarm an owner over a single isolated vomit", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05", vomiting_count: 1 }),
      log({ log_date: "2026-06-04", vomiting_count: 0 }),
      log({ log_date: "2026-06-03", vomiting_count: 0 }),
    ]);
    expect(result.signals.find((s) => s.signal_type === "vomiting_trend")).toBeUndefined();
  });

  it("needs at least 3 weigh-ins before calling a weight downtrend", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05", weight_kg: 18.8 }),
      log({ log_date: "2026-06-01", weight_kg: 20 }),
    ]);
    expect(result.signals.find((s) => s.signal_type === "weight_downtrend")).toBeUndefined();
  });

  it("does not call a dip-then-recovery a weight downtrend", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05", weight_kg: 18.5 }),
      log({ log_date: "2026-06-03", weight_kg: 15 }),
      log({ log_date: "2026-06-01", weight_kg: 20 }),
    ]);
    expect(result.signals.find((s) => s.signal_type === "weight_downtrend")).toBeUndefined();
  });
});
