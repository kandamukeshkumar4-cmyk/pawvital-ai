/**
 * VET-1003: Vision / Text Contradiction Detection Pack
 *
 * Tests the deriveVisionContradictions and shouldTriggerSyncConsult helpers
 * exported from src/lib/symptom-chat/report-helpers.ts.
 *
 * These are the only two functions exercised here. No runtime route code
 * is changed. All five vision-contradiction patterns currently implemented
 * in deriveVisionContradictions are covered with true-positive, true-negative,
 * and edge-case sub-tests.
 *
 * For the full contradiction catalog (including text-level patterns from
 * docs/ood-guardrails.md), see:
 *   tests/fixtures/clinical/contradiction-cases.json
 *
 * For the future mapping to the uncertainty-contract conflicting_evidence
 * reason, see:
 *   docs/tickets/VET-1003-contradiction-detection-pack.md
 */

// ── Module-level mocks (must appear before any imports) ──────────────────────

jest.mock("next/server", () => ({ after: jest.fn() }));

jest.mock("@/lib/knowledge-retrieval", () => ({
  searchKnowledgeChunks: jest.fn(),
  searchReferenceImages: jest.fn(),
}));

jest.mock("@/lib/image-retrieval-service", () => ({
  isImageRetrievalConfigured: jest.fn(() => false),
  retrieveVeterinaryImageEvidence: jest.fn(),
}));

jest.mock("@/lib/text-retrieval-service", () => ({
  isTextRetrievalConfigured: jest.fn(() => false),
  retrieveVeterinaryTextEvidence: jest.fn(),
}));

jest.mock("@/lib/hf-sidecars", () => ({
  isAbortLikeError: jest.fn(() => false),
  isRetrievalSidecarConfigured: jest.fn(() => false),
  retrieveVeterinaryEvidenceFromSidecar: jest.fn(),
}));

