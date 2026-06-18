import { buildOwnerReadout } from "@/lib/analytics/owner-readout";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import type {
  ProductBaselineShiftDirection,
  ProductIntelligenceSnapshot,
} from "@/lib/product-intelligence";

const NOW = new Date("2026-06-18T12:00:00.000Z");

function entry(overrides: Partial<SymptomCheckEntry> = {}): SymptomCheckEntry {
  return {
    id: overrides.id ?? "e1",
    pet_id: overrides.pet_id ?? "pet-1",
    pet_name: overrides.pet_name ?? "Bella",
    created_at: overrides.created_at ?? NOW.toISOString(),
    primary_symptom: overrides.primary_symptom ?? "Vomiting",
    severity: overrides.severity ?? "moderate",
    urgency: overrides.urgency ?? "monitor",
    top_diagnosis: overrides.top_diagnosis ?? "Upset stomach",
    confidence: overrides.confidence ?? 0.8,
    report_summary: overrides.report_summary,
  };
}

function snapshot(
  direction: ProductBaselineShiftDirection,
): ProductIntelligenceSnapshot {
  return {
    state: "stable",
    confidence: "medium",
    displayScore: 70,
    baselineShift: {
      direction,
      confidence: "medium",
      latestScore: 70,
      baselineScore: 60,
      delta: 10,
      evidenceChips: [],
      missingEvidenceChips: [],
      ownerSummary: "",
      deterministicOverride: null,
    },
    evidenceCoverage: 1,
    evidenceChips: [],
    missingEvidenceChips: [],
    nextEvidencePrompt: null,
    deterministicOverride: null,
    ownerSummary: "",
    claimGuard: "",
    persistenceAllowed: true,
    persistenceBlockedReasons: [],
  };
}

