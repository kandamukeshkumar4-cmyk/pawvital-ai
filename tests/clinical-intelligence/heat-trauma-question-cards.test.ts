/**
 * Heatstroke and Trauma Question Cards — Implementation Validation (VET-1432K)
 */

import {
  getAllQuestionCards,
  getQuestionCardById,
  validateRegistry,
} from "@/lib/clinical-intelligence/question-card-registry";
import { EMERGENCY_RED_FLAG_IDS } from "@/lib/clinical-intelligence/emergency-red-flags";

describe("VET-1432K Heatstroke and Trauma Question Cards", () => {
  const EXPECTED_NEW_CARD_IDS = [
    "heat_exposure_check",
    "brachycephalic_breed_check",
    "panting_excess_check",
    "trauma_mechanism_check",
    "wound_characterization_check",
    "bleeding_volume_check",
    "laceration_depth_check",
  ];

  describe("registry registration", () => {
    it("all 7 new cards are present in the registry", () => {
      const allIds = getAllQuestionCards().map((c) => c.id);
      for (const id of EXPECTED_NEW_CARD_IDS) {
        expect(allIds).toContain(id);
      }
    });

    it("registry size increased from 19 to 26", () => {
      const cards = getAllQuestionCards();
      expect(cards.length).toBe(26);
    });

    it("new cards are retrievable by id", () => {
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id);
        expect(card).toBeDefined();
        expect(card!.id).toBe(id);
      }
    });

    it("registry validation still passes after additions", () => {
      const result = validateRegistry();
      expect(result.valid).toBe(true);
      expect(result.duplicateIds).toEqual([]);
      expect(result.missingOwnerText).toEqual([]);
      expect(result.missingShortReason).toEqual([]);
      expect(result.missingSkipIfAnswered).toEqual([]);
      expect(result.missingSourceIds).toEqual([]);
      expect(result.choiceCardsMissingAllowedAnswers).toEqual([]);
      expect(result.lowOwnerAnswerabilityWithoutSafetyNote).toEqual([]);
      expect(result.emergencyCardsWithLowUrgency).toEqual([]);
      expect(result.diagnosisTreatmentClaims).toEqual([]);
    });
  });

  describe("schema compliance per card", () => {
    it("every new card has ownerText", () => {
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        expect(card.ownerText).toBeTruthy();
      }
    });

    it("every new card has shortReason", () => {
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        expect(card.shortReason).toBeTruthy();
      }
    });

    it("every new card has skipIfAnswered as an array", () => {
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        expect(Array.isArray(card.skipIfAnswered)).toBe(true);
      }
    });

    it("every new card has sourceIds with at least one entry", () => {
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        expect(Array.isArray(card.sourceIds)).toBe(true);
        expect(card.sourceIds.length).toBeGreaterThan(0);
      }
    });

    it("every choice card has allowedAnswers", () => {
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        if (card.answerType === "choice") {
          expect(Array.isArray(card.allowedAnswers)).toBe(true);
          expect(card.allowedAnswers.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("emergency-screen cards", () => {
    const emergencyIds = [
      "panting_excess_check",
      "bleeding_volume_check",
    ];

    it("emergency-screen cards have urgencyImpact === 3", () => {
      for (const id of emergencyIds) {
        const card = getQuestionCardById(id)!;
        expect(card.phase).toBe("emergency_screen");
        expect(card.urgencyImpact).toBe(3);
      }
    });
  });

  describe("owner answerability", () => {
    it("cards with ownerAnswerability < 2 have safetyNotes", () => {
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        if (card.ownerAnswerability < 2) {
          const hasNote =
            Array.isArray(card.safetyNotes) && card.safetyNotes.length > 0;
          expect(hasNote).toBe(true);
        }
      }
    });

    it("no new card has ownerAnswerability below 1", () => {
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        expect(card.ownerAnswerability).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("screensRedFlags reference only existing canonical flags", () => {
    const canonicalSet = new Set<string>(EMERGENCY_RED_FLAG_IDS);

    it("no new card references an unknown red flag", () => {
      const offenders: string[] = [];
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        for (const rf of card.screensRedFlags) {
          if (!canonicalSet.has(rf)) {
            offenders.push(`${id} -> ${rf}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("heatstroke cards reference heat-related red flags", () => {
      const panting = getQuestionCardById("panting_excess_check")!;
      expect(panting.screensRedFlags).toContain("heatstroke_signs");

      const brachy = getQuestionCardById("brachycephalic_breed_check")!;
      expect(brachy.screensRedFlags).toContain("brachycephalic_heat");
    });

    it("trauma cards reference bleeding red flags", () => {
      const bleeding = getQuestionCardById("bleeding_volume_check")!;
      expect(bleeding.screensRedFlags).toContain("large_blood_volume");
      expect(bleeding.screensRedFlags).toContain("wound_deep_bleeding");
    });
  });

  describe("no diagnosis or treatment language", () => {
    const forbidden = [
      "diagnos",
      "treat",
      "prescri",
      "surgery",
      "prognosis",
      "disease",
      "condition",
      "cure",
      "heal",
      "antibiotic",
      "steroid",
      "vaccine",
      "medication",
      "dosage",
      "dose",
    ];

    it("no new card contains forbidden language in ownerText or shortReason", () => {
      const offenders: string[] = [];
      for (const id of EXPECTED_NEW_CARD_IDS) {
        const card = getQuestionCardById(id)!;
        const combined = `${card.ownerText} ${card.shortReason}`.toLowerCase();
        for (const word of forbidden) {
          if (combined.includes(word)) {
            offenders.push(`${id}: contains "${word}"`);
            break;
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("phase distribution", () => {
    it("heatstroke cards cover history and emergency_screen phases", () => {
      const heat = getQuestionCardById("heat_exposure_check")!;
      expect(heat.phase).toBe("history");

      const brachy = getQuestionCardById("brachycephalic_breed_check")!;
      expect(brachy.phase).toBe("history");

      const panting = getQuestionCardById("panting_excess_check")!;
      expect(panting.phase).toBe("emergency_screen");
    });

    it("trauma cards cover history, characterize, discriminate, and emergency_screen phases", () => {
      const trauma = getQuestionCardById("trauma_mechanism_check")!;
      expect(trauma.phase).toBe("history");

      const wound = getQuestionCardById("wound_characterization_check")!;
      expect(wound.phase).toBe("characterize");

      const bleeding = getQuestionCardById("bleeding_volume_check")!;
      expect(bleeding.phase).toBe("emergency_screen");

      const depth = getQuestionCardById("laceration_depth_check")!;
      expect(depth.phase).toBe("discriminate");
    });
  });

  describe("complaint family coverage", () => {
    it("heatstroke cards belong to heat and respiratory families", () => {
      for (const id of ["heat_exposure_check", "brachycephalic_breed_check", "panting_excess_check"]) {
        const card = getQuestionCardById(id)!;
        expect(card.complaintFamilies).toContain("heat");
      }
    });

    it("trauma cards belong to trauma and wound families", () => {
      for (const id of ["trauma_mechanism_check", "wound_characterization_check", "bleeding_volume_check", "laceration_depth_check"]) {
        const card = getQuestionCardById(id)!;
        expect(card.complaintFamilies).toContain("trauma");
      }
    });
  });

  describe("defensive cloning", () => {
    it("mutating a retrieved card does not affect the registry", () => {
      const card = getQuestionCardById("heat_exposure_check")!;
      card.ownerText = "mutated";
      card.complaintFamilies.push("mutated_family");

      const fresh = getQuestionCardById("heat_exposure_check")!;
      expect(fresh.ownerText).not.toBe("mutated");
      expect(fresh.complaintFamilies).not.toContain("mutated_family");
    });
  });

  describe("cross-registry consistency", () => {
    it("new card IDs do not collide with any existing card IDs", () => {
      const allCards = getAllQuestionCards();
      const idCounts: Record<string, number> = {};
      for (const card of allCards) {
        idCounts[card.id] = (idCounts[card.id] || 0) + 1;
      }
      for (const id of EXPECTED_NEW_CARD_IDS) {
        expect(idCounts[id]).toBe(1);
      }
    });
  });
});
