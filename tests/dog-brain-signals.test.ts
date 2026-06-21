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

  it("detects the thirst+urination (PU/PD) pattern as a watch signal", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05", water: "more", urination: "more" }),
      log({ log_date: "2026-06-04", water: "more", urination: "more" }),
      log({ log_date: "2026-06-03" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "water_urination_change");
    expect(sig?.severity).toBe("watch");
    expect(sig?.owner_message.toLowerCase()).toContain("water intake");
  });

  it("flags straining to urinate as an alert with an urgent next action", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05", urination: "straining" }),
      log({ log_date: "2026-06-04" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "water_urination_change");
    expect(sig?.severity).toBe("alert");
    expect(sig?.next_action.toLowerCase()).toContain("vet");
  });

  it("picks up increased thirst from context_signals.urinary alone", () => {
    const result = detectDogBrainSignals([
      log({
        log_date: "2026-06-05",
        context_signals: { urinary: { increased_thirst: true } },
      }),
      log({ log_date: "2026-06-04" }),
    ]);
    expect(
      result.signals.find((s) => s.signal_type === "water_urination_change"),
    ).toBeDefined();
  });

  it("stays silent on normal water and urination", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05" }),
      log({ log_date: "2026-06-04" }),
    ]);
    expect(
      result.signals.find((s) => s.signal_type === "water_urination_change"),
    ).toBeUndefined();
  });

  it("detects sustained limping as a mobility/pain watch signal with the limb noted", () => {
    const result = detectDogBrainSignals([
      log({
        log_date: "2026-06-05",
        context_signals: { mobility: { limping: true, limb: "left hind" } },
      }),
      log({
        log_date: "2026-06-04",
        context_signals: { mobility: { limping: true } },
      }),
      log({ log_date: "2026-06-03" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "mobility_pain_change");
    expect(sig?.severity).toBe("watch");
    expect(sig?.owner_message).toContain("left hind");
  });

  it("treats a single reluctant-to-move day as info, not watch", () => {
    const result = detectDogBrainSignals([
      log({
        log_date: "2026-06-05",
        context_signals: { mobility: { reluctance_to_move: true } },
      }),
      log({ log_date: "2026-06-04" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "mobility_pain_change");
    expect(sig?.severity).toBe("info");
  });

  it("stays silent on normal mobility", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05" }),
      log({ log_date: "2026-06-04" }),
    ]);
    expect(
      result.signals.find((s) => s.signal_type === "mobility_pain_change"),
    ).toBeUndefined();
  });

  it("flags labored breathing as a watch signal with an urgent next action", () => {
    const result = detectDogBrainSignals([
      log({
        log_date: "2026-06-05",
        context_signals: { breathing: { labored: true } },
      }),
      log({ log_date: "2026-06-04" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "breathing_cough_change");
    expect(sig?.severity).toBe("watch");
    expect(sig?.next_action.toLowerCase()).toContain("vet");
  });

  it("treats a single cough day as info", () => {
    const result = detectDogBrainSignals([
      log({
        log_date: "2026-06-05",
        context_signals: { breathing: { coughing: true } },
      }),
      log({ log_date: "2026-06-04" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "breathing_cough_change");
    expect(sig?.severity).toBe("info");
    expect(sig?.owner_message.toLowerCase()).toContain("coughing");
  });

  it("stays silent on normal breathing", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05" }),
      log({ log_date: "2026-06-04" }),
    ]);
    expect(
      result.signals.find((s) => s.signal_type === "breathing_cough_change"),
    ).toBeUndefined();
  });

  it("flags a hot spot as a skin/ear watch signal", () => {
    const result = detectDogBrainSignals([
      log({
        log_date: "2026-06-05",
        context_signals: { skin_ear: { hot_spot: true } },
      }),
      log({ log_date: "2026-06-04" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "skin_ear_change");
    expect(sig?.severity).toBe("watch");
    expect(sig?.owner_message.toLowerCase()).toContain("hot spot");
  });

  it("treats a single scratching day as info", () => {
    const result = detectDogBrainSignals([
      log({
        log_date: "2026-06-05",
        context_signals: { skin_ear: { scratching: true } },
      }),
      log({ log_date: "2026-06-04" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "skin_ear_change");
    expect(sig?.severity).toBe("info");
  });

  it("escalates recurring head shaking to watch", () => {
    const result = detectDogBrainSignals([
      log({
        log_date: "2026-06-05",
        context_signals: { skin_ear: { head_shaking: true } },
      }),
      log({
        log_date: "2026-06-04",
        context_signals: { skin_ear: { head_shaking: true } },
      }),
      log({ log_date: "2026-06-03" }),
    ]);
    const sig = result.signals.find((s) => s.signal_type === "skin_ear_change");
    expect(sig?.severity).toBe("watch");
  });

  it("stays silent on normal skin and ears", () => {
    const result = detectDogBrainSignals([
      log({ log_date: "2026-06-05" }),
      log({ log_date: "2026-06-04" }),
    ]);
    expect(
      result.signals.find((s) => s.signal_type === "skin_ear_change"),
    ).toBeUndefined();
  });
});
