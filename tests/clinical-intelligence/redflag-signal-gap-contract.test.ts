import { EMERGENCY_RED_FLAG_IDS, isEmergencyRedFlagId } from "../../src/lib/clinical-intelligence/emergency-red-flags";
import { detectSignals } from "../../src/lib/clinical-intelligence/clinical-signal-detector";

// ---------------------------------------------------------------------------
// Contract data — blocked candidates identified by VET-1424K gap audit.
// Each entry documents existing red flags/signals, missing ones, and readiness.
// ---------------------------------------------------------------------------

interface BlockedCandidateContract {
  candidateId: string;
  displayName: string;
  existingRedFlags: string[];
  existingSignals: string[];
  proposedRedFlags: string[];
  proposedSignals: string[];
  missingQuestionCards: string[];
  canRaiseUrgency: boolean;
  canBecomeExplicitAnswer: boolean;
  requiredConfirmationQuestionId: string | null;
  unsafeOverlapRisks: string[];
  ready: boolean;
  blockedReasons: string[];
}

const BLOCKED_CANDIDATES: BlockedCandidateContract[] = [
  {
    candidateId: "eye_vision_discharge",
    displayName: "Eye / Vision / Discharge",
    existingRedFlags: [],
    existingSignals: [],
    proposedRedFlags: [
      "proposed_eye_injury",
      "proposed_sudden_blindness",
      "proposed_eye_protrusion",
      "proposed_severe_eye_discharge",
    ],
    proposedSignals: [
      "proposed_possible_eye_emergency",
      "proposed_possible_vision_loss",
    ],
    missingQuestionCards: [
      "eye_discharge_check",
      "eye_swelling_check",
      "vision_change_check",
      "eye_injury_check",
    ],
    canRaiseUrgency: true,
    canBecomeExplicitAnswer: false,
    requiredConfirmationQuestionId: "emergency_global_screen",
    unsafeOverlapRisks: [
      "Without eye-specific red flags, eye complaints may silently route to respiratory_distress or seizure_collapse_neuro via generic collapse/breathing flags.",
    ],
    ready: false,
    blockedReasons: ["missing_question_cards", "missing_red_flags", "missing_signals"],
  },
  {
    candidateId: "ear_head_tilt_balance",
    displayName: "Ear / Head-Tilt / Balance",
    existingRedFlags: [],
    existingSignals: [
      "possible_neuro_emergency",
      "possible_collapse_or_weakness",
    ],
    proposedRedFlags: [
      "proposed_ear_infection_severe",
      "proposed_vestibular_event",
    ],
    proposedSignals: [
      "proposed_possible_ear_emergency",
      "proposed_possible_vestibular_attack",
    ],
    missingQuestionCards: [
      "ear_pain_check",
      "ear_discharge_check",
      "head_tilt_check",
      "balance_loss_check",
    ],
    canRaiseUrgency: true,
    canBecomeExplicitAnswer: false,
    requiredConfirmationQuestionId: "seizure_neuro_check",
    unsafeOverlapRisks: [
      "Head-tilt currently routes to seizure_collapse_neuro via possible_neuro_emergency signal; dedicated ear module without ear-specific red flags would mis-route inner-ear infections as neuro emergencies.",
    ],
    ready: false,
    blockedReasons: ["missing_question_cards", "missing_red_flags", "missing_signals"],
  },
  {
    candidateId: "appetite_weight_loss_drinking",
    displayName: "Appetite / Weight-Loss / Drinking-More",
    existingRedFlags: [],
    existingSignals: [],
    proposedRedFlags: [
      "proposed_anorexia_prolonged",
      "proposed_rapid_weight_loss",
      "proposed_polyuria_polydipsia",
    ],
    proposedSignals: [
      "proposed_possible_systemic_illness",
    ],
    missingQuestionCards: [
      "appetite_change_check",
      "weight_loss_check",
      "polydipsia_check",
      "duration_symptoms_check",
    ],
    canRaiseUrgency: true,
    canBecomeExplicitAnswer: false,
    requiredConfirmationQuestionId: "emergency_global_screen",
    unsafeOverlapRisks: [
      "gi_vomiting_diarrhea already catches 'not eating' and 'off food' via triggers; isolated appetite module without dedicated cards would produce hollow discriminative power.",
    ],
    ready: false,
    blockedReasons: ["missing_question_cards", "missing_red_flags", "missing_signals"],
  },
  {
    candidateId: "post_vaccination_reaction",
    displayName: "Post-Vaccination Reaction",
    existingRedFlags: [
      "face_swelling",
      "hives_widespread",
      "allergic_with_breathing",
      "collapse",
      "breathing_difficulty",
    ],
    existingSignals: [],
    proposedRedFlags: [
      "proposed_post_vaccine_anaphylaxis",
      "proposed_injection_site_abscess",
    ],
    proposedSignals: [
      "proposed_possible_post_vaccine_reaction",
    ],
    missingQuestionCards: [
      "vaccine_recent_check",
      "injection_site_swelling_check",
      "fever_lethargy_post_vax_check",
    ],
    canRaiseUrgency: true,
    canBecomeExplicitAnswer: false,
    requiredConfirmationQuestionId: "skin_emergency_allergy_screen",
    unsafeOverlapRisks: [
      "Post-vax reaction is clinically distinct from generic allergy due to temporal onset link; without vaccine_recent_check, module loses urgency context and may duplicate skin_itching_allergy routing.",
    ],
    ready: false,
    blockedReasons: ["missing_question_cards", "missing_red_flags"],
  },
  {
    candidateId: "abdominal_pain_standalone",
    displayName: "Abdominal Pain (standalone, not GI/bloat)",
    existingRedFlags: [
      "distended_abdomen_painful",
      "unproductive_retching",
      "rapid_onset_distension",
    ],
    existingSignals: [
      "possible_abdominal_pain",
    ],
    proposedRedFlags: [
      "proposed_severe_abdominal_pain",
      "proposed_rigid_abdomen",
    ],
    proposedSignals: [],
    missingQuestionCards: [
      "abdominal_pain_check",
      "posture_guarding_check",
      "belly_touch_response_check",
    ],
    canRaiseUrgency: true,
    canBecomeExplicitAnswer: false,
    requiredConfirmationQuestionId: "bloat_retching_abdomen_check",
    unsafeOverlapRisks: [
      "possible_abdominal_pain signal already routes to emergency via gi_vomiting_diarrhea stop conditions; standalone module risks duplicate emergency routing with GI and bloat_gdv.",
    ],
    ready: false,
    blockedReasons: ["missing_question_cards", "missing_red_flags"],
  },
  {
    candidateId: "wound_skin_overlap",
    displayName: "Wound / Skin Overlap (trauma-adjacent)",
    existingRedFlags: [
      "large_blood_volume",
      "wound_deep_bleeding",
    ],
    existingSignals: [
      "possible_trauma",
    ],
    proposedRedFlags: [],
    proposedSignals: [],
    missingQuestionCards: [
      "wound_characterization_check",
      "bleeding_volume_check",
      "laceration_depth_check",
    ],
    canRaiseUrgency: true,
    canBecomeExplicitAnswer: false,
    requiredConfirmationQuestionId: "emergency_global_screen",
    unsafeOverlapRisks: [
      "skin_itching_allergy handles chronic dermatologic issues; future trauma_bleeding_wound module would overlap when text contains both 'skin' and 'wound'.",
      "No dedicated question card exists for wound age/depth/contamination to disambiguate.",
    ],
    ready: false,
    blockedReasons: ["missing_question_cards"],
  },
  {
    candidateId: "heatstroke_heat_exposure",
    displayName: "Heatstroke / Heat Exposure",
    existingRedFlags: [
      "heatstroke_signs",
      "brachycephalic_heat",
      "collapse",
      "breathing_difficulty",
      "pale_gums",
      "blue_gums",
    ],
    existingSignals: [
      "possible_heat_stroke",
      "possible_collapse_or_weakness",
      "possible_breathing_difficulty",
    ],
    proposedRedFlags: [],
    proposedSignals: [],
    missingQuestionCards: [
      "heat_exposure_check",
      "brachycephalic_breed_check",
      "panting_excess_check",
    ],
    canRaiseUrgency: true,
    canBecomeExplicitAnswer: false,
    requiredConfirmationQuestionId: "emergency_global_screen",
    unsafeOverlapRisks: [
      "Could partially route through respiratory_distress via breathing_difficulty; without heat-specific question card, module would have no characterize/timeline questions beyond generics.",
    ],
    ready: false,
    blockedReasons: ["missing_question_cards"],
  },
  {
    candidateId: "trauma_bleeding_wound",
    displayName: "Trauma / Bleeding / Wound",
    existingRedFlags: [
      "large_blood_volume",
      "wound_deep_bleeding",
      "collapse",
      "unresponsive",
      "pale_gums",
      "blue_gums",
      "breathing_difficulty",
    ],
    existingSignals: [
      "possible_trauma",
      "possible_collapse_or_weakness",
      "possible_pale_gums",
      "possible_blue_gums",
      "possible_breathing_difficulty",
    ],
    proposedRedFlags: [],
    proposedSignals: [],
    missingQuestionCards: [
      "wound_characterization_check",
      "bleeding_volume_check",
      "trauma_mechanism_check",
    ],
    canRaiseUrgency: true,
    canBecomeExplicitAnswer: false,
    requiredConfirmationQuestionId: "emergency_global_screen",
    unsafeOverlapRisks: [
      "Could partially route through limping_mobility_pain via trauma triggers; without trauma-specific question cards, module would have poor characterization and handoff detail.",
    ],
    ready: false,
    blockedReasons: ["missing_question_cards"],
  },
];

