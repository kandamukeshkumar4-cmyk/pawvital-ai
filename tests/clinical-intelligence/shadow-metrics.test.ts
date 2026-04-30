import {
  buildShadowPlannerComparison,
  createEmptyShadowPlannerComparisonResult,
} from "@/lib/clinical-intelligence/shadow-planner";
import {
  buildShadowTelemetryRecord,
  createEmptyShadowTelemetryRecord,
} from "@/lib/clinical-intelligence/shadow-telemetry";
import {
  isShadowOutputSafeForInternalDisplay,
  summarizeShadowMetrics,
} from "@/lib/clinical-intelligence/shadow-metrics";
import { getQuestionCardById } from "@/lib/clinical-intelligence/question-card-registry";

const lookupQuestionCard = (questionId: string) => getQuestionCardById(questionId);

describe("shadow metrics reporter scaffold", () => {
  it("returns a safe zero summary for empty input", () => {
    expect(summarizeShadowMetrics([])).toEqual({
      totalComparisons: 0,
      oldGenericQuestionCount: 0,
      oldGenericQuestionRate: 0,
      newScreensEmergencyEarlierCount: 0,
      newScreensEmergencyEarlierRate: 0,
      repeatedQuestionAvoidedCount: 0,
      repeatedQuestionAvoidedRate: 0,
      plannedQuestionAvailableCount: 0,
      plannedQuestionAvailableRate: 0,
      selectedBecauseCounts: {},
      screenedRedFlagCounts: {},
      safetyNoteCounts: {},
    });
  });

  it("summarizes one comparison", () => {
    const comparison = buildShadowPlannerComparison({
      existingQuestionId: "emergency_global_screen",
      plannedQuestion: {
        questionId: "toxin_exposure_check",
        shortReason: "Screen for toxin exposure",
        screenedRedFlags: ["known_toxin_ingestion", "suspected_toxin"],
        selectedBecause: "emergency_screen",
      },
      askedQuestionIds: ["emergency_global_screen"],
      lookupQuestionCard,
      plannerSafetyNotes: ["internal-only note"],
    });

    const summary = summarizeShadowMetrics([comparison]);

    expect(summary.totalComparisons).toBe(1);
    expect(summary.oldGenericQuestionCount).toBe(1);
    expect(summary.oldGenericQuestionRate).toBe(1);
    expect(summary.newScreensEmergencyEarlierCount).toBe(0);
    expect(summary.repeatedQuestionAvoidedCount).toBe(1);
    expect(summary.plannedQuestionAvailableCount).toBe(1);
    expect(summary.selectedBecauseCounts).toEqual({ emergency_screen: 1 });
    expect(summary.screenedRedFlagCounts).toEqual({
      known_toxin_ingestion: 1,
      suspected_toxin: 1,
    });
    expect(summary.safetyNoteCounts["internal-only note"]).toBe(1);
  });

  it("aggregates multiple direct and telemetry-wrapped comparisons", () => {
    const first = buildShadowPlannerComparison({
      existingQuestionId: "emergency_global_screen",
      plannedQuestion: {
        questionId: "toxin_exposure_check",
        shortReason: "Screen for toxin exposure",
        screenedRedFlags: ["known_toxin_ingestion", "suspected_toxin"],
        selectedBecause: "emergency_screen",
      },
      askedQuestionIds: ["emergency_global_screen"],
      lookupQuestionCard,
      plannerSafetyNotes: ["shared note"],
    });

    const second = buildShadowPlannerComparison({
      existingQuestionId: "gi_vomiting_frequency",
      plannedQuestion: {
        questionId: "toxin_exposure_check",
        shortReason: "Screen for toxin exposure",
        screenedRedFlags: [
          "known_toxin_ingestion",
          "suspected_toxin",
          "known_toxin_ingestion",
        ],
        selectedBecause: "clarification",
      },
      answeredQuestionIds: ["gi_vomiting_frequency"],
      lookupQuestionCard,
      plannerSafetyNotes: ["shared note", "second note"],
    });

    const summary = summarizeShadowMetrics([
      first,
      buildShadowTelemetryRecord({
        activeComplaintModule: "toxin_poisoning_exposure",
        comparison: second,
      }),
    ]);

    expect(summary.totalComparisons).toBe(2);
    expect(summary.oldGenericQuestionCount).toBe(1);
    expect(summary.oldGenericQuestionRate).toBe(0.5);
    expect(summary.newScreensEmergencyEarlierCount).toBe(1);
    expect(summary.newScreensEmergencyEarlierRate).toBe(0.5);
    expect(summary.repeatedQuestionAvoidedCount).toBe(2);
    expect(summary.repeatedQuestionAvoidedRate).toBe(1);
    expect(summary.plannedQuestionAvailableCount).toBe(2);
    expect(summary.plannedQuestionAvailableRate).toBe(1);
    expect(summary.selectedBecauseCounts).toEqual({
      emergency_screen: 1,
      clarification: 1,
    });
    expect(summary.screenedRedFlagCounts).toEqual({
      known_toxin_ingestion: 2,
      suspected_toxin: 2,
    });
    expect(summary.safetyNoteCounts).toEqual({
      "shared note": 2,
      "second note": 1,
    });
  });

  it("does not throw when planned fields are missing", () => {
    const summary = summarizeShadowMetrics([
      {
        comparison: {
          existingQuestionId: "gi_vomiting_frequency",
          oldWasGeneric: false,
        },
      },
      {
        existingQuestionId: "timeline_onset",
        selectedBecause: null,
        screenedRedFlags: undefined,
        safetyNotes: undefined,
      },
    ]);

    expect(summary.totalComparisons).toBe(2);
    expect(summary.plannedQuestionAvailableCount).toBe(0);
    expect(summary.selectedBecauseCounts).toEqual({});
    expect(summary.screenedRedFlagCounts).toEqual({});
    expect(summary.safetyNoteCounts).toEqual({});
  });

  it("counts selectedBecause, red flags, and safety notes from partial records", () => {
    const summary = summarizeShadowMetrics([
      {
        selectedBecause: "report_value",
        screenedRedFlags: ["pale_gums", "pale_gums", "collapse"],
        safetyNotes: ["note-a", "note-a", "note-b"],
      },
    ]);

    expect(summary.selectedBecauseCounts).toEqual({ report_value: 1 });
    expect(summary.screenedRedFlagCounts).toEqual({
      pale_gums: 1,
      collapse: 1,
    });
    expect(summary.safetyNoteCounts).toEqual({
      "note-a": 1,
      "note-b": 1,
    });
  });

  it("returns defensive clones for nested count objects", () => {
    const comparison = buildShadowPlannerComparison({
      existingQuestionId: "emergency_global_screen",
      plannedQuestion: {
        questionId: "toxin_exposure_check",
        shortReason: "Screen for toxin exposure",
        screenedRedFlags: ["known_toxin_ingestion"],
        selectedBecause: "emergency_screen",
      },
      lookupQuestionCard,
      plannerSafetyNotes: ["clone-check"],
    });

    const firstSummary = summarizeShadowMetrics([comparison]);
    firstSummary.selectedBecauseCounts["mutated"] = 99;
    firstSummary.screenedRedFlagCounts["mutated"] = 99;
    firstSummary.safetyNoteCounts["mutated"] = 99;

    const secondSummary = summarizeShadowMetrics([comparison]);
    expect(secondSummary.selectedBecauseCounts).not.toHaveProperty("mutated");
    expect(secondSummary.screenedRedFlagCounts).not.toHaveProperty("mutated");
    expect(secondSummary.safetyNoteCounts).not.toHaveProperty("mutated");
  });

  it("identifies shadow output as internally safe and non-owner-facing", () => {
    expect(
      isShadowOutputSafeForInternalDisplay(createEmptyShadowPlannerComparisonResult())
    ).toBe(true);
    expect(
      isShadowOutputSafeForInternalDisplay(createEmptyShadowTelemetryRecord())
    ).toBe(true);
    expect(
      isShadowOutputSafeForInternalDisplay({
        ownerFacingImpact: "summary",
      } as never)
    ).toBe(false);
    expect(
      isShadowOutputSafeForInternalDisplay({
        ownerText: "Visible owner message",
      } as never)
    ).toBe(false);
  });
});
