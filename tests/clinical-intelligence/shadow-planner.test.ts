import { getQuestionCardById } from "@/lib/clinical-intelligence/question-card-registry";
import {
  buildShadowPlannerComparison,
  createEmptyShadowPlannerComparisonResult,
  isShadowPlannerComparisonReady,
  type ShadowPlannedQuestionInput,
} from "@/lib/clinical-intelligence/shadow-planner";
import {
  buildShadowTelemetryRecord,
  createEmptyShadowTelemetryRecord,
  SHADOW_TELEMETRY_CONTRACT_VERSION,
  SHADOW_TELEMETRY_EVENT_NAME,
} from "@/lib/clinical-intelligence/shadow-telemetry";

const lookupQuestionCard = (questionId: string) => getQuestionCardById(questionId);

function makePlannedQuestion(
  questionId: string,
  overrides?: Partial<ShadowPlannedQuestionInput>
): ShadowPlannedQuestionInput {
  const card = getQuestionCardById(questionId);

  if (!card) {
    throw new Error(`Expected question card "${questionId}" to exist`);
  }

  return {
    questionId: card.id,
    shortReason: card.shortReason,
    screenedRedFlags: [...card.screensRedFlags],
    selectedBecause: "emergency_screen",
    ...overrides,
  };
}

describe("shadow planner comparison scaffold", () => {
  it("creates a safe empty result by default", () => {
    expect(createEmptyShadowPlannerComparisonResult()).toEqual({
      existingQuestionId: null,
      plannedQuestionId: null,
      plannedShortReason: null,
      screenedRedFlags: [],
      selectedBecause: null,
      oldWasGeneric: false,
      newScreensEmergencyEarlier: false,
      repeatedQuestionAvoided: false,
      safetyNotes: [],
    });
  });

  it("returns a safe partial result when planned question input is incomplete", () => {
    const result = buildShadowPlannerComparison({
      existingQuestionId: "gi_vomiting_frequency",
      lookupQuestionCard,
    });

    expect(result.existingQuestionId).toBe("gi_vomiting_frequency");
    expect(result.plannedQuestionId).toBeNull();
    expect(result.plannedShortReason).toBeNull();
    expect(result.oldWasGeneric).toBe(false);
    expect(isShadowPlannerComparisonReady(result)).toBe(false);
  });

  it("marks the existing global screen as generic and preserves planner notes", () => {
    const result = buildShadowPlannerComparison({
      existingQuestionId: "emergency_global_screen",
      plannedQuestion: makePlannedQuestion("toxin_exposure_check"),
      askedQuestionIds: ["emergency_global_screen"],
      lookupQuestionCard,
      plannerSafetyNotes: [
        "shadow-only comparison; do not change owner-facing output",
      ],
    });

    expect(result.existingQuestionId).toBe("emergency_global_screen");
    expect(result.plannedQuestionId).toBe("toxin_exposure_check");
    expect(result.oldWasGeneric).toBe(true);
    expect(result.newScreensEmergencyEarlier).toBe(false);
    expect(result.repeatedQuestionAvoided).toBe(true);
    expect(result.screenedRedFlags).toEqual(
      expect.arrayContaining(["known_toxin_ingestion", "suspected_toxin"])
    );
    expect(result.safetyNotes).toContain(
      "shadow-only comparison; do not change owner-facing output"
    );
    expect(isShadowPlannerComparisonReady(result)).toBe(true);
  });

  it("flags when the shadow plan would screen emergency earlier than the existing path", () => {
    const result = buildShadowPlannerComparison({
      existingQuestionId: "gi_vomiting_frequency",
      plannedQuestion: makePlannedQuestion("toxin_exposure_check"),
      askedQuestionIds: ["gi_vomiting_frequency"],
      answeredQuestionIds: ["gi_vomiting_frequency"],
      lookupQuestionCard,
    });

    expect(result.oldWasGeneric).toBe(false);
    expect(result.newScreensEmergencyEarlier).toBe(true);
    expect(result.repeatedQuestionAvoided).toBe(true);
  });

  it("does not claim repetition avoidance when the planned question was already asked", () => {
    const result = buildShadowPlannerComparison({
      existingQuestionId: "gi_vomiting_frequency",
      plannedQuestion: makePlannedQuestion("toxin_exposure_check"),
      askedQuestionIds: ["toxin_exposure_check"],
      lookupQuestionCard,
    });

    expect(result.repeatedQuestionAvoided).toBe(false);
  });
});

describe("shadow telemetry contract scaffold", () => {
  it("creates an empty telemetry record with no runtime effect", () => {
    const record = createEmptyShadowTelemetryRecord();

    expect(record.eventName).toBe(SHADOW_TELEMETRY_EVENT_NAME);
    expect(record.contractVersion).toBe(
      SHADOW_TELEMETRY_CONTRACT_VERSION
    );
    expect(record.ownerFacingImpact).toBe("none");
    expect(record.activeComplaintModule).toBeNull();
    expect(record.comparisonReady).toBe(false);
    expect(record.comparison.plannedQuestionId).toBeNull();
  });

  it("wraps a comparison result in the telemetry contract without mutating caller arrays", () => {
    const comparison = buildShadowPlannerComparison({
      existingQuestionId: "gi_vomiting_frequency",
      plannedQuestion: makePlannedQuestion("toxin_exposure_check"),
      lookupQuestionCard,
      plannerSafetyNotes: ["planner metadata note"],
    });

    const record = buildShadowTelemetryRecord({
      activeComplaintModule: "toxin_poisoning_exposure",
      comparison,
    });

    expect(record.eventName).toBe(SHADOW_TELEMETRY_EVENT_NAME);
    expect(record.contractVersion).toBe(
      SHADOW_TELEMETRY_CONTRACT_VERSION
    );
    expect(record.ownerFacingImpact).toBe("none");
    expect(record.activeComplaintModule).toBe("toxin_poisoning_exposure");
    expect(record.comparisonReady).toBe(true);
    expect(record.comparison.plannedQuestionId).toBe("toxin_exposure_check");

    record.comparison.screenedRedFlags.push("mutated");
    record.comparison.safetyNotes.push("mutated");

    const secondRecord = buildShadowTelemetryRecord({
      activeComplaintModule: "toxin_poisoning_exposure",
      comparison,
    });

    expect(secondRecord.comparison.screenedRedFlags).not.toContain("mutated");
    expect(secondRecord.comparison.safetyNotes).not.toContain("mutated");
  });
});
