import {
  getClinicalPlannerMode,
  shouldRecordPlannerShadow,
  shouldUseLegacyQuestionSelection,
  shouldUsePlannerQuestionLive,
} from "@/lib/symptom-chat/turn-pipeline/planner-mode";

describe("clinical planner mode", () => {
  it("defaults to shadow when unset", () => {
    expect(getClinicalPlannerMode({})).toBe("shadow");
  });

  it("enables live planner selection only in live mode", () => {
    expect(
      shouldUsePlannerQuestionLive("live", "which_leg")
    ).toBe(true);
    expect(
      shouldUsePlannerQuestionLive("shadow", "which_leg")
    ).toBe(false);
    expect(shouldUseLegacyQuestionSelection("legacy")).toBe(true);
    expect(shouldRecordPlannerShadow("shadow")).toBe(true);
    expect(shouldRecordPlannerShadow("legacy")).toBe(false);
  });
});
