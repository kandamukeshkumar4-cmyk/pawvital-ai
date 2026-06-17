import {
  buildMediaScorecard,
  type MediaScorecard,
} from "@/lib/symptom-chat/report-helpers";
import { createSession } from "@/lib/triage-engine";
import type { VisionClinicalEvidence, VisionPreprocessResult } from "@/lib/clinical-evidence";

function makeEvidence(
  overrides: Partial<VisionClinicalEvidence> = {}
): VisionClinicalEvidence {
  return {
    domain: "skin_wound",
    bodyRegion: "flank",
    findings: ["redness", "swelling"],
    severity: "needs_review",
    confidence: 0.78,
    supportedSymptoms: ["wound_skin_issue"],
    contradictions: [],
    requiresConsult: false,
    limitations: [],
    influencedQuestionSelection: true,
    ...overrides,
  };
}

function makePreprocess(
  overrides: Partial<VisionPreprocessResult> = {}
): VisionPreprocessResult {
  return {
    domain: "skin_wound",
    bodyRegion: "flank",
    detectedRegions: [],
    bestCrop: null,
    imageQuality: "good",
    confidence: 0.78,
    limitations: [],
    ...overrides,
  };
}

describe("VET-1510: buildMediaScorecard", () => {
  it("returns null when no visual evidence is present", () => {
    const session = createSession();
    expect(buildMediaScorecard(session)).toBeNull();
  });

  it("builds a scorecard from visual evidence + preprocess", () => {
    const session = createSession();
    session.latest_visual_evidence = makeEvidence();
    session.latest_preprocess = makePreprocess();

    const card = buildMediaScorecard(session) as MediaScorecard;

    expect(card).not.toBeNull();
    expect(card.domain).toBe("skin_wound");
    expect(card.confidence).toBe(0.78);
    expect(card.quality).toBe("good");
    expect(card.abstention_reason).toBeNull();
    expect(card.advisory_only).toBe(true);
    expect(card.influenced_question_selection).toBe(true);
    expect(card.limitations).toEqual([]);
  });

  it("falls back to 'unknown' quality when preprocess is absent", () => {
    const session = createSession();
    session.latest_visual_evidence = makeEvidence();

    const card = buildMediaScorecard(session) as MediaScorecard;
    expect(card.quality).toBe("unknown");
  });

  it("sets abstention_reason when findings are empty and limitations exist", () => {
    const session = createSession();
    session.latest_visual_evidence = makeEvidence({
      findings: [],
      limitations: ["image_too_blurry", "low_resolution"],
    });
    session.latest_preprocess = makePreprocess({ imageQuality: "poor" });

    const card = buildMediaScorecard(session) as MediaScorecard;

    expect(card.abstention_reason).toBe("image_too_blurry");
    expect(card.limitations).toEqual(["image_too_blurry", "low_resolution"]);
    expect(card.quality).toBe("poor");
  });

  it("does not set abstention_reason when findings are present despite limitations", () => {
    const session = createSession();
    session.latest_visual_evidence = makeEvidence({
      findings: ["redness"],
      limitations: ["lighting_suboptimal"],
    });

    const card = buildMediaScorecard(session) as MediaScorecard;
    expect(card.abstention_reason).toBeNull();
  });

  it("advisory_only is always true — vision never raises clinical urgency alone", () => {
    const session = createSession();
    session.latest_visual_evidence = makeEvidence({ severity: "urgent" });

    const card = buildMediaScorecard(session) as MediaScorecard;
    expect(card.advisory_only).toBe(true);
  });

  it("influenced_question_selection reflects evidence flag", () => {
    const session = createSession();
    session.latest_visual_evidence = makeEvidence({
      influencedQuestionSelection: false,
    });

    const card = buildMediaScorecard(session) as MediaScorecard;
    expect(card.influenced_question_selection).toBe(false);
  });
});
