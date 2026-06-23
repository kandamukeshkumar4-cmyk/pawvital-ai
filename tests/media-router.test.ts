/**
 * VET-1503 — Complaint-to-modality router tests.
 * Verifies deterministic routing decisions: correct modality + domain suggestions,
 * emergency guard, no-media cases, priority ordering.
 */

import { suggestMedia, hasUsableImageEvidence } from "@/lib/media-router";
import type { TriageSession } from "@/lib/triage-engine";

// ---------------------------------------------------------------------------
// Minimal TriageSession fixture builder
// ---------------------------------------------------------------------------

function makeSession(
  known_symptoms: string[] = [],
  overrides: Partial<TriageSession> = {}
): TriageSession {
  return {
    session_id: "test-session",
    pet_name: "Buddy",
    pet_species: "dog",
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    conversation_turns: 0,
    last_question_asked: null,
    known_symptoms,
    answered_questions: {},
    extracted_answers: {},
    unresolved_question_ids: [],
    active_concerns: [],
    red_flags: [],
    urgency_score: 0,
    urgency_label: "low",
    is_complete: false,
    latest_image_domain: undefined,
    latest_image_quality: undefined,
    latest_preprocess: undefined,
    latest_visual_evidence: undefined,
    visual_evidence_chain: [],
    service_observations: [],
    ...overrides,
  } as unknown as TriageSession;
}

// ---------------------------------------------------------------------------
// Emergency guard
// ---------------------------------------------------------------------------

