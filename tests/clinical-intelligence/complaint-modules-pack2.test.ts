import {
  getComplaintModules,
  getComplaintModuleById,
  findComplaintModulesForText,
  getEmergencyScreenQuestionIdsForModule,
  validateComplaintModules,
  respiratoryDistressModule,
  seizureCollapseNeuroModule,
  urinaryObstructionModule,
} from "@/lib/clinical-intelligence/complaint-modules";

import { getAllQuestionCards } from "@/lib/clinical-intelligence/question-card-registry";
import { EMERGENCY_RED_FLAG_IDS } from "@/lib/clinical-intelligence/emergency-red-flags";
import * as fs from "fs";
import * as path from "path";

describe("Complaint Modules Pack 2", () => {
  describe("1. All three new modules exist", () => {
    it("should export respiratory_distress", () => {
      expect(respiratoryDistressModule).toBeDefined();
      expect(respiratoryDistressModule.id).toBe("respiratory_distress");
    });

    it("should export seizure_collapse_neuro", () => {
      expect(seizureCollapseNeuroModule).toBeDefined();
      expect(seizureCollapseNeuroModule.id).toBe("seizure_collapse_neuro");
    });

    it("should export urinary_obstruction", () => {
      expect(urinaryObstructionModule).toBeDefined();
      expect(urinaryObstructionModule.id).toBe("urinary_obstruction");
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
    it("respiratory module has emergency screen questions", () => {
      expect(respiratoryDistressModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });

    it("seizure module has emergency screen questions", () => {
      expect(seizureCollapseNeuroModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });

    it("urinary module has emergency screen questions", () => {
      expect(urinaryObstructionModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });
  });

  describe("4. Each new module has stop conditions", () => {
    it("respiratory module has stop conditions", () => {
      expect(respiratoryDistressModule.stopConditions.length).toBeGreaterThan(0);
    });

    it("seizure module has stop conditions", () => {
      expect(seizureCollapseNeuroModule.stopConditions.length).toBeGreaterThan(0);
    });

    it("urinary module has stop conditions", () => {
      expect(urinaryObstructionModule.stopConditions.length).toBeGreaterThan(0);
    });
  });

  describe("5. New modules reference only known question-card IDs", () => {
    it("should validate without errors against real question-card registry", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("6. Respiratory module asks breathing difficulty before characterization", () => {
    it("first phase is emergency_screen", () => {
      expect(respiratoryDistressModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase includes breathing_difficulty_check", () => {
      expect(respiratoryDistressModule.phases[0].questionIds).toContain("breathing_difficulty_check");
    });

    it("second phase is characterize with toxin exposure", () => {
      expect(respiratoryDistressModule.phases[1].id).toBe("characterize");
      expect(respiratoryDistressModule.phases[1].questionIds).toContain("toxin_exposure_check");
    });
  });

  describe("7. Seizure module asks seizure neuro check before duration", () => {
    it("first phase is emergency_screen", () => {
      expect(seizureCollapseNeuroModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase starts with seizure_neuro_check", () => {
      expect(seizureCollapseNeuroModule.phases[0].questionIds[0]).toBe("seizure_neuro_check");
    });

    it("emergency phase includes collapse_weakness_check", () => {
      expect(seizureCollapseNeuroModule.phases[0].questionIds).toContain("collapse_weakness_check");
    });
  });

  describe("8. Urinary module prioritizes blockage check and straining output", () => {
    it("first phase is emergency_screen", () => {
      expect(urinaryObstructionModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase starts with urinary_blockage_check", () => {
      expect(urinaryObstructionModule.phases[0].questionIds[0]).toBe("urinary_blockage_check");
    });

    it("characterize phase includes urinary_straining_output", () => {
      expect(urinaryObstructionModule.phases[1].questionIds).toContain("urinary_straining_output");
    });
  });

  describe("9. Trigger matching finds respiratory cases", () => {
    it("matches 'my dog is coughing a lot'", () => {
      const matches = findComplaintModulesForText("my dog is coughing a lot");
      expect(matches.map((m) => m.id)).toContain("respiratory_distress");
    });

    it("matches 'difficulty breathing after walk'", () => {
      const matches = findComplaintModulesForText("difficulty breathing after walk");
      expect(matches.map((m) => m.id)).toContain("respiratory_distress");
    });

    it("matches 'gasping and wheezing'", () => {
      const matches = findComplaintModulesForText("gasping and wheezing");
      expect(matches.map((m) => m.id)).toContain("respiratory_distress");
    });

    it("matches 'breathing problem' via alias", () => {
      const matches = findComplaintModulesForText("seems to have a breathing problem");
      expect(matches.map((m) => m.id)).toContain("respiratory_distress");
    });
  });

  describe("10. Trigger matching finds seizure/collapse/neuro cases", () => {
    it("matches 'had a seizure this morning'", () => {
      const matches = findComplaintModulesForText("had a seizure this morning");
      expect(matches.map((m) => m.id)).toContain("seizure_collapse_neuro");
    });

    it("matches 'collapsed and fainted'", () => {
      const matches = findComplaintModulesForText("collapsed and fainted");
      expect(matches.map((m) => m.id)).toContain("seizure_collapse_neuro");
    });

    it("matches 'trembling and disoriented'", () => {
      const matches = findComplaintModulesForText("trembling and disoriented");
      expect(matches.map((m) => m.id)).toContain("seizure_collapse_neuro");
    });

    it("matches 'neurological event' via alias", () => {
      const matches = findComplaintModulesForText("looks like a neurological event");
      expect(matches.map((m) => m.id)).toContain("seizure_collapse_neuro");
    });
  });

  describe("11. Trigger matching finds urinary cases", () => {
    it("matches 'straining to pee with no output'", () => {
      const matches = findComplaintModulesForText("straining to pee with no output");
      expect(matches.map((m) => m.id)).toContain("urinary_obstruction");
    });

    it("matches 'blood in urine'", () => {
      const matches = findComplaintModulesForText("blood in urine");
      expect(matches.map((m) => m.id)).toContain("urinary_obstruction");
    });

    it("matches 'not peeing since yesterday'", () => {
      const matches = findComplaintModulesForText("not peeing since yesterday");
      expect(matches.map((m) => m.id)).toContain("urinary_obstruction");
    });

    it("matches 'urination problem' via alias", () => {
      const matches = findComplaintModulesForText("having a urination problem");
      expect(matches.map((m) => m.id)).toContain("urinary_obstruction");
    });
  });

  describe("12. Boundary-aware matching rejects short triggers inside unrelated words", () => {
    it("does not match 'cough' inside 'scoffing'", () => {
      const matches = findComplaintModulesForText("scoffing at the idea");
      expect(matches.map((m) => m.id)).not.toContain("respiratory_distress");
    });

    it("does not match 'fit' inside 'benefit'", () => {
      const matches = findComplaintModulesForText("benefit of the doubt");
      expect(matches.map((m) => m.id)).not.toContain("seizure_collapse_neuro");
    });

    it("does not match 'uti' inside 'cuticle'", () => {
      const matches = findComplaintModulesForText("cuticle injury");
      expect(matches.map((m) => m.id)).not.toContain("urinary_obstruction");
    });

    it("does not match 'pee' inside 'speed'", () => {
      const matches = findComplaintModulesForText("running at full speed");
      expect(matches.map((m) => m.id)).not.toContain("urinary_obstruction");
    });
  });

  describe("13. No diagnosis or treatment language appears in new module metadata", () => {
    it("validation reports no diagnosis/treatment language errors", async () => {
      const result = await validateComplaintModules();
      const diagErrors = result.errors.filter((e) => e.includes("diagnosis/treatment"));
      expect(diagErrors).toHaveLength(0);
    });
  });

  describe("14. New module docs explain urgency guidance + vet handoff only", () => {
    it("respiratory module has safety notes about vet handoff", () => {
      expect(respiratoryDistressModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = respiratoryDistressModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });

    it("seizure module has safety notes about vet handoff", () => {
      expect(seizureCollapseNeuroModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = seizureCollapseNeuroModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });

    it("urinary module has safety notes about vet handoff", () => {
      expect(urinaryObstructionModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = urinaryObstructionModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });
  });

  describe("15. Respiratory emergency stop conditions cover breathing difficulty and collapse", () => {
    it("has emergency stop for breathing difficulty or collapse", () => {
      const condition = respiratoryDistressModule.stopConditions.find(
        (c) => c.id === "respiratory_breathing_difficulty_or_collapse"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("breathing_difficulty");
      expect(flags).toContain("collapse");
    });

    it("has signal-based stop for possible breathing difficulty", () => {
      const condition = respiratoryDistressModule.stopConditions.find(
        (c) => c.id === "respiratory_breathing_signal"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const signals = condition!.ifAnySignalPresent || [];
      expect(signals).toContain("possible_breathing_difficulty");
    });
  });

  describe("16. Seizure emergency stop conditions cover seizure activity and collapse", () => {
    it("has emergency stop for prolonged seizure or collapse", () => {
      const condition = seizureCollapseNeuroModule.stopConditions.find(
        (c) => c.id === "seizure_prolonged_or_collapse"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("seizure_activity");
      expect(flags).toContain("seizure_prolonged");
      expect(flags).toContain("collapse");
    });

    it("has signal-based stop for neuro emergency or collapse", () => {
      const condition = seizureCollapseNeuroModule.stopConditions.find(
        (c) => c.id === "seizure_neuro_signal"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const signals = condition!.ifAnySignalPresent || [];
      expect(signals).toContain("possible_neuro_emergency");
      expect(signals).toContain("possible_collapse_or_weakness");
    });
  });

  describe("17. Urinary emergency stop conditions cover blockage and no urine", () => {
    it("has emergency stop for urinary blockage or no urine", () => {
      const condition = urinaryObstructionModule.stopConditions.find(
        (c) => c.id === "urinary_blockage_or_no_urine"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("urinary_blockage");
      expect(flags).toContain("no_urine_24h");
    });

    it("has signal-based stop for possible urinary obstruction", () => {
      const condition = urinaryObstructionModule.stopConditions.find(
        (c) => c.id === "urinary_obstruction_signal"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const signals = condition!.ifAnySignalPresent || [];
      expect(signals).toContain("possible_urinary_obstruction");
    });
  });

  describe("18. Stop-condition IDs are validated against real emitted or canonical flags", () => {
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
      for (const mod of [respiratoryDistressModule, seizureCollapseNeuroModule, urinaryObstructionModule]) {
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
      for (const mod of [respiratoryDistressModule, seizureCollapseNeuroModule, urinaryObstructionModule]) {
        for (const condition of mod.stopConditions) {
          for (const flag of condition.ifRedFlagPositive || []) {
            expect(flag).not.toBe("facial_swelling");
          }
        }
      }
    });
  });

  describe("19. New modules have report fields and valid phases", () => {
    it("respiratory module has report fields", () => {
      expect(respiratoryDistressModule.reportFields.length).toBeGreaterThan(0);
    });

    it("seizure module has report fields", () => {
      expect(seizureCollapseNeuroModule.reportFields.length).toBeGreaterThan(0);
    });

    it("urinary module has report fields", () => {
      expect(urinaryObstructionModule.reportFields.length).toBeGreaterThan(0);
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
      for (const mod of [respiratoryDistressModule, seizureCollapseNeuroModule, urinaryObstructionModule]) {
        for (const phase of mod.phases) {
          expect(validPhaseIds.has(phase.id)).toBe(true);
          expect(phase.maxQuestionsFromPhase).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("Helper functions", () => {
    it("getComplaintModuleById returns correct new modules", () => {
      expect(getComplaintModuleById("respiratory_distress")?.id).toBe("respiratory_distress");
      expect(getComplaintModuleById("seizure_collapse_neuro")?.id).toBe("seizure_collapse_neuro");
      expect(getComplaintModuleById("urinary_obstruction")?.id).toBe("urinary_obstruction");
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs for respiratory", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("respiratory_distress");
      expect(ids).toContain("breathing_difficulty_check");
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs for seizure", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("seizure_collapse_neuro");
      expect(ids).toContain("seizure_neuro_check");
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs for urinary", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("urinary_obstruction");
      expect(ids).toContain("urinary_blockage_check");
    });

    it("validateComplaintModules passes structural checks with all six modules", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
