import {
  getComplaintModules,
  getComplaintModuleById,
  findComplaintModulesForText,
  getEmergencyScreenQuestionIdsForModule,
  validateComplaintModules,
  heatstrokeHeatExposureModule,
  traumaBleedingWoundModule,
} from "@/lib/clinical-intelligence/complaint-modules";

import { getAllQuestionCards } from "@/lib/clinical-intelligence/question-card-registry";
import { EMERGENCY_RED_FLAG_IDS } from "@/lib/clinical-intelligence/emergency-red-flags";
import * as fs from "fs";
import * as path from "path";

describe("Complaint Modules Heat + Trauma Pack (VET-1421K)", () => {
  describe("1. Both new modules exist", () => {
    it("should export heatstroke_heat_exposure", () => {
      expect(heatstrokeHeatExposureModule).toBeDefined();
      expect(heatstrokeHeatExposureModule.id).toBe("heatstroke_heat_exposure");
    });

    it("should export trauma_bleeding_wound", () => {
      expect(traumaBleedingWoundModule).toBeDefined();
      expect(traumaBleedingWoundModule.id).toBe("trauma_bleeding_wound");
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

  describe("3. Each new module has emergency-screen question IDs", () => {
    it("heatstroke module has emergency screen questions", () => {
      expect(heatstrokeHeatExposureModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });

    it("trauma module has emergency screen questions", () => {
      expect(traumaBleedingWoundModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });
  });

  describe("4. Each new module has stop conditions", () => {
    it("heatstroke module has stop conditions", () => {
      expect(heatstrokeHeatExposureModule.stopConditions.length).toBeGreaterThan(0);
    });

    it("trauma module has stop conditions", () => {
      expect(traumaBleedingWoundModule.stopConditions.length).toBeGreaterThan(0);
    });
  });

  describe("5. New modules reference only known question-card IDs", () => {
    it("should validate without errors against real question-card registry", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("6. Heatstroke module asks gum and collapse checks before characterization", () => {
    it("first phase is emergency_screen", () => {
      expect(heatstrokeHeatExposureModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase includes gum_color_check", () => {
      expect(heatstrokeHeatExposureModule.phases[0].questionIds).toContain("gum_color_check");
    });

    it("emergency phase includes emergency_global_screen", () => {
      expect(heatstrokeHeatExposureModule.phases[0].questionIds).toContain("emergency_global_screen");
    });

    it("emergency phase includes breathing_difficulty_check", () => {
      expect(heatstrokeHeatExposureModule.phases[0].questionIds).toContain("breathing_difficulty_check");
    });
  });

  describe("7. Trauma module asks gum and collapse checks before characterization", () => {
    it("first phase is emergency_screen", () => {
      expect(traumaBleedingWoundModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase includes gum_color_check", () => {
      expect(traumaBleedingWoundModule.phases[0].questionIds).toContain("gum_color_check");
    });

    it("emergency phase includes emergency_global_screen", () => {
      expect(traumaBleedingWoundModule.phases[0].questionIds).toContain("emergency_global_screen");
    });

    it("emergency phase includes breathing_difficulty_check", () => {
      expect(traumaBleedingWoundModule.phases[0].questionIds).toContain("breathing_difficulty_check");
    });
  });

  describe("8. Trigger matching finds heatstroke cases", () => {
    it("matches 'my dog has heat stroke'", () => {
      const matches = findComplaintModulesForText("my dog has heat stroke");
      expect(matches.map((m) => m.id)).toContain("heatstroke_heat_exposure");
    });

    it("matches 'overheating in the sun'", () => {
      const matches = findComplaintModulesForText("overheating in the sun");
      expect(matches.map((m) => m.id)).toContain("heatstroke_heat_exposure");
    });

    it("matches 'left in hot car'", () => {
      const matches = findComplaintModulesForText("left in hot car");
      expect(matches.map((m) => m.id)).toContain("heatstroke_heat_exposure");
    });

    it("matches 'collapsed in heat'", () => {
      const matches = findComplaintModulesForText("collapsed in heat");
      expect(matches.map((m) => m.id)).toContain("heatstroke_heat_exposure");
    });

    it("matches 'heat exhaustion' via alias", () => {
      const matches = findComplaintModulesForText("could be heat exhaustion");
      expect(matches.map((m) => m.id)).toContain("heatstroke_heat_exposure");
    });
  });

  describe("9. Trigger matching finds trauma/bleeding cases", () => {
    it("matches 'my dog is bleeding'", () => {
      const matches = findComplaintModulesForText("my dog is bleeding");
      expect(matches.map((m) => m.id)).toContain("trauma_bleeding_wound");
    });

    it("matches 'hit by car'", () => {
      const matches = findComplaintModulesForText("hit by car");
      expect(matches.map((m) => m.id)).toContain("trauma_bleeding_wound");
    });

    it("matches 'deep cut on paw'", () => {
      const matches = findComplaintModulesForText("deep cut on paw");
      expect(matches.map((m) => m.id)).toContain("trauma_bleeding_wound");
    });

    it("matches 'wound after fight'", () => {
      const matches = findComplaintModulesForText("wound after fight");
      expect(matches.map((m) => m.id)).toContain("trauma_bleeding_wound");
    });

    it("matches 'hemorrhage' via alias", () => {
      const matches = findComplaintModulesForText("severe hemorrhage");
      expect(matches.map((m) => m.id)).toContain("trauma_bleeding_wound");
    });
  });

  describe("10. Boundary-aware matching rejects substring false positives", () => {
    it("does not match 'heat' inside 'heart'", () => {
      const matches = findComplaintModulesForText("heart problem");
      expect(matches.map((m) => m.id)).not.toContain("heatstroke_heat_exposure");
    });

    it("does not match 'bleed' inside 'bleeding' — bleed trigger should match bleeding", () => {
      // 'bleed' uses \bbleed\b which matches 'bleeding' because 'bleeding' starts with 'bleed' + 'ing'
      // Actually \bbleed\b won't match 'bleeding' because the boundary after 'd' doesn't match 'i'
      // But 'bleeding' is its own trigger, so it should match.
      const matches = findComplaintModulesForText("bleeding heavily");
      expect(matches.map((m) => m.id)).toContain("trauma_bleeding_wound");
    });

    it("does not match 'hot' inside 'hotel'", () => {
      const matches = findComplaintModulesForText("hotel stay");
      expect(matches.map((m) => m.id)).not.toContain("heatstroke_heat_exposure");
    });

    it("does not match 'cut' inside 'cute'", () => {
      const matches = findComplaintModulesForText("cute puppy");
      expect(matches.map((m) => m.id)).not.toContain("trauma_bleeding_wound");
    });

    it("does not match 'wound' inside 'wounded' — wounded is not a trigger", () => {
      // 'wound' uses \bwound\b which does not match 'wounded' because of trailing 'e'
      const matches = findComplaintModulesForText("wounded leg");
      expect(matches.map((m) => m.id)).not.toContain("trauma_bleeding_wound");
    });
  });

  describe("11. No diagnosis or treatment language appears in new module metadata", () => {
    it("validation reports no diagnosis/treatment language errors", async () => {
      const result = await validateComplaintModules();
      const diagErrors = result.errors.filter((e) => e.includes("diagnosis/treatment"));
      expect(diagErrors).toHaveLength(0);
    });
  });

  describe("12. New module safety notes explain urgency guidance + vet handoff only", () => {
    it("heatstroke module has safety notes about vet handoff", () => {
      expect(heatstrokeHeatExposureModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = heatstrokeHeatExposureModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });

    it("trauma module has safety notes about vet handoff", () => {
      expect(traumaBleedingWoundModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = traumaBleedingWoundModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });
  });

  describe("13. Heatstroke emergency stop conditions cover heatstroke signs and brachycephalic heat", () => {
    it("has emergency stop for heatstroke signs", () => {
      const condition = heatstrokeHeatExposureModule.stopConditions.find(
        (c) => c.id === "heatstroke_emergency"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("heatstroke_signs");
      expect(flags).toContain("brachycephalic_heat");
      expect(flags).toContain("collapse");
      expect(flags).toContain("breathing_difficulty");
      expect(flags).toContain("pale_gums");
      expect(flags).toContain("blue_gums");
    });

    it("has signal-based stop for possible heat stroke", () => {
      const condition = heatstrokeHeatExposureModule.stopConditions.find(
        (c) => c.id === "heatstroke_signal"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const signals = condition!.ifAnySignalPresent || [];
      expect(signals).toContain("possible_heat_stroke");
      expect(signals).toContain("possible_collapse_or_weakness");
      expect(signals).toContain("possible_breathing_difficulty");
    });
  });

  describe("14. Trauma emergency stop conditions cover bleeding and deep wounds", () => {
    it("has emergency stop for large blood volume or deep bleeding", () => {
      const condition = traumaBleedingWoundModule.stopConditions.find(
        (c) => c.id === "trauma_emergency"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("large_blood_volume");
      expect(flags).toContain("wound_deep_bleeding");
      expect(flags).toContain("collapse");
      expect(flags).toContain("unresponsive");
      expect(flags).toContain("pale_gums");
      expect(flags).toContain("blue_gums");
      expect(flags).toContain("breathing_difficulty");
    });

    it("has signal-based stop for possible trauma", () => {
      const condition = traumaBleedingWoundModule.stopConditions.find(
        (c) => c.id === "trauma_signal"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const signals = condition!.ifAnySignalPresent || [];
      expect(signals).toContain("possible_trauma");
      expect(signals).toContain("possible_collapse_or_weakness");
      expect(signals).toContain("possible_pale_gums");
      expect(signals).toContain("possible_blue_gums");
      expect(signals).toContain("possible_breathing_difficulty");
    });
  });

  describe("15. Stop-condition IDs are validated against real emitted or canonical flags", () => {
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
      for (const mod of [heatstrokeHeatExposureModule, traumaBleedingWoundModule]) {
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
      for (const mod of [heatstrokeHeatExposureModule, traumaBleedingWoundModule]) {
        for (const condition of mod.stopConditions) {
          for (const flag of condition.ifRedFlagPositive || []) {
            expect(flag).not.toBe("facial_swelling");
          }
        }
      }
    });
  });

  describe("16. New modules have report fields and valid phases", () => {
    it("heatstroke module has report fields", () => {
      expect(heatstrokeHeatExposureModule.reportFields.length).toBeGreaterThan(0);
    });

    it("trauma module has report fields", () => {
      expect(traumaBleedingWoundModule.reportFields.length).toBeGreaterThan(0);
    });

    it("all phases in new modules have valid IDs and positive maxQuestionsFromPhase", () => {
      const validPhaseIds = new Set([
        "emergency_screen",
        "characterize",
        "discriminate",
        "timeline",
        "history",
        "handoff",
      ]);
      for (const mod of [heatstrokeHeatExposureModule, traumaBleedingWoundModule]) {
        for (const phase of mod.phases) {
          expect(validPhaseIds.has(phase.id)).toBe(true);
          expect(phase.maxQuestionsFromPhase).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("Helper functions", () => {
    it("getComplaintModuleById returns correct new modules", () => {
      expect(getComplaintModuleById("heatstroke_heat_exposure")?.id).toBe("heatstroke_heat_exposure");
      expect(getComplaintModuleById("trauma_bleeding_wound")?.id).toBe("trauma_bleeding_wound");
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs for heatstroke", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("heatstroke_heat_exposure");
      expect(ids).toContain("emergency_global_screen");
      expect(ids).toContain("gum_color_check");
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs for trauma", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("trauma_bleeding_wound");
      expect(ids).toContain("emergency_global_screen");
      expect(ids).toContain("gum_color_check");
    });

    it("validateComplaintModules passes structural checks with all eleven modules", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