describe("suggestMedia — emergency guard", () => {
  test.each([
    "collapse",
    "unconscious",
    "seizure",
    "not_breathing",
    "profuse_bleeding",
    "suspected_toxin_ingestion",
    "pale_gums",
    "blue_gums",
    "brick_red_gums",
  ])("returns null for emergency symptom: %s", (symptom) => {
    const session = makeSession([symptom]);
    expect(suggestMedia("dog is in distress", session)).toBeNull();
  });

  test("returns null even when complaint contains wound keywords during emergency", () => {
    const session = makeSession(["collapse", "wound_skin_issue"]);
    expect(suggestMedia("wound on leg, dog collapsed", session)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No-media cases
// ---------------------------------------------------------------------------

describe("suggestMedia — no media needed", () => {
  test("returns null for pure appetite change", () => {
    const session = makeSession(["not_eating"]);
    expect(suggestMedia("not eating today", session)).toBeNull();
  });

  test("returns null for behavioral complaint with no visual/audio symptoms", () => {
    const session = makeSession(["anxiety"]);
    expect(suggestMedia("seems anxious at night", session)).toBeNull();
  });

  test("returns null for lethargy alone", () => {
    const session = makeSession(["lethargy"]);
    expect(suggestMedia("seems tired and sluggish", session)).toBeNull();
  });

  test("returns null for empty complaint and no symptoms", () => {
    const session = makeSession([]);
    expect(suggestMedia("", session)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Image routing
// ---------------------------------------------------------------------------

describe("suggestMedia — image domain routing", () => {
  test("suggests skin_wound image when symptom key matches", () => {
    const session = makeSession(["wound_skin_issue"]);
    const result = suggestMedia("there is a cut on his leg", session);
    expect(result?.mediaType).toBe("image");
    expect(result && "domain" in result && result.domain).toBe("skin_wound");
  });

  test("suggests mass_swelling image from keyword alone (no symptom key)", () => {
    const session = makeSession([]);
    // "lump" is a mass_swelling keyword (not skin_wound) — deterministic routing.
    const result = suggestMedia("I noticed a lump on her back", session);
    expect(result?.mediaType).toBe("image");
    expect(result && "domain" in result && result.domain).toBe("mass_swelling");
  });

  test("suggests eye image for eye_discharge symptom", () => {
    const session = makeSession(["eye_discharge"]);
    const result = suggestMedia("goopy eye discharge", session);
    expect(result?.mediaType).toBe("image");
    expect(result && "domain" in result && result.domain).toBe("eye");
  });

  test("suggests eye image from keyword: squinting", () => {
    const session = makeSession([]);
    const result = suggestMedia("dog keeps squinting his right eye", session);
    expect(result?.mediaType).toBe("image");
    expect(result && "domain" in result && result.domain).toBe("eye");
  });

  test("suggests ear image for ear_scratching symptom", () => {
    const session = makeSession(["ear_scratching"]);
    const result = suggestMedia("keeps scratching his ear", session);
    expect(result?.mediaType).toBe("image");
    expect(result && "domain" in result && result.domain).toBe("ear");
  });

  test("suggests ear image from keyword: shaking head", () => {
    const session = makeSession([]);
    const result = suggestMedia("keeps shaking head all day", session);
    expect(result?.mediaType).toBe("image");
    expect(result && "domain" in result && result.domain).toBe("ear");
  });

  test("suggests stool_vomit image for vomiting symptom", () => {
    const session = makeSession(["vomiting"]);
    const result = suggestMedia("threw up twice this morning", session);
    expect(result?.mediaType).toBe("image");
    expect(result && "domain" in result && result.domain).toBe("stool_vomit");
  });

  test("combined reason when both symptom key and keyword match", () => {
    const session = makeSession(["wound_skin_issue"]);
    const result = suggestMedia("there is a wound on her paw", session);
    expect(result?.reason).toBe("combined_symptom_and_keyword");
  });

  test("symptom_key_match reason when only symptom matches", () => {
    const session = makeSession(["eye_discharge"]);
    const result = suggestMedia("she seems unwell today", session);
    expect(result?.reason).toBe("symptom_key_match");
  });

  test("image takes priority over audio when both domains match", () => {
    const session = makeSession(["wound_skin_issue", "coughing"]);
    const result = suggestMedia("wound and coughing", session);
    // Image is checked first and should win
    expect(result?.mediaType).toBe("image");
  });
});

// ---------------------------------------------------------------------------
// Audio routing
// ---------------------------------------------------------------------------

describe("suggestMedia — audio domain routing", () => {
  test("suggests respiratory_cough audio for coughing symptom", () => {
    const session = makeSession(["coughing"]);
    const result = suggestMedia("has been coughing a lot", session);
    expect(result?.mediaType).toBe("audio");
    expect(result && "domain" in result && result.domain).toBe("respiratory_cough");
  });

  test("suggests respiratory_labored audio for difficulty_breathing (labored first)", () => {
    const session = makeSession(["difficulty_breathing"]);
    const result = suggestMedia("breathing very hard and fast", session);
    expect(result?.mediaType).toBe("audio");
    expect(result && "domain" in result && result.domain).toBe("respiratory_labored");
  });

  test("suggests respiratory_labored from keywords: breathing fast", () => {
    const session = makeSession([]);
    const result = suggestMedia("breathing fast and can't catch breath", session);
    expect(result?.mediaType).toBe("audio");
    expect(result && "domain" in result && result.domain).toBe("respiratory_labored");
  });

  test("suggests audio includes durationGuidance", () => {
    const session = makeSession(["coughing"]);
    const result = suggestMedia("coughing all day", session);
    expect(result && "durationGuidance" in result && result.durationGuidance.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Temporal routing
// ---------------------------------------------------------------------------

describe("suggestMedia — temporal domain routing", () => {
  test("suggests gait_lameness temporal for limping symptom", () => {
    const session = makeSession(["limping"]);
    const result = suggestMedia("dog is limping", session);
    expect(result?.mediaType).toBe("temporal");
    expect(result && "domain" in result && result.domain).toBe("gait_lameness");
  });

  test("suggests gait_lameness temporal from keyword", () => {
    const session = makeSession([]);
    const result = suggestMedia("she is favoring her front left leg", session);
    expect(result?.mediaType).toBe("temporal");
    expect(result && "domain" in result && result.domain).toBe("gait_lameness");
  });

  test("temporal includes frameGuidance", () => {
    const session = makeSession(["limping"]);
    const result = suggestMedia("limping since yesterday", session);
    expect(result && "frameGuidance" in result && result.frameGuidance.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// hasUsableImageEvidence
// ---------------------------------------------------------------------------

describe("hasUsableImageEvidence", () => {
  test("returns false when no image domain set", () => {
    expect(hasUsableImageEvidence(makeSession([]))).toBe(false);
  });

  test("returns false when domain is unsupported", () => {
    const session = makeSession([], {
      latest_image_domain: "unsupported",
      latest_image_quality: "good",
    } as Partial<TriageSession>);
    expect(hasUsableImageEvidence(session)).toBe(false);
  });

  test("returns false when quality is poor", () => {
    const session = makeSession([], {
      latest_image_domain: "skin_wound",
      latest_image_quality: "poor",
    } as Partial<TriageSession>);
    expect(hasUsableImageEvidence(session)).toBe(false);
  });

  test("returns true when domain is valid and quality is good", () => {
    const session = makeSession([], {
      latest_image_domain: "skin_wound",
      latest_image_quality: "good",
    } as Partial<TriageSession>);
    expect(hasUsableImageEvidence(session)).toBe(true);
  });

  test("returns true for borderline quality", () => {
    const session = makeSession([], {
      latest_image_domain: "eye",
      latest_image_quality: "borderline",
    } as Partial<TriageSession>);
    expect(hasUsableImageEvidence(session)).toBe(true);
  });
});
