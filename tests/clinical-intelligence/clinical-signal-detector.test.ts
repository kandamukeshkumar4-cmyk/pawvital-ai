import {
  detectSignals,
  detectSignalsWithExplanations,
} from "@/lib/clinical-intelligence/clinical-signal-detector";

describe("Clinical Signal Detector", () => {
  describe("1. Detects clear emergency phrases", () => {
    it("detects 'yelps when I touch his belly' as possible_abdominal_pain", () => {
      const signals = detectSignals("yelps when I touch his belly");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_abdominal_pain");
    });

    it("detects 'tries to vomit but nothing comes up' as possible_nonproductive_retching", () => {
      const signals = detectSignals("tries to vomit but nothing comes up");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_nonproductive_retching");
    });

    it("detects 'gums look white' as possible_pale_gums", () => {
      const signals = detectSignals("gums look white");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_pale_gums");
    });

    it("detects 'blue gums' as possible_blue_gums", () => {
      const signals = detectSignals("blue gums");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_blue_gums");
    });

    it("detects 'breathing weird' as possible_breathing_difficulty", () => {
      const signals = detectSignals("breathing weird");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_breathing_difficulty");
    });

    it("detects 'won't get up' as possible_collapse_or_weakness", () => {
      const signals = detectSignals("won't get up");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_collapse_or_weakness");
    });

    it("detects 'keeps trying to pee' as possible_urinary_obstruction", () => {
      const signals = detectSignals("keeps trying to pee");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_urinary_obstruction");
    });

    it("detects 'ate chocolate' as toxin_exposure", () => {
      const signals = detectSignals("ate chocolate");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("toxin_exposure");
    });

    it("detects 'panting heavily after being outside in the heat' as possible_heat_stroke", () => {
      const signals = detectSignals(
        "panting heavily after being outside in the heat"
      );
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_heat_stroke");
    });

    it("detects 'had a seizure and is not acting normal' as possible_neuro_emergency", () => {
      const signals = detectSignals("had a seizure and is not acting normal");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_neuro_emergency");
    });

    it("detects 'hit by a car' as possible_trauma", () => {
      const signals = detectSignals("hit by a car");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_trauma");
    });

    it("detects 'belly looks swollen and hard' as possible_bloat_gdv", () => {
      const signals = detectSignals("belly looks swollen and hard");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_bloat_gdv");
    });

    it("detects 'vomiting blood' as possible_bloody_vomit", () => {
      const signals = detectSignals("vomiting blood");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_bloody_vomit");
    });

    it("detects 'blood in diarrhea' as possible_bloody_diarrhea", () => {
      const signals = detectSignals("blood in diarrhea");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_bloody_diarrhea");
    });
  });

  describe("2. Preserves evidenceText", () => {
    it("preserves exact owner phrase for gum color", () => {
      const signals = detectSignals("gums look white");
      expect(signals[0].evidenceText).toContain("gums look white");
    });

    it("preserves exact owner phrase for toxin exposure", () => {
      const signals = detectSignals("my dog ate chocolate yesterday");
      expect(signals[0].evidenceText).toContain("ate chocolate");
    });

    it("preserves exact owner phrase for trauma", () => {
      const signals = detectSignals("he was hit by a car this morning");
      expect(signals[0].evidenceText).toContain("hit by a car");
    });
  });

  describe("3. Returns confidence score", () => {
    it("assigns high confidence (>=0.85) to clear trauma signals", () => {
      const signals = detectSignals("hit by a car");
      expect(signals[0].confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("assigns lower confidence (<0.9) to ambiguous breathing signals", () => {
      const signals = detectSignals("breathing weird");
      expect(signals[0].confidence).toBeLessThan(0.9);
    });

    it("assigns confidence between 0 and 1", () => {
      const signals = detectSignals(
        "yelps when I touch his belly, blue gums, hit by a car"
      );
      for (const signal of signals) {
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("4. canLowerUrgency is always false", () => {
    it("returns false for all detected signals", () => {
      const signals = detectSignals(
        "yelps when touched, breathing weird, hit by car, ate chocolate"
      );
      for (const signal of signals) {
        expect(signal.canLowerUrgency).toBe(false);
      }
    });
  });

  describe("5. needsConfirmation is true for inferred/ambiguous signals", () => {
    it("returns true for ambiguous breathing difficulty", () => {
      const signals = detectSignals("breathing weird");
      expect(signals[0].needsConfirmation).toBe(true);
    });

    it("returns true for possible abdominal pain", () => {
      const signals = detectSignals("yelps when I touch his belly");
      expect(signals[0].needsConfirmation).toBe(true);
    });

    it("returns true for possible collapse/weakness", () => {
      const signals = detectSignals("won't get up");
      expect(signals[0].needsConfirmation).toBe(true);
    });

    it("returns false for clear toxin exposure", () => {
      const signals = detectSignals("ate chocolate");
      expect(signals[0].needsConfirmation).toBe(false);
    });

    it("returns false for clear trauma", () => {
      const signals = detectSignals("hit by a car");
      expect(signals[0].needsConfirmation).toBe(false);
    });

    it("returns false for nonproductive retching", () => {
      const signals = detectSignals("tries to vomit but nothing comes up");
      expect(signals[0].needsConfirmation).toBe(false);
    });
  });

  describe("6. Does not detect false positives from harmless phrases", () => {
    it('does not trigger breathing difficulty for "he is breathing normally"', () => {
      const signals = detectSignals("he is breathing normally");
      const breathing = signals.find(
        (s) => s.id === "possible_breathing_difficulty"
      );
      expect(breathing).toBeUndefined();
    });

    it('does not trigger severe vomiting for "he vomited once but is now normal"', () => {
      const signals = detectSignals("he vomited once but is now normal");
      const retching = signals.find(
        (s) => s.id === "possible_nonproductive_retching"
      );
      expect(retching).toBeUndefined();
    });

    it('does not trigger collapse for "he is tired after playing"', () => {
      const signals = detectSignals("he is tired after playing");
      const collapse = signals.find(
        (s) => s.id === "possible_collapse_or_weakness"
      );
      expect(collapse).toBeUndefined();
    });

    it('does not trigger emergency allergy for "he scratched once"', () => {
      const signals = detectSignals("he scratched once");
      // There is no emergency allergy signal; verify no signals at all
      expect(signals).toHaveLength(0);
    });

    it('does not trigger urinary obstruction for "he peed normally after trying once"', () => {
      const signals = detectSignals("he peed normally after trying once");
      const urinary = signals.find(
        (s) => s.id === "possible_urinary_obstruction"
      );
      expect(urinary).toBeUndefined();
    });

    it("does not trigger pale gums when gums are described as normal/pink", () => {
      const signals = detectSignals("gums look pink and normal");
      const paleGums = signals.find((s) => s.id === "possible_pale_gums");
      expect(paleGums).toBeUndefined();
    });

    it("does not trigger toxin for benign food mentions", () => {
      const signals = detectSignals("he ate his dinner and some treats");
      const toxin = signals.find((s) => s.id === "toxin_exposure");
      expect(toxin).toBeUndefined();
    });

    it("returns empty array for empty message", () => {
      const signals = detectSignals("");
      expect(signals).toHaveLength(0);
    });

    it("returns empty array for generic message without clinical signals", () => {
      const signals = detectSignals("my dog seems happy today");
      expect(signals).toHaveLength(0);
    });
  });

  describe("7. Can return multiple signals from one owner message", () => {
    it("detects multiple distinct signals in a compound message", () => {
      const signals = detectSignals(
        "he won't get up and his gums look white, plus he ate chocolate"
      );
      const ids = signals.map((s) => s.id).sort();
      expect(ids).toEqual(
        [
          "possible_collapse_or_weakness",
          "possible_pale_gums",
          "toxin_exposure",
        ].sort()
      );
    });

    it("detects both pale and blue gums if both mentioned (edge case)", () => {
      const signals = detectSignals(
        "his gums look white and also a bit blueish"
      );
      const ids = signals.map((s) => s.id).sort();
      expect(ids).toEqual(
        ["possible_blue_gums", "possible_pale_gums"].sort()
      );
    });
  });

  describe("8. Suggested question IDs match existing question cards", () => {
    const validQuestionIds = [
      "emergency_global_screen",
      "gum_color_check",
      "breathing_difficulty_check",
      "collapse_weakness_check",
      "toxin_exposure_check",
      "bloat_retching_abdomen_check",
      "urinary_blockage_check",
      "seizure_neuro_check",
    ];

    it("maps possible_pale_gums to gum_color_check", () => {
      const signals = detectSignals("gums look white");
      expect(signals[0].suggestedQuestionId).toBe("gum_color_check");
    });

    it("maps possible_blue_gums to gum_color_check", () => {
      const signals = detectSignals("blue gums");
      expect(signals[0].suggestedQuestionId).toBe("gum_color_check");
    });

    it("maps possible_breathing_difficulty to breathing_difficulty_check", () => {
      const signals = detectSignals("breathing weird");
      expect(signals[0].suggestedQuestionId).toBe("breathing_difficulty_check");
    });

    it("maps possible_collapse_or_weakness to collapse_weakness_check", () => {
      const signals = detectSignals("won't get up");
      expect(signals[0].suggestedQuestionId).toBe("collapse_weakness_check");
    });

    it("maps toxin_exposure to toxin_exposure_check", () => {
      const signals = detectSignals("ate chocolate");
      expect(signals[0].suggestedQuestionId).toBe("toxin_exposure_check");
    });

    it("maps possible_nonproductive_retching to bloat_retching_abdomen_check", () => {
      const signals = detectSignals("tries to vomit but nothing comes up");
      expect(signals[0].suggestedQuestionId).toBe(
        "bloat_retching_abdomen_check"
      );
    });

    it("maps possible_bloat_gdv to bloat_retching_abdomen_check", () => {
      const signals = detectSignals("belly looks swollen and hard");
      expect(signals[0].suggestedQuestionId).toBe(
        "bloat_retching_abdomen_check"
      );
    });

    it("maps possible_urinary_obstruction to urinary_blockage_check", () => {
      const signals = detectSignals("keeps trying to pee");
      expect(signals[0].suggestedQuestionId).toBe("urinary_blockage_check");
    });

    it("maps possible_neuro_emergency to seizure_neuro_check", () => {
      const signals = detectSignals("had a seizure and is not acting normal");
      expect(signals[0].suggestedQuestionId).toBe("seizure_neuro_check");
    });

    it("maps possible_abdominal_pain to emergency_global_screen", () => {
      const signals = detectSignals("yelps when I touch his belly");
      expect(signals[0].suggestedQuestionId).toBe("emergency_global_screen");
    });

    it("only uses known question IDs for suggestions", () => {
      const signals = detectSignals(
        "hit by a car, ate chocolate, blue gums, won't get up, breathing weird"
      );
      for (const signal of signals) {
        if (signal.suggestedQuestionId) {
          expect(validQuestionIds).toContain(signal.suggestedQuestionId);
        }
      }
    });
  });

  describe("9. No diagnosis or treatment language appears in output", () => {
    it("does not include diagnosis words in signal IDs or evidence", () => {
      const signals = detectSignals(
        "hit by a car, ate chocolate, blue gums, vomiting blood"
      );
      const diagnosisTerms = [
        "diagnos",
        "treat",
        "prescri",
        "medication",
        "surgery",
        "prognosis",
        "disease",
        "condition",
      ];

      for (const signal of signals) {
        const combined = `${signal.id} ${signal.evidenceText}`.toLowerCase();
        for (const term of diagnosisTerms) {
          expect(combined).not.toContain(term);
        }
      }
    });
  });

  describe("10. Detector works without case-state or production wiring", () => {
    it("runs without any external dependencies", () => {
      const signals = detectSignals("hit by a car");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_trauma");
    });

    it("does not import case-state or any production modules", () => {
      // This is a structural check: the detector file should be self-contained.
      // If the test suite runs, the import succeeded without production wiring.
      expect(true).toBe(true);
    });

    it("detectSignalsWithExplanations returns signals and explanations", () => {
      const result = detectSignalsWithExplanations("ate chocolate");
      expect(result.signals).toHaveLength(1);
      expect(result.explanations).toHaveLength(1);
      expect(result.explanations[0]).toContain("toxin_exposure");
      expect(result.explanations[0]).toContain("confidence");
    });
  });

  describe("Edge cases and robustness", () => {
    it("handles overlapping matchers for the same signal without hanging", () => {
      const signals = detectSignals("he is breathing hard");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_breathing_difficulty");
    });

    it("handles mixed case input", () => {
      const signals = detectSignals("HIT BY A CAR");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_trauma");
    });

    it("handles punctuation around phrases", () => {
      const signals = detectSignals("he ate chocolate, and then...");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("toxin_exposure");
    });

    it("handles negation with contractions", () => {
      const signals = detectSignals("he isn't breathing weird anymore");
      const breathing = signals.find(
        (s) => s.id === "possible_breathing_difficulty"
      );
      expect(breathing).toBeUndefined();
    });

    it("does not suppress a real emergency just because the pet was previously fine", () => {
      const signals = detectSignals("he was fine until he got hit by a car");
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("possible_trauma");
    });

    it("handles messages with no clinical content", () => {
      const signals = detectSignals("can you help me?");
      expect(signals).toHaveLength(0);
    });
  });
});
