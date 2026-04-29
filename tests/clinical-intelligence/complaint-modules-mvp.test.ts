import {
  getComplaintModules,
  getComplaintModuleById,
  findComplaintModulesForText,
  getEmergencyScreenQuestionIdsForModule,
  validateComplaintModules,
  skinItchingAllergyModule,
  giVomitingDiarrheaModule,
  limpingMobilityPainModule,
} from "@/lib/clinical-intelligence/complaint-modules";

import { getAllQuestionCards } from "@/lib/clinical-intelligence/question-card-registry";

describe("Complaint Modules MVP", () => {
  describe("1. All three modules exist", () => {
    it("should export skin_itching_allergy", () => {
      expect(skinItchingAllergyModule).toBeDefined();
      expect(skinItchingAllergyModule.id).toBe("skin_itching_allergy");
    });

    it("should export gi_vomiting_diarrhea", () => {
      expect(giVomitingDiarrheaModule).toBeDefined();
      expect(giVomitingDiarrheaModule.id).toBe("gi_vomiting_diarrhea");
    });

    it("should export limping_mobility_pain", () => {
      expect(limpingMobilityPainModule).toBeDefined();
      expect(limpingMobilityPainModule.id).toBe("limping_mobility_pain");
    });
  });

  describe("2. Module IDs are unique", () => {
    it("should return unique module IDs from getComplaintModules", () => {
      const modules = getComplaintModules();
      const ids = modules.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("3. Each module has emergency-screen question IDs", () => {
    it("skin module has emergency screen questions", () => {
      expect(skinItchingAllergyModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });

    it("gi module has emergency screen questions", () => {
      expect(giVomitingDiarrheaModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });

    it("limping module has emergency screen questions", () => {
      expect(limpingMobilityPainModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });
  });

  describe("4. Each module has stop conditions", () => {
    it("skin module has stop conditions", () => {
      expect(skinItchingAllergyModule.stopConditions.length).toBeGreaterThan(0);
    });

    it("gi module has stop conditions", () => {
      expect(giVomitingDiarrheaModule.stopConditions.length).toBeGreaterThan(0);
    });

    it("limping module has stop conditions", () => {
      expect(limpingMobilityPainModule.stopConditions.length).toBeGreaterThan(0);
    });
  });

  describe("5. Each module references only known question-card IDs", () => {
    it("should validate without errors against real question-card registry", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.errors).toHaveLength(0);
    });

    it("should report errors for unknown question IDs when registry is provided", async () => {
      const result = await validateComplaintModules(["known_id_1", "known_id_2"]);
      // Most real IDs won't be in this tiny list, so errors should be present
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("6. Skin module asks allergy/emergency screen before itch-location cards", () => {
    it("first phase is emergency_screen", () => {
      expect(skinItchingAllergyModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase includes skin_emergency_allergy_screen", () => {
      expect(skinItchingAllergyModule.phases[0].questionIds).toContain("skin_emergency_allergy_screen");
    });

    it("second phase is characterize with itch/location cards", () => {
      expect(skinItchingAllergyModule.phases[1].id).toBe("characterize");
      expect(skinItchingAllergyModule.phases[1].questionIds).toContain("skin_location_distribution");
    });
  });

  describe("7. GI module includes blood, water retention, bloat, toxin, and weakness/collapse coverage", () => {
    it("emergency phase includes gi_blood_check", () => {
      expect(giVomitingDiarrheaModule.emergencyScreenQuestionIds).toContain("gi_blood_check");
    });

    it("emergency phase includes gi_keep_water_down_check", () => {
      expect(giVomitingDiarrheaModule.emergencyScreenQuestionIds).toContain("gi_keep_water_down_check");
    });

    it("emergency phase includes bloat_retching_abdomen_check", () => {
      expect(giVomitingDiarrheaModule.emergencyScreenQuestionIds).toContain("bloat_retching_abdomen_check");
    });

    it("emergency phase includes toxin_exposure_check", () => {
      expect(giVomitingDiarrheaModule.emergencyScreenQuestionIds).toContain("toxin_exposure_check");
    });

    it("emergency phase includes collapse_weakness_check", () => {
      expect(giVomitingDiarrheaModule.emergencyScreenQuestionIds).toContain("collapse_weakness_check");
    });
  });

  describe("8. Limping module prioritizes weight-bearing and trauma onset", () => {
    it("first phase is emergency_screen", () => {
      expect(limpingMobilityPainModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase starts with limping_weight_bearing", () => {
      expect(limpingMobilityPainModule.phases[0].questionIds[0]).toBe("limping_weight_bearing");
    });

    it("emergency phase includes limping_trauma_onset", () => {
      expect(limpingMobilityPainModule.phases[0].questionIds).toContain("limping_trauma_onset");
    });
  });

  describe("9. Trigger matching finds skin/itching/allergy cases", () => {
    it("matches 'my dog is itching a lot'", () => {
      const matches = findComplaintModulesForText("my dog is itching a lot");
      expect(matches.map((m) => m.id)).toContain("skin_itching_allergy");
    });

    it("matches 'has a skin rash'", () => {
      const matches = findComplaintModulesForText("has a skin rash");
      expect(matches.map((m) => m.id)).toContain("skin_itching_allergy");
    });

    it("matches 'allergic reaction' via alias", () => {
      const matches = findComplaintModulesForText("looks like an allergic reaction");
      expect(matches.map((m) => m.id)).toContain("skin_itching_allergy");
    });
  });

  describe("10. Trigger matching finds vomiting/diarrhea cases", () => {
    it("matches 'vomiting since yesterday'", () => {
      const matches = findComplaintModulesForText("vomiting since yesterday");
      expect(matches.map((m) => m.id)).toContain("gi_vomiting_diarrhea");
    });

    it("matches 'diarrhea and not eating'", () => {
      const matches = findComplaintModulesForText("diarrhea and not eating");
      expect(matches.map((m) => m.id)).toContain("gi_vomiting_diarrhea");
    });

    it("matches 'gi upset' via alias", () => {
      const matches = findComplaintModulesForText("seems to have a gi upset");
      expect(matches.map((m) => m.id)).toContain("gi_vomiting_diarrhea");
    });
  });

  describe("11. Trigger matching finds limping/lameness/not-walking cases", () => {
    it("matches 'limping on back leg'", () => {
      const matches = findComplaintModulesForText("limping on back leg");
      expect(matches.map((m) => m.id)).toContain("limping_mobility_pain");
    });

    it("matches 'not walking properly'", () => {
      const matches = findComplaintModulesForText("not walking properly");
      expect(matches.map((m) => m.id)).toContain("limping_mobility_pain");
    });

    it("matches 'favoring left front paw'", () => {
      const matches = findComplaintModulesForText("favoring left front paw");
      expect(matches.map((m) => m.id)).toContain("limping_mobility_pain");
    });

    it("matches 'mobility issue' via alias", () => {
      const matches = findComplaintModulesForText("having a mobility issue");
      expect(matches.map((m) => m.id)).toContain("limping_mobility_pain");
    });
  });

  describe("12. No diagnosis or treatment language appears in module metadata", () => {
    it("validation reports no diagnosis/treatment language errors", async () => {
      const result = await validateComplaintModules();
      const diagErrors = result.errors.filter((e) => e.includes("diagnosis/treatment"));
      expect(diagErrors).toHaveLength(0);
    });
  });

  describe("13. Module docs explain this is urgency guidance + vet handoff only", () => {
    it("skin module has safety notes about vet handoff", () => {
      expect(skinItchingAllergyModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = skinItchingAllergyModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });

    it("gi module has safety notes about vet handoff", () => {
      expect(giVomitingDiarrheaModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = giVomitingDiarrheaModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });

    it("limping module has safety notes about vet handoff", () => {
      expect(limpingMobilityPainModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = limpingMobilityPainModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });
  });

  describe("14. Limping severe-pain stop condition uses limping-relevant signals only", () => {
    it("limping_severe_pain does not reference abdominal, neuro, or heat-stroke signals", () => {
      const severePainCondition = limpingMobilityPainModule.stopConditions.find(
        (c) => c.id === "limping_severe_pain"
      );
      expect(severePainCondition).toBeDefined();
      const signals = severePainCondition!.ifAnySignalPresent || [];
      expect(signals).not.toContain("possible_abdominal_pain");
      expect(signals).not.toContain("possible_neuro_emergency");
      expect(signals).not.toContain("possible_heat_stroke");
    });

    it("limping_severe_pain references limping-specific pain signals", () => {
      const severePainCondition = limpingMobilityPainModule.stopConditions.find(
        (c) => c.id === "limping_severe_pain"
      );
      const signals = severePainCondition!.ifAnySignalPresent || [];
      expect(signals.some((s) => s.includes("pain") || s.includes("yelp") || s.includes("drag"))).toBe(true);
    });
  });

  describe("15. Limping emergency stop conditions cover severe pain, trauma, and non-weight-bearing", () => {
    it("has emergency stop for non-weight-bearing or trauma", () => {
      const condition = limpingMobilityPainModule.stopConditions.find(
        (c) => c.id === "limping_non_weight_bearing_or_trauma"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("non_weight_bearing");
      expect(flags).toContain("severe_trauma");
    });

    it("has emergency stop for severe pain", () => {
      const condition = limpingMobilityPainModule.stopConditions.find(
        (c) => c.id === "limping_severe_pain"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
    });

    it("has emergency stop for fracture suspicion", () => {
      const condition = limpingMobilityPainModule.stopConditions.find(
        (c) => c.id === "limping_fracture_suspicion"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("obvious_fracture");
    });
  });

  describe("Helper functions", () => {
    it("getComplaintModuleById returns correct module", () => {
      expect(getComplaintModuleById("skin_itching_allergy")?.id).toBe("skin_itching_allergy");
      expect(getComplaintModuleById("gi_vomiting_diarrhea")?.id).toBe("gi_vomiting_diarrhea");
      expect(getComplaintModuleById("limping_mobility_pain")?.id).toBe("limping_mobility_pain");
    });

    it("getComplaintModuleById returns undefined for unknown id", () => {
      expect(getComplaintModuleById("unknown_module")).toBeUndefined();
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("skin_itching_allergy");
      expect(ids).toContain("skin_emergency_allergy_screen");
    });

    it("getEmergencyScreenQuestionIdsForModule returns undefined for unknown id", () => {
      expect(getEmergencyScreenQuestionIdsForModule("unknown")).toBeUndefined();
    });

    it("validateComplaintModules passes structural checks", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