// ---------------------------------------------------------------------------
// Derived signal ID list from clinical-signal-detector.ts SIGNAL_PATTERNS
// ---------------------------------------------------------------------------

const KNOWN_SIGNAL_IDS = [
  "possible_abdominal_pain",
  "possible_nonproductive_retching",
  "possible_pale_gums",
  "possible_blue_gums",
  "possible_breathing_difficulty",
  "possible_collapse_or_weakness",
  "possible_urinary_obstruction",
  "toxin_exposure",
  "possible_heat_stroke",
  "possible_neuro_emergency",
  "possible_trauma",
  "possible_bloat_gdv",
  "possible_bloody_vomit",
  "possible_bloody_diarrhea",
];

// ---------------------------------------------------------------------------
// Forbidden language patterns (must not appear in any contract text)
// ---------------------------------------------------------------------------

const FORBIDDEN_PATTERNS = [
  /diagnos/i,
  /treat(ment|ments|ing|ed)?\b/i,
  /prescri/i,
  /surg/i,
  /prognosis/i,
  /\bdisease\b/i,
  /\bcure\b/i,
  /\bheal/i,
  /antibiotic/i,
  /steroid/i,
  /vaccine\b/i,
  /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i,
  /administer\s+\w+\s*(mg|ml|tablet|pill|dose)/i,
  /dosage\s*(is|of|:)/i,
  /medicat/i,
  /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i,
];