jest.mock("@/lib/nvidia-models", () => ({
  verifyWithGLM: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import type { TriageSession } from "@/lib/triage-engine";
import type {
  VisionClinicalEvidence,
  VisionPreprocessResult,
} from "@/lib/clinical-evidence";
import {
  deriveVisionContradictions,
  shouldTriggerSyncConsult,
} from "@/lib/symptom-chat/report-helpers";
import contradictionCases from "./fixtures/clinical/contradiction-cases.json";

// ── Minimal test-double builders ─────────────────────────────────────────────

function makeSession(overrides: Partial<TriageSession> = {}): TriageSession {
  return {
    known_symptoms: [],
    answered_questions: [],
    extracted_answers: {},
    red_flags_triggered: [],
    candidate_diseases: [],
    body_systems_involved: [],
    ...overrides,
  };
}

function makeEvidence(
  overrides: Partial<VisionClinicalEvidence> = {}
): VisionClinicalEvidence {
  return {
    domain: "skin_wound",
    bodyRegion: null,
    findings: [],
    severity: "normal",
    confidence: 0.75,
    supportedSymptoms: [],
    contradictions: [],
    requiresConsult: false,
    limitations: [],
    influencedQuestionSelection: false,
    ...overrides,
  };
}

function makePreprocess(
  overrides: Partial<VisionPreprocessResult> = {}
): VisionPreprocessResult {
  return {
    domain: "skin_wound",
    bodyRegion: null,
    detectedRegions: [],
    bestCrop: null,
    imageQuality: "good",
    confidence: 0.75,
    limitations: [],
    ...overrides,
  };
}

// ── deriveVisionContradictions ────────────────────────────────────────────────

describe("deriveVisionContradictions", () => {
  // ── vc-001: eye domain mismatch ─────────────────────────────────────────────

  describe("vc-001: eye domain — owner text has no eye content", () => {
    it("flags contradiction when preprocess is eye domain, owner text is about limping, and no eye_discharge symptom", () => {
      const result = deriveVisionContradictions(
        "my dog has been limping since yesterday",
        makeSession({ known_symptoms: ["limping"] }),
        makeEvidence({ domain: "eye" }),
        makePreprocess({ domain: "eye" })
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toContain(
        "image suggests an eye-focused issue while owner text is about a different complaint"
      );
    });

    it("does NOT flag when owner text explicitly mentions eye", () => {
      const result = deriveVisionContradictions(
        "my dog has a sore eye and is also limping",
        makeSession({ known_symptoms: ["limping"] }),
        makeEvidence({ domain: "eye" }),
        makePreprocess({ domain: "eye" })
      );

      expect(result).not.toContain(
        "image suggests an eye-focused issue while owner text is about a different complaint"
      );
    });

    it("does NOT flag when session already has eye_discharge symptom even without eye in text", () => {
      const result = deriveVisionContradictions(
        "my dog is limping badly",
        makeSession({ known_symptoms: ["limping", "eye_discharge"] }),
        makeEvidence({ domain: "eye" }),
        makePreprocess({ domain: "eye" })
      );

      expect(result).not.toContain(
        "image suggests an eye-focused issue while owner text is about a different complaint"
      );
    });
  });

  // ── vc-002: ear domain mismatch ─────────────────────────────────────────────

  describe("vc-002: ear domain — owner text has no ear content", () => {
    it("flags contradiction when preprocess is ear domain, owner text describes diarrhea, no ear symptom", () => {
      const result = deriveVisionContradictions(
        "my dog has been having loose stools all day",
        makeSession({ known_symptoms: ["diarrhea"] }),
        makeEvidence({ domain: "ear" }),
        makePreprocess({ domain: "ear" })
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toContain(
        "image suggests an ear-focused issue while owner text is about a different complaint"
      );
    });

    it("does NOT flag when owner text mentions ear", () => {
      const result = deriveVisionContradictions(
        "my dog keeps scratching at his ear and shaking his head",
        makeSession({ known_symptoms: ["ear_scratching"] }),
        makeEvidence({ domain: "ear" }),
        makePreprocess({ domain: "ear" })
      );

      expect(result).toHaveLength(0);
    });

    it("does NOT flag when session already has ear_scratching symptom", () => {
      const result = deriveVisionContradictions(
        "not sure what is going on",
        makeSession({ known_symptoms: ["ear_scratching"] }),
        makeEvidence({ domain: "ear" }),
        makePreprocess({ domain: "ear" })
      );

      expect(result).not.toContain(
        "image suggests an ear-focused issue while owner text is about a different complaint"
      );
    });
  });

  // ── vc-003: stool/vomit domain mismatch ─────────────────────────────────────

  describe("vc-003: stool_vomit domain — owner text has no vomit or stool content", () => {
    it("flags contradiction when preprocess is stool_vomit but owner describes a skin rash", () => {
      const result = deriveVisionContradictions(
        "there is a big rash on my dog's belly",
        makeSession({ known_symptoms: ["wound_skin_issue"] }),
        makeEvidence({ domain: "stool_vomit" }),
        makePreprocess({ domain: "stool_vomit" })
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toContain(
        "image suggests stool or vomit evidence that is not clearly described in the owner message"
      );
    });

    it("does NOT flag when owner text mentions vomit", () => {
      const result = deriveVisionContradictions(
        "she vomited three times this morning — here is a photo of it",
        makeSession({ known_symptoms: ["vomiting"] }),
        makeEvidence({ domain: "stool_vomit" }),
        makePreprocess({ domain: "stool_vomit" })
      );

      expect(result).toHaveLength(0);
    });

    it("does NOT flag when owner text mentions diarrhea", () => {
      const result = deriveVisionContradictions(
        "my dog has had diarrhea since last night",
        makeSession({ known_symptoms: ["diarrhea"] }),
        makeEvidence({ domain: "stool_vomit" }),
        makePreprocess({ domain: "stool_vomit" })
      );

      expect(result).toHaveLength(0);
    });

    it("does NOT flag when owner text mentions stool", () => {
      const result = deriveVisionContradictions(
        "I am attaching a photo of the stool",
        makeSession({ known_symptoms: ["diarrhea"] }),
        makeEvidence({ domain: "stool_vomit" }),
        makePreprocess({ domain: "stool_vomit" })
      );

      expect(result).toHaveLength(0);
    });
  });

  // ── vc-004: body region mismatch ────────────────────────────────────────────

  describe("vc-004: body region — owner says left but image shows right", () => {
    it("flags contradiction when which_leg is 'left front' but evidence bodyRegion is 'right paw'", () => {
      const result = deriveVisionContradictions(
        "she is limping on her left front leg",
        makeSession({
          known_symptoms: ["limping"],
          extracted_answers: { which_leg: "left front" },
        }),
        makeEvidence({ domain: "skin_wound", bodyRegion: "right paw" }),
        makePreprocess({ domain: "skin_wound", bodyRegion: "right paw" })
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toContain(
        "owner-reported location and image body region do not fully align"
      );
    });

    it("does NOT flag when which_leg and bodyRegion agree on left", () => {
      const result = deriveVisionContradictions(
        "she is limping on her left front leg",
        makeSession({
          known_symptoms: ["limping"],
          extracted_answers: { which_leg: "left front" },
        }),
        makeEvidence({ domain: "skin_wound", bodyRegion: "left paw" }),
        makePreprocess({ domain: "skin_wound", bodyRegion: "left paw" })
      );

      expect(result).toHaveLength(0);
    });

    it("does NOT flag when which_leg has no directional qualifier (no left/right)", () => {
      const result = deriveVisionContradictions(
        "she is limping on a front leg",
        makeSession({
          known_symptoms: ["limping"],
          extracted_answers: { which_leg: "front" },
        }),
        makeEvidence({ domain: "skin_wound", bodyRegion: "right paw" }),
        makePreprocess({ domain: "skin_wound", bodyRegion: "right paw" })
      );

      // which_leg has no left/right → mismatch rule should not fire
      expect(result).not.toContain(
        "owner-reported location and image body region do not fully align"
      );
    });

    it("does NOT flag when bodyRegion is null", () => {
      const result = deriveVisionContradictions(
        "she is limping on her left leg",
        makeSession({
          known_symptoms: ["limping"],
          extracted_answers: { which_leg: "left front" },
        }),
        makeEvidence({ domain: "skin_wound", bodyRegion: null }),
        makePreprocess({ domain: "skin_wound", bodyRegion: null })
      );

      expect(result).not.toContain(
        "owner-reported location and image body region do not fully align"
      );
    });
  });

  // ── vc-005: visual severity escalation without text red flags ────────────────

  describe("vc-005: urgent visual severity without matching text red flags", () => {
    it("flags contradiction when evidence.severity is urgent, analysis has no urgency markers, no red flags", () => {
      const result = deriveVisionContradictions(
        "my dog has a small scratch",
        makeSession({
          known_symptoms: ["wound_skin_issue"],
          red_flags_triggered: [],
          vision_analysis:
            '{"severity": "needs_review", "findings": ["laceration"]}',
        }),
        makeEvidence({ domain: "skin_wound", severity: "urgent" }),
        makePreprocess({ domain: "skin_wound" })
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toContain(
        "visual severity is high without matching text red flags"
      );
    });

    it("does NOT flag when session has red flags triggered", () => {
      const result = deriveVisionContradictions(
        "my dog has a deep wound that will not stop bleeding",
        makeSession({
          known_symptoms: ["wound_skin_issue"],
          red_flags_triggered: ["severe_bleeding"],
          vision_analysis: '{"findings": ["active laceration"]}',
        }),
        makeEvidence({ domain: "skin_wound", severity: "urgent" }),
        makePreprocess({ domain: "skin_wound" })
      );

      expect(result).not.toContain(
        "visual severity is high without matching text red flags"
      );
    });

    it("does NOT flag when vision_analysis text contains 'urgent'", () => {
      const result = deriveVisionContradictions(
        "my dog has a wound",
        makeSession({
          known_symptoms: ["wound_skin_issue"],
          red_flags_triggered: [],
          vision_analysis: '{"severity": "urgent", "findings": ["deep laceration"]}',
        }),
        makeEvidence({ domain: "skin_wound", severity: "urgent" }),
        makePreprocess({ domain: "skin_wound" })
      );

      expect(result).not.toContain(
        "visual severity is high without matching text red flags"
      );
    });

    it("does NOT flag when severity is needs_review (below the urgent threshold)", () => {
      const result = deriveVisionContradictions(
        "my dog has a small bump",
        makeSession({
          known_symptoms: ["wound_skin_issue"],
          red_flags_triggered: [],
          vision_analysis: '{"findings": ["minor irritation"]}',
        }),
        makeEvidence({ domain: "skin_wound", severity: "needs_review" }),
        makePreprocess({ domain: "skin_wound" })
      );

      expect(result).not.toContain(
        "visual severity is high without matching text red flags"
      );
    });
  });

  // ── baseline: no contradictions on consistent inputs ─────────────────────────

  describe("baseline: consistent inputs produce no contradictions", () => {
    it("returns empty when image domain matches owner description (skin/wound case)", () => {
      const result = deriveVisionContradictions(
        "my dog has a wound on her leg from a fence",
        makeSession({ known_symptoms: ["wound_skin_issue"] }),
        makeEvidence({ domain: "skin_wound", severity: "needs_review" }),
        makePreprocess({ domain: "skin_wound" })
      );

      expect(result).toHaveLength(0);
    });

    it("returns empty when preprocess is null", () => {
      const result = deriveVisionContradictions(
        "my dog has been limping",
        makeSession({ known_symptoms: ["limping"] }),
        makeEvidence({ domain: "skin_wound" }),
        null
      );

      expect(result).toHaveLength(0);
    });

    it("returns empty when evidence.severity is normal and no red flags are needed", () => {
      const result = deriveVisionContradictions(
        "my dog has a tiny scrape on his paw",
        makeSession({
          known_symptoms: ["wound_skin_issue"],
          red_flags_triggered: [],
          vision_analysis: '{"severity": "normal"}',
        }),
        makeEvidence({ domain: "skin_wound", severity: "normal" }),
        makePreprocess({ domain: "skin_wound" })
      );

      expect(result).toHaveLength(0);
    });
  });
});

// ── shouldTriggerSyncConsult ──────────────────────────────────────────────────

describe("shouldTriggerSyncConsult", () => {
  it("returns true when contradictions array is non-empty", () => {
    const result = shouldTriggerSyncConsult({
      visualEvidence: makeEvidence({ confidence: 0.85, severity: "normal" }),
      preprocess: makePreprocess(),
      ownerText: "my dog has been limping",
      session: makeSession(),
      contradictions: [
        "image suggests an eye-focused issue while owner text is about a different complaint",
      ],
    });

    expect(result).toBe(true);
  });

  it("returns false when contradictions are empty and all other risk signals are below threshold", () => {
    const result = shouldTriggerSyncConsult({
      visualEvidence: makeEvidence({
        domain: "skin_wound",
        confidence: 0.85,
        severity: "normal",
      }),
      preprocess: makePreprocess({ detectedRegions: [] }),
      ownerText: "my dog has a small rash on her belly",
      session: makeSession({ extracted_answers: {} }),
      contradictions: [],
    });

    expect(result).toBe(false);
  });

  it("returns true when low vision confidence is present regardless of empty contradictions", () => {
    const result = shouldTriggerSyncConsult({
      visualEvidence: makeEvidence({ confidence: 0.55, severity: "normal" }),
      preprocess: makePreprocess(),
      ownerText: "photo is a bit blurry but here is the wound",
      session: makeSession(),
      contradictions: [],
    });

    expect(result).toBe(true);
  });

  it("returns true when ownerText says left but which_leg says right (implicit location conflict)", () => {
    const result = shouldTriggerSyncConsult({
      visualEvidence: makeEvidence({ confidence: 0.85, severity: "normal" }),
      preprocess: makePreprocess(),
      ownerText: "she is favouring her left leg",
      session: makeSession({
        extracted_answers: { which_leg: "right front" },
      }),
      contradictions: [],
    });

    expect(result).toBe(true);
  });

  it("returns true when evidence severity is urgent", () => {
    const result = shouldTriggerSyncConsult({
      visualEvidence: makeEvidence({ confidence: 0.8, severity: "urgent" }),
      preprocess: makePreprocess(),
      ownerText: "my dog has a large wound",
      session: makeSession(),
      contradictions: [],
    });

    expect(result).toBe(true);
  });
});

// ── Fixture catalog integrity ─────────────────────────────────────────────────

describe("contradiction-cases fixture catalog", () => {
  const cases = contradictionCases.cases as Array<{
    id: string;
    category: string;
    contradiction_id: string;
    resolution: string;
    future_uncertainty_reason: string;
  }>;

  it("has at least 12 cases (7 text + 5 vision)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
  });

  it("every case has a future_uncertainty_reason of 'conflicting_evidence'", () => {
    for (const c of cases) {
      expect(c.future_uncertainty_reason).toBe("conflicting_evidence");
    }
  });

  it("covers all 7 text-text contradiction IDs from docs/ood-guardrails.md", () => {
    const textIds = cases
      .filter((c) => c.category === "text_text")
      .map((c) => c.contradiction_id);

    expect(textIds).toContain("appetite_conflict");
    expect(textIds).toContain("energy_conflict");
    expect(textIds).toContain("onset_conflict");
    expect(textIds).toContain("water_conflict");
    expect(textIds).toContain("gum_conflict");
    expect(textIds).toContain("breathing_conflict");
    expect(textIds).toContain("puppy_age_conflict");
  });

  it("covers all 5 vision-text contradiction IDs from report-helpers.ts", () => {
    const visionIds = cases
      .filter((c) => c.category === "vision_text")
      .map((c) => c.contradiction_id);

    expect(visionIds).toContain("vision_eye_domain_mismatch");
    expect(visionIds).toContain("vision_ear_domain_mismatch");
    expect(visionIds).toContain("vision_stool_vomit_mismatch");
    expect(visionIds).toContain("vision_body_region_mismatch");
    expect(visionIds).toContain("vision_severity_escalation_mismatch");
  });

  it("every case ID is unique", () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gum_conflict and breathing_conflict resolve to escalate (safety-critical)", () => {
    const escalateCases = cases
      .filter((c) => ["gum_conflict", "breathing_conflict"].includes(c.contradiction_id))
      .map((c) => c.resolution);

    expect(escalateCases).toHaveLength(2);
    for (const r of escalateCases) {
      expect(r).toBe("escalate");
    }
  });
});
