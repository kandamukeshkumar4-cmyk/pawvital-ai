/**
 * Self-check guide lookup — completeness guard
 *
 * Every question ID in QUESTION_TO_GUIDE_KEY must resolve to a non-null
 * SelfCheckGuide. This prevents silent guide-key drift as the guide library grows.
 */

import {
  QUESTION_TO_GUIDE_KEY,
  getGuideForQuestion,
} from "@/lib/symptom-chat/response-builders";

describe("QUESTION_TO_GUIDE_KEY completeness", () => {
  it("every mapped question ID resolves to a non-null SelfCheckGuide", () => {
    for (const [questionId, guideKey] of Object.entries(QUESTION_TO_GUIDE_KEY)) {
      const guide = getGuideForQuestion(questionId);
      expect(guide).not.toBeNull();
      expect(guide).not.toBeUndefined();
      if (guide) {
        expect(typeof guide.key).toBe("string");
        expect(guide.key).toBe(guideKey);
        expect(Array.isArray(guide.steps)).toBe(true);
        expect(guide.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns null for an unmapped question ID", () => {
    expect(getGuideForQuestion("nonexistent_question_id_xyz")).toBeNull();
  });

  it("gum_color_check maps to a guide with a gum-color title", () => {
    const guide = getGuideForQuestion("gum_color_check");
    expect(guide).not.toBeNull();
    expect(guide?.key).toBe("gum_color");
  });

  it("bloat_retching_abdomen_check maps to the abdominal distension guide", () => {
    const guide = getGuideForQuestion("bloat_retching_abdomen_check");
    expect(guide).not.toBeNull();
    expect(guide?.key).toBe("abdominal_distension");
  });
});
