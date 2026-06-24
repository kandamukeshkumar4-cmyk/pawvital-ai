import {
  rankDetectedSignals,
  rankDetectedSignalsWithScores,
  scoreDetectedSignal,
  type MemoryRankingContext,
} from "@/lib/dog-brain/memory-ranking";
import type { DetectedSignal, SignalSeverity, SignalType } from "@/lib/dog-brain/types";

const NOW = new Date("2026-06-23T12:00:00Z");

function sig(
  signal_type: SignalType,
  severity: SignalSeverity,
  dedupe_key = "",
  extra: Partial<DetectedSignal> = {},
): DetectedSignal {
  return {
    signal_type,
    severity,
    owner_message: `${signal_type} owner message`,
    dedupe_key,
    ...extra,
  };
}

describe("rankDetectedSignals — supportive tiebreak ordering", () => {
  it("returns empty for empty input (pure, no side effects)", () => {
    expect(rankDetectedSignals([])).toEqual([]);
  });

  it("90-day repeated issue can outrank one old isolated note (same severity)", () => {
    const repeated = sig(
      "stool_change",
      "watch",
      "stool|2026-06-21|2026-06-19|2026-06-17|2026-06-15",
    );
    const isolated = sig("vomiting_trend", "watch", "vomit|2026-04-10");
    const ranked = rankDetectedSignals([isolated, repeated], {}, NOW);
    expect(ranked[0]).toBe(repeated);
    expect(ranked[1]).toBe(isolated);
  });

  it("recent issue outranks an equally-severe old one (recency)", () => {
    const recent = sig("appetite_drop", "watch", "appetite|2026-06-23");
    const old = sig("skin_ear_change", "watch", "skin|2026-04-01");
    const ranked = rankDetectedSignals([old, recent], {}, NOW);
    expect(ranked[0]).toBe(recent);
  });

  it("supplement worse/side_effect outcome lifts a GI signal within its tier", () => {
    const gi = sig("stool_change", "watch", "stool|2026-06-20");
    const other = sig("mobility_pain_change", "watch", "mobility|2026-06-20");

    // Without context the two are tied on every term → stable input order.
    expect(rankDetectedSignals([other, gi], {}, NOW)).toEqual([other, gi]);

    // A worsening supplement trial nudges the GI signal ahead.
    const ctx: MemoryRankingContext = {
      supplementTrials: [{ outcome: "worse", status: "active" }],
    };
    expect(rankDetectedSignals([other, gi], ctx, NOW)).toEqual([gi, other]);
  });

  it("an unresolved follow-up matching a signal lifts it within its tier", () => {
    const matched = sig("vomiting_trend", "watch", "vomit|2026-06-20");
    const unmatched = sig("mobility_pain_change", "watch", "mobility|2026-06-20");
    const ctx: MemoryRankingContext = {
      followups: [{ prompt: "Has the vomiting settled since your last check-in?", status: "pending" }],
    };
    expect(rankDetectedSignals([unmatched, matched], ctx, NOW)).toEqual([
      matched,
      unmatched,
    ]);
  });

  it("a symptom-map-backed signal outranks an unmapped med-note signal at the same tier", () => {
    const mapped = sig("vomiting_trend", "watch");
    const unmapped = sig("possible_med_side_effect", "watch");
    // Even with a concerning supplement trial (which the med-note signal is
    // responsive to), the mapped signal still wins on map relevance.
    const ctx: MemoryRankingContext = {
      supplementTrials: [{ outcome: "side_effect", status: "active" }],
    };
    expect(rankDetectedSignals([unmapped, mapped], ctx, NOW)[0]).toBe(mapped);
  });
});

describe("rankDetectedSignals — urgency safety contract", () => {
  it("a benign info signal can NEVER outrank a higher-severity alert signal", () => {
    const alert = sig("vomiting_trend", "alert"); // no dates, no extra credit
    const benignRich = sig(
      "stool_change",
      "info",
      "stool|2026-06-23|2026-06-22|2026-06-21|2026-06-20|2026-06-19",
      { confidence: 1 },
    );
    const ranked = rankDetectedSignals([benignRich, alert], {}, NOW);
    expect(ranked[0]).toBe(alert);
  });

  it("severity tier gap exceeds the max of all other terms combined", () => {
    // Maximally-boosted watch signal vs a bare alert signal: alert still wins.
    const bareAlert = sig("vomiting_trend", "alert");
    const loadedWatch = sig(
      "stool_change",
      "watch",
      "stool|2026-06-23|2026-06-22|2026-06-21|2026-06-20|2026-06-19",
      { confidence: 1 },
    );
    const ctx: MemoryRankingContext = {
      followups: [{ prompt: "stool update?", status: "pending" }],
      supplementTrials: [{ outcome: "worse", status: "active" }],
      vetRecordText: "history of loose stool and diarrhea",
    };
    const [a] = rankDetectedSignalsWithScores([loadedWatch, bareAlert], ctx, NOW);
    expect(a.signal).toBe(bareAlert);
  });

  it("does not mutate the input signals (severity is preserved verbatim)", () => {
    const input = [sig("stool_change", "info", "stool|2026-06-23"), sig("vomiting_trend", "alert")];
    const before = JSON.parse(JSON.stringify(input));
    rankDetectedSignals(input, {}, NOW);
    expect(input).toEqual(before);
  });

  it("score is a finite number, never an urgency/severity string", () => {
    const { score, signal } = scoreDetectedSignal(sig("stool_change", "watch", "stool|2026-06-23"), {}, NOW);
    expect(typeof score).toBe("number");
    expect(Number.isFinite(score)).toBe(true);
    expect(signal.severity).toBe("watch"); // unchanged
  });
});

describe("scoreDetectedSignal — deterministic components", () => {
  it("ignores future/garbled dates (no recency credit)", () => {
    const future = scoreDetectedSignal(sig("stool_change", "info", "stool|2099-01-01"), {}, NOW);
    expect(future.components.recency).toBe(0);
  });

  it("credits repeated distinct dates but caps the contribution", () => {
    const many = scoreDetectedSignal(
      sig(
        "stool_change",
        "info",
        "s|2026-06-23|2026-06-22|2026-06-21|2026-06-20|2026-06-19|2026-06-18|2026-06-17",
      ),
      {},
      NOW,
    );
    expect(many.components.repetition).toBe(25); // min(count,5)*5
  });

  it("is stable for equal scores (input order preserved)", () => {
    const a = sig("stool_change", "watch", "stool|2026-06-20");
    const b = sig("vomiting_trend", "watch", "vomit|2026-06-20");
    expect(rankDetectedSignals([a, b], {}, NOW)).toEqual([a, b]);
    expect(rankDetectedSignals([b, a], {}, NOW)).toEqual([b, a]);
  });
});
