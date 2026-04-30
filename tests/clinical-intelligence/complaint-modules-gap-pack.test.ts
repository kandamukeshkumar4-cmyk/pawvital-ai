import {
  getComplaintModules,
  getComplaintModuleById,
  findComplaintModulesForText,
  getEmergencyScreenQuestionIdsForModule,
  validateComplaintModules,
  bloatGdvModule,
  collapseWeaknessModule,
} from "@/lib/clinical-intelligence/complaint-modules";

import { getAllQuestionCards } from "@/lib/clinical-intelligence/question-card-registry";
import { EMERGENCY_RED_FLAG_IDS } from "@/lib/clinical-intelligence/emergency-red-flags";
import * as fs from "fs";
import * as path from "path";

describe("Complaint Modules Gap Pack (VET-1418K)", () => {
  describe("1. Both new modules exist", () => {
    it("should export bloat_gdv", () => {
      expect(bloatGdvModule).toBeDefined();
      expect(bloatGdvModule.id).toBe("bloat_gdv");
    });

    it("should export collapse_weakness", () => {
      expect(collapseWeaknessModule).toBeDefined();
      expect(collapseWeaknessModule.id).toBe("collapse_weakness");
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
    it("bloat module has emergency screen questions", () => {
      expect(bloatGdvModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });

    it("collapse module has emergency screen questions", () => {
      expect(collapseWeaknessModule.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
    });
  });

  describe("4. Each new module has stop conditions", () => {
    it("bloat module has stop conditions", () => {
      expect(bloatGdvModule.stopConditions.length).toBeGreaterThan(0);
    });

    it("collapse module has stop conditions", () => {
      expect(collapseWeaknessModule.stopConditions.length).toBeGreaterThan(0);
    });
  });

  describe("5. New modules reference only known question-card IDs", () => {
    it("should validate without errors against real question-card registry", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("6. Bloat module asks bloat retching abdomen check before characterization", () => {
    it("first phase is emergency_screen", () => {
      expect(bloatGdvModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase starts with bloat_retching_abdomen_check", () => {
      expect(bloatGdvModule.phases[0].questionIds[0]).toBe("bloat_retching_abdomen_check");
    });

    it("emergency phase includes emergency_global_screen", () => {
      expect(bloatGdvModule.phases[0].questionIds).toContain("emergency_global_screen");
    });

    it("second phase is characterize with gi_vomiting_frequency", () => {
      expect(bloatGdvModule.phases[1].id).toBe("characterize");
      expect(bloatGdvModule.phases[1].questionIds).toContain("gi_vomiting_frequency");
    });
  });

  describe("7. Collapse module asks collapse weakness check before characterization", () => {
    it("first phase is emergency_screen", () => {
      expect(collapseWeaknessModule.phases[0].id).toBe("emergency_screen");
    });

    it("emergency phase starts with collapse_weakness_check", () => {
      expect(collapseWeaknessModule.phases[0].questionIds[0]).toBe("collapse_weakness_check");
    });

    it("emergency phase includes emergency_global_screen", () => {
      expect(collapseWeaknessModule.phases[0].questionIds).toContain("emergency_global_screen");
    });

    it("emergency phase includes breathing_difficulty_check", () => {
      expect(collapseWeaknessModule.phases[0].questionIds).toContain("breathing_difficulty_check");
    });
  });

  describe("8. Trigger matching finds bloat/GDV cases", () => {
    it("matches 'my dog has bloat'", () => {
      const matches = findComplaintModulesForText("my dog has bloat");
      expect(matches.map((m) => m.id)).toContain("bloat_gdv");
    });

    it("matches 'swollen belly'", () => {
      const matches = findComplaintModulesForText("swollen belly");
      expect(matches.map((m) => m.id)).toContain("bloat_gdv");
    });

    it("matches 'hard abdomen and retching'", () => {
      const matches = findComplaintModulesForText("hard abdomen and retching");
      expect(matches.map((m) => m.id)).toContain("bloat_gdv");
    });

    it("matches 'trying to vomit but nothing comes up'", () => {
      const matches = findComplaintModulesForText("trying to vomit but nothing comes up");
      expect(matches.map((m) => m.id)).toContain("bloat_gdv");
    });

    it("matches 'restless with distended belly'", () => {
      const matches = findComplaintModulesForText("restless with distended belly");
      expect(matches.map((m) => m.id)).toContain("bloat_gdv");
    });

    it("matches 'gdv' via alias", () => {
      const matches = findComplaintModulesForText("could be gdv");
      expect(matches.map((m) => m.id)).toContain("bloat_gdv");
    });
  });

  describe("9. Trigger matching finds collapse/weakness cases", () => {
    it("matches 'my dog collapsed'", () => {
      const matches = findComplaintModulesForText("my dog collapsed");
      expect(matches.map((m) => m.id)).toContain("collapse_weakness");
    });

    it("matches 'fainted after walking'", () => {
      const matches = findComplaintModulesForText("fainted after walking");
      expect(matches.map((m) => m.id)).toContain("collapse_weakness");
    });

    it("matches 'extreme weakness and cannot stand'", () => {
      const matches = findComplaintModulesForText("extreme weakness and cannot stand");
      expect(matches.map((m) => m.id)).toContain("collapse_weakness");
    });

    it("matches 'unresponsive and pale gums'", () => {
      const matches = findComplaintModulesForText("unresponsive and pale gums");
      expect(matches.map((m) => m.id)).toContain("collapse_weakness");
    });

    it("matches 'severe weakness' via alias", () => {
      const matches = findComplaintModulesForText("severe weakness today");
      expect(matches.map((m) => m.id)).toContain("collapse_weakness");
    });
  });

  describe("10. Boundary-aware matching rejects substring false positives", () => {
    it("does not match 'bloat' inside 'bloated' — actually bloat should not match bloated due to word boundary", () => {
      const matches = findComplaintModulesForText("bloated abdomen");
      // 'bloat' trigger uses \bbloat\b which does not match 'bloated' because of trailing 'e'
      // However, 'swollen abdomen' alias should match 'bloated abdomen'? No.
      // So bloat_gdv should NOT match here.
      expect(matches.map((m) => m.id)).not.toContain("bloat_gdv");
    });

    it("does not match 'weak' inside 'weakness' — weak trigger uses word boundary", () => {
      // 'weak' uses \bweak\b which does not match 'weakness' because of trailing 'n'
      const matches = findComplaintModulesForText("weakness in legs");
      // But 'extreme weakness' trigger should match 'weakness in legs'?
      // \bextreme weakness\b looks for 'extreme weakness' as a phrase.
      // 'weakness in legs' does not contain 'extreme weakness'.
      // So collapse_weakness should NOT match.
      expect(matches.map((m) => m.id)).not.toContain("collapse_weakness");
    });

    it("does not match 'restless' inside 'restlessness'", () => {
      const matches = findComplaintModulesForText("restlessness overnight");
      expect(matches.map((m) => m.id)).not.toContain("bloat_gdv");
    });

    it("does not match 'collapse' inside 'collapsed' — wait, 'collapsed' is a separate trigger", () => {
      // This test verifies 'collapse' doesn't match substrings, but 'collapsed' is its own trigger.
      // So 'collapsed' should match, but 'collapse' inside 'collapsed' as a substring match isn't how regex works.
      // Actually \bcollapse\b won't match 'collapsed'. Good.
      const matches = findComplaintModulesForText("collapsed on floor");
      expect(matches.map((m) => m.id)).toContain("collapse_weakness");
    });

    it("does not match 'retching' inside 'stretching'", () => {
      const matches = findComplaintModulesForText("stretching after sleep");
      expect(matches.map((m) => m.id)).not.toContain("bloat_gdv");
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
    it("bloat module has safety notes about vet handoff", () => {
      expect(bloatGdvModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = bloatGdvModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });

    it("collapse module has safety notes about vet handoff", () => {
      expect(collapseWeaknessModule.safetyNotes.length).toBeGreaterThan(0);
      const combined = collapseWeaknessModule.safetyNotes.join(" ").toLowerCase();
      expect(combined).toContain("veterinary");
    });
  });

  describe("13. Bloat emergency stop conditions cover GDV and abdominal distension", () => {
    it("has emergency stop for bloat/GDV or abdominal distension", () => {
      const condition = bloatGdvModule.stopConditions.find(
        (c) => c.id === "bloat_gdv_emergency"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("gastric_dilatation_volvulus");
      expect(flags).toContain("unproductive_retching");
      expect(flags).toContain("rapid_onset_distension");
      expect(flags).toContain("collapse");
      expect(flags).toContain("pale_gums");
    });

    it("has signal-based stop for possible bloat GDV", () => {
      const condition = bloatGdvModule.stopConditions.find(
        (c) => c.id === "bloat_gdv_signal"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const signals = condition!.ifAnySignalPresent || [];
      expect(signals).toContain("possible_bloat_gdv");
      expect(signals).toContain("possible_nonproductive_retching");
    });
  });

  describe("14. Collapse emergency stop conditions cover collapse and unresponsiveness", () => {
    it("has emergency stop for collapse or unresponsiveness", () => {
      const condition = collapseWeaknessModule.stopConditions.find(
        (c) => c.id === "collapse_weakness_emergency"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const flags = condition!.ifRedFlagPositive || [];
      expect(flags).toContain("collapse");
      expect(flags).toContain("unresponsive");
      expect(flags).toContain("pale_gums");
      expect(flags).toContain("blue_gums");
      expect(flags).toContain("breathing_difficulty");
    });

    it("has signal-based stop for possible collapse or weakness", () => {
      const condition = collapseWeaknessModule.stopConditions.find(
        (c) => c.id === "collapse_weakness_signal"
      );
      expect(condition).toBeDefined();
      expect(condition!.result).toBe("emergency");
      const signals = condition!.ifAnySignalPresent || [];
      expect(signals).toContain("possible_collapse_or_weakness");
      expect(signals).toContain("possible_pale_gums");
      expect(signals).toContain("possible_blue_gums");
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
      for (const mod of [bloatGdvModule, collapseWeaknessModule]) {
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
      for (const mod of [bloatGdvModule, collapseWeaknessModule]) {
        for (const condition of mod.stopConditions) {
          for (const flag of condition.ifRedFlagPositive || []) {
            expect(flag).not.toBe("facial_swelling");
          }
        }
      }
    });
  });

  describe("16. New modules have report fields and valid phases", () => {
    it("bloat module has report fields", () => {
      expect(bloatGdvModule.reportFields.length).toBeGreaterThan(0);
    });

    it("collapse module has report fields", () => {
      expect(collapseWeaknessModule.reportFields.length).toBeGreaterThan(0);
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
      for (const mod of [bloatGdvModule, collapseWeaknessModule]) {
        for (const phase of mod.phases) {
          expect(validPhaseIds.has(phase.id)).toBe(true);
          expect(phase.maxQuestionsFromPhase).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("Helper functions", () => {
    it("getComplaintModuleById returns correct new modules", () => {
      expect(getComplaintModuleById("bloat_gdv")?.id).toBe("bloat_gdv");
      expect(getComplaintModuleById("collapse_weakness")?.id).toBe("collapse_weakness");
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs for bloat", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("bloat_gdv");
      expect(ids).toContain("bloat_retching_abdomen_check");
    });

    it("getEmergencyScreenQuestionIdsForModule returns correct IDs for collapse", () => {
      const ids = getEmergencyScreenQuestionIdsForModule("collapse_weakness");
      expect(ids).toContain("collapse_weakness_check");
    });

    it("validateComplaintModules passes structural checks with all nine modules", async () => {
      const knownIds = getAllQuestionCards().map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