function containsForbiddenLanguage(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Red-Flag and Clinical-Signal Gap Contract (VET-1430Q)", () => {
  describe("contract structure", () => {
    it("has exactly 8 blocked candidates", () => {
      expect(BLOCKED_CANDIDATES).toHaveLength(8);
    });

    it("all candidates have unique IDs", () => {
      const ids = BLOCKED_CANDIDATES.map((c) => c.candidateId);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it("no candidate is marked ready", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        expect(candidate.ready).toBe(false);
      }
    });

    it("every candidate has at least one blocked reason", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        expect(candidate.blockedReasons.length).toBeGreaterThan(0);
      }
    });
  });

  describe("existing red flag validation", () => {
    it("every referenced existing red flag exists in EMERGENCY_RED_FLAG_IDS", () => {
      const allExistingFlags = BLOCKED_CANDIDATES.flatMap((c) => c.existingRedFlags);
      for (const flagId of allExistingFlags) {
        expect(isEmergencyRedFlagId(flagId)).toBe(true);
      }
    });

    it("no existing red flag references a proposed ID", () => {
      const allExistingFlags = BLOCKED_CANDIDATES.flatMap((c) => c.existingRedFlags);
      for (const flagId of allExistingFlags) {
        expect(flagId.startsWith("proposed_")).toBe(false);
      }
    });
  });

  describe("existing signal validation", () => {
    it("every referenced existing signal exists in clinical-signal-detector", () => {
      const allExistingSignals = BLOCKED_CANDIDATES.flatMap((c) => c.existingSignals);
      for (const signalId of allExistingSignals) {
        expect(KNOWN_SIGNAL_IDS).toContain(signalId);
      }
    });

    it("signals can actually be detected by the detector", () => {
      const signalTestPhrases: Record<string, string> = {
        possible_abdominal_pain: "My dog yelps when I touch his belly",
        possible_nonproductive_retching: "Dry heaves",
        possible_pale_gums: "His gums look pale and white",
        possible_blue_gums: "Her gums look blue",
        possible_breathing_difficulty: "She is struggling to breathe",
        possible_collapse_or_weakness: "He collapsed and cannot get up",
        possible_urinary_obstruction: "She keeps trying to pee but cannot",
        toxin_exposure: "My dog ate chocolate",
        possible_heat_stroke: "He is panting heavily after being outside in the heat",
        possible_neuro_emergency: "She had a seizure and is not acting normal",
        possible_trauma: "My dog was hit by a car",
        possible_bloat_gdv: "His belly looks swollen and hard",
        possible_bloody_vomit: "He vomited blood",
        possible_bloody_diarrhea: "Blood in diarrhea",
      };

      for (const signalId of KNOWN_SIGNAL_IDS) {
        const testPhrase = signalTestPhrases[signalId];
        if (testPhrase) {
          const signals = detectSignals(testPhrase);
          const found = signals.some((s) => s.id === signalId);
          expect(found).toBe(true);
        }
      }
    });

    it("no existing signal references a proposed ID", () => {
      const allExistingSignals = BLOCKED_CANDIDATES.flatMap((c) => c.existingSignals);
      for (const signalId of allExistingSignals) {
        expect(signalId.startsWith("proposed_")).toBe(false);
      }
    });
  });

  describe("proposed ID validation", () => {
    it("all proposed red flags are clearly marked with 'proposed_' prefix", () => {
      const allProposedFlags = BLOCKED_CANDIDATES.flatMap((c) => c.proposedRedFlags);
      for (const flagId of allProposedFlags) {
        expect(flagId.startsWith("proposed_")).toBe(true);
      }
    });

    it("all proposed signals are clearly marked with 'proposed_' prefix", () => {
      const allProposedSignals = BLOCKED_CANDIDATES.flatMap((c) => c.proposedSignals);
      for (const signalId of allProposedSignals) {
        expect(signalId.startsWith("proposed_")).toBe(true);
      }
    });

    it("no proposed red flag collides with an existing red flag", () => {
      const allProposedFlags = BLOCKED_CANDIDATES.flatMap((c) => c.proposedRedFlags);
      const existingSet = new Set(EMERGENCY_RED_FLAG_IDS);
      for (const flagId of allProposedFlags) {
        const stripped = flagId.replace(/^proposed_/, "");
        expect(existingSet.has(stripped)).toBe(false);
      }
    });

    it("no proposed signal collides with an existing signal", () => {
      const allProposedSignals = BLOCKED_CANDIDATES.flatMap((c) => c.proposedSignals);
      const existingSet = new Set(KNOWN_SIGNAL_IDS);
      for (const signalId of allProposedSignals) {
        const stripped = signalId.replace(/^proposed_/, "");
        expect(existingSet.has(stripped)).toBe(false);
      }
    });
  });

  describe("forbidden language validation", () => {
    it("no candidate display name contains forbidden language", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        expect(containsForbiddenLanguage(candidate.displayName)).toBe(false);
      }
    });

    it("no candidate ID contains forbidden language", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        expect(containsForbiddenLanguage(candidate.candidateId)).toBe(false);
      }
    });

    it("no unsafe overlap risk text contains forbidden language", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        for (const risk of candidate.unsafeOverlapRisks) {
          expect(containsForbiddenLanguage(risk)).toBe(false);
        }
      }
    });

    it("no blocked reason contains forbidden language", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        for (const reason of candidate.blockedReasons) {
          expect(containsForbiddenLanguage(reason)).toBe(false);
        }
      }
    });
  });

  describe("readiness gate", () => {
    it("candidate is NOT ready if any required red flag is missing (only proposed)", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        if (candidate.proposedRedFlags.length > 0) {
          expect(candidate.ready).toBe(false);
        }
      }
    });

    it("candidate is NOT ready if any required signal is missing (only proposed)", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        if (candidate.proposedSignals.length > 0) {
          expect(candidate.ready).toBe(false);
        }
      }
    });

    it("candidate is NOT ready if any question card is missing", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        if (candidate.missingQuestionCards.length > 0) {
          expect(candidate.ready).toBe(false);
        }
      }
    });

    it("candidate with no missing items would be ready", () => {
      const hypotheticalReady: BlockedCandidateContract = {
        candidateId: "hypothetical_ready",
        displayName: "Hypothetical Ready Module",
        existingRedFlags: ["collapse"],
        existingSignals: ["possible_collapse_or_weakness"],
        proposedRedFlags: [],
        proposedSignals: [],
        missingQuestionCards: [],
        canRaiseUrgency: true,
        canBecomeExplicitAnswer: true,
        requiredConfirmationQuestionId: "emergency_global_screen",
        unsafeOverlapRisks: [],
        ready: true,
        blockedReasons: [],
      };
      expect(hypotheticalReady.ready).toBe(true);
      expect(hypotheticalReady.blockedReasons).toHaveLength(0);
    });
  });

  describe("urgency and answerability", () => {
    it("all blocked candidates can raise urgency", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        expect(candidate.canRaiseUrgency).toBe(true);
      }
    });

    it("no blocked candidate can become an explicit answer before schema expansion", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        expect(candidate.canBecomeExplicitAnswer).toBe(false);
      }
    });

    it("every blocked candidate has a required confirmation question dependency", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        expect(candidate.requiredConfirmationQuestionId).not.toBeNull();
      }
    });
  });

  describe("unsafe overlap documentation", () => {
    it("every candidate documents at least one unsafe overlap risk", () => {
      for (const candidate of BLOCKED_CANDIDATES) {
        expect(candidate.unsafeOverlapRisks.length).toBeGreaterThan(0);
      }
    });
  });

  describe("per-candidate contract completeness", () => {
    it("eye_vision_discharge: has no existing red flags or signals", () => {
      const c = BLOCKED_CANDIDATES.find((c) => c.candidateId === "eye_vision_discharge");
      expect(c).toBeDefined();
      expect(c!.existingRedFlags).toHaveLength(0);
      expect(c!.existingSignals).toHaveLength(0);
      expect(c!.proposedRedFlags.length).toBeGreaterThan(0);
      expect(c!.proposedSignals.length).toBeGreaterThan(0);
      expect(c!.missingQuestionCards.length).toBeGreaterThan(0);
    });

    it("ear_head_tilt_balance: has existing neuro signal but no ear-specific red flags", () => {
      const c = BLOCKED_CANDIDATES.find((c) => c.candidateId === "ear_head_tilt_balance");
      expect(c).toBeDefined();
      expect(c!.existingRedFlags).toHaveLength(0);
      expect(c!.existingSignals).toContain("possible_neuro_emergency");
      expect(c!.proposedRedFlags.length).toBeGreaterThan(0);
    });

    it("appetite_weight_loss_drinking: has no existing red flags or signals", () => {
      const c = BLOCKED_CANDIDATES.find((c) => c.candidateId === "appetite_weight_loss_drinking");
      expect(c).toBeDefined();
      expect(c!.existingRedFlags).toHaveLength(0);
      expect(c!.existingSignals).toHaveLength(0);
    });

    it("post_vaccination_reaction: has existing allergy red flags but no vaccine-specific signals", () => {
      const c = BLOCKED_CANDIDATES.find((c) => c.candidateId === "post_vaccination_reaction");
      expect(c).toBeDefined();
      expect(c!.existingRedFlags).toContain("face_swelling");
      expect(c!.existingRedFlags).toContain("hives_widespread");
      expect(c!.existingSignals).toHaveLength(0);
    });

    it("abdominal_pain_standalone: has existing abdominal pain signal and bloat-related red flags", () => {
      const c = BLOCKED_CANDIDATES.find((c) => c.candidateId === "abdominal_pain_standalone");
      expect(c).toBeDefined();
      expect(c!.existingSignals).toContain("possible_abdominal_pain");
      expect(c!.existingRedFlags).toContain("distended_abdomen_painful");
    });

    it("wound_skin_overlap: has existing trauma red flags and signal", () => {
      const c = BLOCKED_CANDIDATES.find((c) => c.candidateId === "wound_skin_overlap");
      expect(c).toBeDefined();
      expect(c!.existingRedFlags).toContain("large_blood_volume");
      expect(c!.existingRedFlags).toContain("wound_deep_bleeding");
      expect(c!.existingSignals).toContain("possible_trauma");
    });

    it("heatstroke_heat_exposure: has strong existing red flag and signal support", () => {
      const c = BLOCKED_CANDIDATES.find((c) => c.candidateId === "heatstroke_heat_exposure");
      expect(c).toBeDefined();
      expect(c!.existingRedFlags).toContain("heatstroke_signs");
      expect(c!.existingRedFlags).toContain("brachycephalic_heat");
      expect(c!.existingSignals).toContain("possible_heat_stroke");
      expect(c!.proposedRedFlags).toHaveLength(0);
      expect(c!.proposedSignals).toHaveLength(0);
    });

    it("trauma_bleeding_wound: has strong existing red flag and signal support", () => {
      const c = BLOCKED_CANDIDATES.find((c) => c.candidateId === "trauma_bleeding_wound");
      expect(c).toBeDefined();
      expect(c!.existingRedFlags).toContain("large_blood_volume");
      expect(c!.existingRedFlags).toContain("wound_deep_bleeding");
      expect(c!.existingSignals).toContain("possible_trauma");
      expect(c!.proposedRedFlags).toHaveLength(0);
      expect(c!.proposedSignals).toHaveLength(0);
    });
  });

  describe("cross-registry consistency", () => {
    it("all existing red flags referenced by candidates are in the canonical registry", () => {
      const allExistingFlags = BLOCKED_CANDIDATES.flatMap((c) => c.existingRedFlags);
      const flagSet = new Set(EMERGENCY_RED_FLAG_IDS);
      for (const flagId of allExistingFlags) {
        expect(flagSet.has(flagId)).toBe(true);
      }
    });

    it("all existing signals referenced by candidates are in the signal detector", () => {
      const allExistingSignals = BLOCKED_CANDIDATES.flatMap((c) => c.existingSignals);
      const signalSet = new Set(KNOWN_SIGNAL_IDS);
      for (const signalId of allExistingSignals) {
        expect(signalSet.has(signalId)).toBe(true);
      }
    });

    it("no candidate references a red flag that does not exist and is not proposed", () => {
      const allExistingFlags = BLOCKED_CANDIDATES.flatMap((c) => c.existingRedFlags);
      const flagSet = new Set(EMERGENCY_RED_FLAG_IDS);
      for (const flagId of allExistingFlags) {
        expect(flagSet.has(flagId)).toBe(true);
      }
    });

    it("no candidate references a signal that does not exist and is not proposed", () => {
      const allExistingSignals = BLOCKED_CANDIDATES.flatMap((c) => c.existingSignals);
      const signalSet = new Set(KNOWN_SIGNAL_IDS);
      for (const signalId of allExistingSignals) {
        expect(signalSet.has(signalId)).toBe(true);
      }
    });
  });
});