describe("buildOwnerReadout", () => {
  it("returns an empty data state with no verdict when there are no checks", () => {
    const readout = buildOwnerReadout({
      entries: [],
      snapshot: snapshot("unknown"),
      now: NOW,
      fallbackPetName: "Rex",
    });

    expect(readout.dataState).toBe("empty");
    expect(readout.verdict).toBeNull();
    expect(readout.checkCount).toBe(0);
    expect(readout.petName).toBe("Rex");
    expect(readout.trend.trend).toBe("insufficient");
    expect(readout.trend.showChart).toBe(false);
    expect(readout.signs).toHaveLength(0);
  });

  it("maps each urgency level to the correct plain-language verdict state", () => {
    const cases: Array<[SymptomCheckEntry["urgency"], string]> = [
      ["monitor", "watch"],
      ["schedule", "schedule"],
      ["urgent", "urgent"],
      ["emergency", "emergency"],
    ];

    for (const [urgency, expectedState] of cases) {
      const readout = buildOwnerReadout({
        entries: [entry({ urgency })],
        snapshot: snapshot("unknown"),
        now: NOW,
      });
      expect(readout.verdict?.state).toBe(expectedState);
    }
  });

  it("flags emergency=true only for the emergency urgency", () => {
    const emergency = buildOwnerReadout({
      entries: [entry({ urgency: "emergency" })],
      snapshot: snapshot("unknown"),
      now: NOW,
    });
    const monitor = buildOwnerReadout({
      entries: [entry({ urgency: "monitor" })],
      snapshot: snapshot("unknown"),
      now: NOW,
    });

    expect(emergency.verdict?.emergency).toBe(true);
    expect(monitor.verdict?.emergency).toBe(false);
  });

  it("treats a single check as the 'single' data state with a text-only trend", () => {
    const readout = buildOwnerReadout({
      entries: [entry({ urgency: "monitor" })],
      snapshot: snapshot("unknown"),
      now: NOW,
    });

    expect(readout.dataState).toBe("single");
    expect(readout.checkCount).toBe(1);
    expect(readout.verdict).not.toBeNull();
    expect(readout.trend.showChart).toBe(false);
    expect(readout.trend.detail).toContain("1 so far");
  });

  it("treats two checks as 'building' and still withholds the trend line", () => {
    const entries = [
      entry({ id: "a", created_at: "2026-06-14T12:00:00.000Z" }),
      entry({ id: "b", created_at: "2026-06-16T12:00:00.000Z" }),
    ];
    const readout = buildOwnerReadout({
      entries,
      snapshot: snapshot("improving"),
      now: NOW,
    });

    expect(readout.dataState).toBe("building");
    expect(readout.trend.trend).toBe("insufficient");
    // A 2-point line reads as a direction the copy isn't ready to claim.
    expect(readout.trend.showChart).toBe(false);
  });

  it("uses the latest check for the verdict, regardless of input order", () => {
    const older = entry({
      id: "old",
      created_at: new Date("2026-06-10T12:00:00.000Z").toISOString(),
      urgency: "emergency",
    });
    const newer = entry({
      id: "new",
      created_at: new Date("2026-06-17T12:00:00.000Z").toISOString(),
      urgency: "monitor",
    });

    // Pass newest first to ensure sorting, not array position, decides "latest".
    const readout = buildOwnerReadout({
      entries: [newer, older],
      snapshot: snapshot("steady"),
      now: NOW,
    });

    expect(readout.verdict?.state).toBe("watch");
    expect(readout.verdict?.emergency).toBe(false);
  });

  it("derives a real trend from the deterministic baseline direction once data is ready", () => {
    const entries = [
      entry({ id: "a", created_at: "2026-06-10T12:00:00.000Z", severity: "serious" }),
      entry({ id: "b", created_at: "2026-06-13T12:00:00.000Z", severity: "moderate" }),
      entry({ id: "c", created_at: "2026-06-16T12:00:00.000Z", severity: "mild" }),
    ];

    const improving = buildOwnerReadout({
      entries,
      snapshot: snapshot("improving"),
      now: NOW,
    });
    expect(improving.dataState).toBe("ready");
    expect(improving.trend.trend).toBe("improving");
    expect(improving.trend.showChart).toBe(true);
    expect(improving.trend.series).toHaveLength(3);

    const worsening = buildOwnerReadout({
      entries,
      snapshot: snapshot("declining"),
      now: NOW,
    });
    expect(worsening.trend.trend).toBe("worsening");

    const urgentOverride = buildOwnerReadout({
      entries,
      snapshot: snapshot("urgent_override"),
      now: NOW,
    });
    expect(urgentOverride.trend.trend).toBe("worsening");

    const steady = buildOwnerReadout({
      entries,
      snapshot: snapshot("steady"),
      now: NOW,
    });
    expect(steady.trend.trend).toBe("steady");
  });

  it("builds plain-language sign chips from the latest check", () => {
    const readout = buildOwnerReadout({
      entries: [entry({ primary_symptom: "Limping", severity: "serious", urgency: "urgent" })],
      snapshot: snapshot("unknown"),
      now: NOW,
    });

    const labels = readout.signs.map((s) => s.label);
    expect(labels).toContain("Limping");
    expect(labels).toContain("Serious");
    // serious severity → alert tone on the symptom chip
    expect(readout.signs[0]).toEqual({ label: "Limping", tone: "alert" });
  });

  it("builds 'why this status' drivers from the latest sign, reason, and recurrence", () => {
    const entries = [
      entry({ id: "a", created_at: "2026-06-10T12:00:00.000Z", primary_symptom: "Vomiting", urgency: "urgent", severity: "serious" }),
      entry({ id: "b", created_at: "2026-06-16T12:00:00.000Z", primary_symptom: "Vomiting", urgency: "urgent", severity: "serious" }),
    ];
    const readout = buildOwnerReadout({ entries, snapshot: snapshot("steady"), now: NOW });

    expect(readout.drivers.length).toBeGreaterThanOrEqual(2);
    expect(readout.drivers[0].label.toLowerCase()).toContain("vomiting");
    // recurrence driver present because "Vomiting" appears in an earlier check
    expect(readout.drivers.some((d) => d.label.toLowerCase().includes("noted this before"))).toBe(true);
    // never surfaces a diagnosis label
    expect(readout.drivers.some((d) => d.label.toLowerCase().includes("gastro"))).toBe(false);
  });

  it("gives an adaptive next-step nudge keyed to the latest symptom", () => {
    const vomit = buildOwnerReadout({
      entries: [entry({ primary_symptom: "Vomiting and lethargy" })],
      snapshot: snapshot("unknown"),
      now: NOW,
    });
    expect(vomit.nextStep?.title.toLowerCase()).toMatch(/vomit|appetite|energy/);

    const limp = buildOwnerReadout({
      entries: [entry({ primary_symptom: "Limping after a walk" })],
      snapshot: snapshot("unknown"),
      now: NOW,
    });
    expect(limp.nextStep?.title.toLowerCase()).toContain("limp");

    const unknown = buildOwnerReadout({
      entries: [entry({ primary_symptom: "Something unusual" })],
      snapshot: snapshot("unknown"),
      now: NOW,
    });
    expect(unknown.nextStep?.title.toLowerCase()).toContain("check in");
  });

  it("summarises a vet packet with check count and urgent flags", () => {
    const entries = [
      entry({ id: "a", urgency: "monitor" }),
      entry({ id: "b", urgency: "urgent" }),
      entry({ id: "c", urgency: "emergency" }),
    ];
    const readout = buildOwnerReadout({ entries, snapshot: snapshot("steady"), now: NOW });

    expect(readout.vetPacket.ready).toBe(true);
    expect(readout.vetPacket.checkCount).toBe(3);
    expect(readout.vetPacket.urgentFlags).toBe(2);
    expect(readout.vetPacket.rangeLabel).toBe("3 checks");
  });

  it("returns an unready, empty vet packet and no drivers/next-step with zero checks", () => {
    const readout = buildOwnerReadout({ entries: [], snapshot: snapshot("unknown"), now: NOW });
    expect(readout.vetPacket.ready).toBe(false);
    expect(readout.vetPacket.checkCount).toBe(0);
    expect(readout.drivers).toHaveLength(0);
    expect(readout.nextStep).toBeNull();
  });

  it("never returns an all-clear: every non-empty verdict keeps a vet path in its copy", () => {
    for (const urgency of ["monitor", "schedule", "urgent", "emergency"] as const) {
      const readout = buildOwnerReadout({
        entries: [entry({ urgency })],
        snapshot: snapshot("unknown"),
        now: NOW,
      });
      const copy = `${readout.verdict?.subline} ${readout.verdict?.ctaLabel}`.toLowerCase();
      expect(copy).toMatch(/vet|call|check/);
    }
  });
});
