import {
  getComplaintModules,
  getComplaintModuleById,
  findComplaintModulesForText,
  getEmergencyScreenQuestionIdsForModule,
  validateComplaintModules,
  toxinPoisoningExposureModule,
} from "@/lib/clinical-intelligence/complaint-modules";

import { getAllQuestionCards } from "@/lib/clinical-intelligence/question-card-registry";
import { EMERGENCY_RED_FLAG_IDS } from "@/lib/clinical-intelligence/emergency-red-flags";
import * as fs from "fs";
import * as path from "path";

describe("Complaint Modules Pack 3", () => {
  describe("1. Toxin module exists", () => {
    it("should export toxin_poisoning_exposure", () => {
      expect(toxinPoisoningExposureModule).toBeDefined();
      expect(toxinPoisoningExposureModule.id).toBe("toxin_poisoning_exposure");
    });
  });

  describe("2. Module IDs remain unique across all modules", () => {
    it("should return unique module IDs from getComplaintModules", () => {
      const modules = getComplaintModules();
      const ids = modules.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("3. Toxin module has emergency-screen question IDs", () => {
    it("toxin module has emergency screen questions", () => {
      expect(toxinPoisoningExposureModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });
  });

  describe("4. Toxin module has stop conditions", () => {
    it("toxin module has stop conditions", () => {
      expect(toxinPoisoningExposureModule.stopConditions.length).toBeGreaterThan(0);
    });
  });

  describe("5. Toxin module references only known question-card IDs", () => {
    it("should validate without errors against real question-card registry", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("6. Toxin module asks toxin exposure before characterization", () => {
    it("first phase is emergency_screen", () => {
      expect(toxinPoisoningExposureModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase starts with toxin_exposure_check", () => {
      expect(toxinPoisoningExposureModule.phases[0].questionIds[0]).toBe("toxin_exposure_check");
    });

    it("emergency phase includes emergency_global_screen", () => {
      expect(toxinPoisoningExposureModule.phases[0].questionIds).toContain("emergency_global_screen");
    });

    it("second phase is characterize with gi_vomiting_frequency", () => {
      expect(toxinPoisoningExposureModule.phases[1].id).toBe("characterize");
      expect(toxinPoisoningExposureModule.phases[1].questionIds).toContain("gi_vomiting_frequency");
    });
  });

  describe("7. Trigger matching finds toxin cases", () => {
    it("matches 'ate chocolate'", () => {
      const matches = findComplaintModulesForText("my dog ate chocolate");
      expect(matches.map((m) => m.id)).toContain("toxin_poisoning_exposure");
    });

    it("matches 'rat poison'", () => {
      const matches = findComplaintModulesForText("found rat poison in mouth");
      expect(matches.map((m) => m.id)).toContain("toxin_poisoning_exposure");
    });

    it("matches 'xylitol'", () => {
      const matches = findComplaintModulesForText("chewed gum with xylitol");
      expect(matches.map((m) => m.id)).toContain("toxin_poisoning_exposure");
    });

    it("matches 'got into cleaning products'", () => {
      const matches = findComplaintModulesForText("got into cleaning products");
      expect(matches.map((m) => m.id)).toContain("toxin_poisoning_exposure");
    });

    it("matches 'toxic exposure' via alias", () => {
      const matches = findComplaintModulesForText("suspected toxic exposure");
      expect(matches.map((m) => m.id)).toContain("toxin_poisoning_exposure");
    });
  });

  describe("8. Boundary-aware matching rejects short triggers inside unrelated words", () => {
    it("does not match 'ate' inside 'later'", () => {
      const matches = findComplaintModulesForText("later today");
      expect(matches.map((m) => m.id)).not.toContain("toxin_poisoning_exposure");
    });

    it("does not match 'poison' inside 'poisonous-looking plant' — actually poison should match", () => {
      // 'poison' is a standalone word in 'poisonous-looking' is not a match because \bpoison\b
      const matches = findComplaintModulesForText("poisonous-looking plant");
      expect(matches.map((m) => m.id)).not.toContain("toxin_poisoning_exposure");
    });

    it("does not match 'toxic' inside 'nontoxic'", () => {
      const matches = findComplaintModulesForText("nontoxic paint");
      expect(matches.map((m) => m.id)).not.toContain("toxin_poisoning_exposure");
    });

    it("does not match 'pills' inside 'spills'", () => {
      const matches = findComplaintModulesForText("coffee spills");
      expect(matches.map((m) => m.id)).not.toContain("toxin_poisoning_exposure");
    });
  });

  describe("9. No diagnosis or treatment language appears in module metadata", () => {
    it("validation reports no diagnosis/treatment language errors", async () => {
      const result = await validateComplaintModules();
      const diagErrors = result.errors.filter((e) => e.includes("diagnosis/treatment"));
      expect(diagErrors).toHaveLength(0);
    });
  });

  describe("10. Toxin module safety notes explain urgency guidance + vet handoff only", () => {
    it("toxin module has safety notes about vet handoff", () => {
      expect(toxinPoisoningExposureModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = toxinPoisoningExposureModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });
  });

  describe("11. Toxin emergency stop conditions cover confirmed exposure and symptoms", () => {
    it("has emergency stop for confirmed toxin or symptoms", () => {
      const condition = toxinPoisoningExposureModule.stopConditions.find(
        (c) => c.id === "toxin_confirmed_or_symptoms"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("toxin_confirmed");
      expect(flags).toContain("rat_poison_confirmed");
      expect(flags).toContain("toxin_with_symptoms");
      expect(flags).toContain("collapse");
      expect(flags).toContain("vomit_blood");
    });

    it("has signal-based stop for toxin exposure", () => {
      const condition = toxinPoisoningExposureModule.stopConditions.find(
        (c) => c.id === "toxin_exposure_signal"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const signals = condition!.ifAnySignalPresent || [];
      expect(signals).toContain("toxin_exposure");
    });
  });

  describe("12. Stop-condition IDs are validated against real emitted or canonical flags", () => {
    it("no new module references a fake red-flag or signal ID", () => {
      const allCards = getAllQuestionCards();
      const emittedRedFlags = new Set<string>();
      for (const card of allCards) {
        for (const flag of card.screensRedFlags) {
          emittedRedFlags.add(flag);
        }
      }
      const canonicalRedFlags = new Set<string>(EMERGENCY_RED_FLAG_IDS);
      const validRedFlags = new Set([...emittedRedFlags, ...canonicalRedFlags]);

      const detectorPath = path.join(
        process.cwd(),
        "src/lib/clinical-intelligence/clinical-signal-detector.ts"
      );
      const detectorSource = fs.readFileSync(detectorPath, "utf-8");
      const signalIds = new Set<string>();
      const signalRegex = /id:\s*"([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = signalRegex.exec(detectorSource)) !== null) {
        signalIds.add(match[1]);
      }

      const invalids: string[] = [];
      for (const mod of [toxinPoisoningExposureModule]) {
        for (const condition of mod.stopConditions) {
          for (const flag of condition.ifRedFlagPositive || []) {
            if (!validRedFlags.has(flag)) {
              invalids.push(`${mod.id}.${condition.id} redFlag: ${flag}`);
            }
          }
          for (const signal of condition.ifAnySignalPresent || []) {
            if (!signalIds.has(signal)) {
              invalids.push(`${mod.id}.${condition.id} signal: ${signal}`);
            }
          }
        }
      }

      expect(invalids).toHaveLength(0);
    });

    it("no new stop condition references the non-canonical facial_swelling ID", () => {
      for (const mod of [toxinPoisoningExposureModule]) {
        for (const condition of mod.stopConditions) {
          for (const flag of condition.ifRedFlagPositive || []) {
            expect(flag).not.toBe("facial_swelling");
          }
        }
      }
    });
  });

  describe("13. Toxin module has report fields and valid phases", () => {
    it("toxin module has report fields", () => {
      expect(toxinPoisoningExposureModule.reportFields.length).toBeGreaterThan(0);
    });

    it("all phases have valid IDs and positive maxQuestionsFromPhase", () => {
      const validPhaseIds = new Set([
        "emergency_screen",
        "characterize",
        "discriminate",
        "timeline",
        "history",
        "handoff",
      ]);
      for (const phase of toxinPoisoningExposureModule.phases) {
        expect(validPhaseIds.has(phase.id)).toBe(true);
        expect(phase.maxQuestionsFromPhase).toBeGreaterThan(0);
      }
    });
  });

  describe("Helper functions", () => {
    it("getComplaintModuleById returns toxin module", () => {
      expect(getComplaintModuleById("toxin_poisoning_exposure")?.id).toBe("toxin_poisoning_exposure");
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs for toxin", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("toxin_poisoning_exposure");
      expect(ids).toContain("toxin_exposure_check");
    });

    it("validateComplaintModules passes structural checks with all seven modules", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
