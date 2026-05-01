import {
  getComplaintModules,
  getComplaintModuleById,
  findComplaintModulesForText,
  getEmergencyScreenQuestionIdsForModule,
  validateComplaintModules,
} from "@/lib/clinical-intelligence/complaint-modules";

import { getAllQuestionCards } from "@/lib/clinical-intelligence/question-card-registry";
import { EMERGENCY_RED_FLAG_IDS } from "@/lib/clinical-intelligence/emergency-red-flags";
import {
  getAllComplaintSourceMapEntries,
  getComplaintSourceMapEntry,
} from "@/lib/clinical-intelligence/vet-knowledge/complaint-source-map";
import * as fs from "fs";
import * as path from "path";

describe("Complaint Module Registry Gap Audit (VET-1424K)", () => {
  const allModules = getComplaintModules();
  const allCards = getAllQuestionCards();
  const registryIds = new Set(allCards.map((c) => c.id));

  // Build emitted red-flag set from question cards
  const emittedRedFlags = new Set<string>();
  for (const card of allCards) {
    for (const flag of card.screensRedFlags) {
      emittedRedFlags.add(flag);
    }
  }
  const canonicalRedFlags = new Set<string>(EMERGENCY_RED_FLAG_IDS);
  const validRedFlags = new Set([...emittedRedFlags, ...canonicalRedFlags]);

  // Build signal set from clinical-signal-detector source
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

  describe("1. Registry completeness — nine modules registered", () => {
    it("should have exactly nine complaint modules", () => {
      expect(allModules).toHaveLength(9);
    });

    it("should include all expected module IDs", () => {
      const ids = allModules.map((m) => m.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          "skin_itching_allergy",
          "gi_vomiting_diarrhea",
          "limping_mobility_pain",
          "respiratory_distress",
          "seizure_collapse_neuro",
          "urinary_obstruction",
          "toxin_poisoning_exposure",
          "bloat_gdv",
          "collapse_weakness",
        ])
      );
    });

    it("should NOT yet include heatstroke or trauma modules", () => {
      const ids = allModules.map((m) => m.id);
      expect(ids).not.toContain("heatstroke_heat_exposure");
      expect(ids).not.toContain("trauma_bleeding_wound");
    });
  });

  describe("2. Trigger uniqueness and risky short triggers", () => {
    it("should have unique module IDs", () => {
      const ids = allModules.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should not have unexpected duplicate triggers across modules", () => {
      const triggerMap = new Map<string, string[]>();
      for (const mod of allModules) {
        for (const t of mod.triggers) {
          const lower = t.toLowerCase();
          if (!triggerMap.has(lower)) {
            triggerMap.set(lower, []);
          }
          triggerMap.get(lower)!.push(mod.id);
        }
      }
      const duplicates = Array.from(triggerMap.entries()).filter(
        ([, modules]) => modules.length > 1
      );

      // Known intentional clinical overlaps documented in audit:
      // - retching: gi + bloat (both need emergency bloat screening)
      // - collapse: seizure + collapse (syncope vs neuro emergency)
      // - fainted: seizure + collapse (same rationale)
      const knownOverlaps = new Set(["retching", "collapse", "fainted"]);
      const unexpected = duplicates.filter(
        ([trigger]) => !knownOverlaps.has(trigger)
      );
      expect(unexpected).toHaveLength(0);
    });

    it("should boundary-reject 'fit' inside 'benefit' (seizure module)", () => {
      const matches = findComplaintModulesForText("benefit of the doubt");
      expect(matches.map((m) => m.id)).not.toContain("seizure_collapse_neuro");
    });

    it("should boundary-reject 'uti' inside 'cuticle' (urinary module)", () => {
      const matches = findComplaintModulesForText("cuticle injury");
      expect(matches.map((m) => m.id)).not.toContain("urinary_obstruction");
    });

    it("should boundary-reject 'skin' inside unrelated words", () => {
      const matches = findComplaintModulesForText("asking for a raise");
      expect(matches.map((m) => m.id)).not.toContain("skin_itching_allergy");
    });
  });

  describe("3. Emergency screen question IDs validity", () => {
    it("every module references only known question-card IDs", () => {
      const invalids: string[] = [];
      for (const mod of allModules) {
        for (const qid of mod.emergencyScreenQuestionIds) {
          if (!registryIds.has(qid)) {
            invalids.push(`${mod.id} emergencyScreenQuestionId: ${qid}`);
          }
        }
      }
      expect(invalids).toHaveLength(0);
    });

    it("every phase in every module references only known question-card IDs", () => {
      const invalids: string[] = [];
      for (const mod of allModules) {
        for (const phase of mod.phases) {
          for (const qid of phase.questionIds) {
            if (!registryIds.has(qid)) {
              invalids.push(`${mod.id} phase ${phase.id} questionId: ${qid}`);
            }
          }
        }
      }
      expect(invalids).toHaveLength(0);
    });

    it("all emergency screen question IDs have positive length", () => {
      for (const mod of allModules) {
        expect(mod.emergencyScreenQuestionIds.length).toBeGreaterThan(0);
      }
    });
  });

  describe("4. Stop-condition red flag validity", () => {
    it("no module references a fake or non-existent red-flag ID", () => {
      const invalids: string[] = [];
      for (const mod of allModules) {
        for (const condition of mod.stopConditions) {
          for (const flag of condition.ifRedFlagPositive || []) {
            if (!validRedFlags.has(flag)) {
              invalids.push(`${mod.id}.${condition.id} redFlag: ${flag}`);
            }
          }
        }
      }
      expect(invalids).toHaveLength(0);
    });

    it("no stop condition references the non-canonical facial_swelling ID", () => {
      for (const mod of allModules) {
        for (const condition of mod.stopConditions) {
          for (const flag of condition.ifRedFlagPositive || []) {
            expect(flag).not.toBe("facial_swelling");
          }
        }
      }
    });
  });

  describe("5. Stop-condition signal validity", () => {
    it("no module references a fake or non-existent signal ID", () => {
      const invalids: string[] = [];
      for (const mod of allModules) {
        for (const condition of mod.stopConditions) {
          for (const signal of condition.ifAnySignalPresent || []) {
            if (!signalIds.has(signal)) {
              invalids.push(`${mod.id}.${condition.id} signal: ${signal}`);
            }
          }
        }
      }
      expect(invalids).toHaveLength(0);
    });
  });

  describe("6. No diagnosis or treatment language", () => {
    it("validation reports no diagnosis/treatment language errors", async () => {
      const knownIds = allCards.map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      const diagErrors = result.errors.filter((e) =>
        e.includes("diagnosis/treatment")
      );
      expect(diagErrors).toHaveLength(0);
    });
  });

  describe("7. Module IDs represented in vet-knowledge mapping", () => {
    it("every registered module has a complaint-source-map entry", () => {
      const mappedIds = new Set(
        getAllComplaintSourceMapEntries().map((e) => e.complaintModuleId)
      );
      const missing: string[] = [];
      for (const mod of allModules) {
        if (!mappedIds.has(mod.id)) {
          missing.push(mod.id);
        }
      }
      expect(missing).toHaveLength(0);
    });

    it("vet-knowledge map has no orphaned entries (all entries point to real modules)", () => {
      const registeredIds = new Set(allModules.map((m) => m.id));
      const orphaned: string[] = [];
      for (const entry of getAllComplaintSourceMapEntries()) {
        if (!registeredIds.has(entry.complaintModuleId)) {
          orphaned.push(entry.complaintModuleId);
        }
      }
      expect(orphaned).toHaveLength(0);
    });

    it("display names in map match module displayNameForLogs", () => {
      const mismatches: string[] = [];
      for (const mod of allModules) {
        const entry = getComplaintSourceMapEntry(mod.id);
        if (entry && entry.displayName !== mod.displayNameForLogs) {
          mismatches.push(
            `${mod.id}: map="${entry.displayName}" module="${mod.displayNameForLogs}"`
          );
        }
      }
      expect(mismatches).toHaveLength(0);
    });
  });

  describe("8. Structural sanity — phases, stop conditions, report fields", () => {
    const validPhaseIds = new Set([
      "emergency_screen",
      "characterize",
      "discriminate",
      "timeline",
      "history",
      "handoff",
    ]);

    it("all phases have valid IDs and positive maxQuestionsFromPhase", () => {
      const bad: string[] = [];
      for (const mod of allModules) {
        for (const phase of mod.phases) {
          if (!validPhaseIds.has(phase.id)) {
            bad.push(`${mod.id} invalid phase: ${phase.id}`);
          }
          if (phase.maxQuestionsFromPhase <= 0) {
            bad.push(
              `${mod.id} phase ${phase.id} maxQuestionsFromPhase <= 0`
            );
          }
        }
      }
      expect(bad).toHaveLength(0);
    });

    it("every module has at least one stop condition", () => {
      for (const mod of allModules) {
        expect(mod.stopConditions.length).toBeGreaterThan(0);
      }
    });

    it("every module has at least one report field", () => {
      for (const mod of allModules) {
        expect(mod.reportFields.length).toBeGreaterThan(0);
      }
    });

    it("every module has at least one safety note", () => {
      for (const mod of allModules) {
        expect(mod.safetyNotes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("9. Candidate gap evaluation — readiness audit", () => {
    // These tests document why each candidate gap is blocked.
    // They do NOT create new modules.

    describe("9.1 eye / vision / discharge", () => {
      it("has zero eye-specific question cards in registry", () => {
        const eyeCards = allCards.filter((c) =>
          /\b(eye|vision|ocular)\b/i.test(c.id)
        );
        expect(eyeCards).toHaveLength(0);
      });

      it("has zero eye-specific red flags in canonical list", () => {
        const eyeFlags = EMERGENCY_RED_FLAG_IDS.filter((f) =>
          /\b(eye|vision|ocular)\b/i.test(f)
        );
        expect(eyeFlags).toHaveLength(0);
      });

      it("has zero eye-specific clinical signals", () => {
        const eyeSignals = Array.from(signalIds).filter((s) =>
          /\b(eye|vision|ocular)\b/i.test(s)
        );
        expect(eyeSignals).toHaveLength(0);
      });
    });

    describe("9.2 ear / head-tilt / balance", () => {
      it("has zero ear-specific question cards in registry", () => {
        const earCards = allCards.filter((c) =>
          /\b(ear|head_tilt|balance|vestibular)\b/i.test(c.id)
        );
        expect(earCards).toHaveLength(0);
      });

      it("has zero ear-specific red flags in canonical list", () => {
        const earFlags = EMERGENCY_RED_FLAG_IDS.filter((f) =>
          /\b(ear|head_tilt|balance|vestibular)\b/i.test(f)
        );
        expect(earFlags).toHaveLength(0);
      });

      it("has zero ear-specific clinical signals", () => {
        const earSignals = Array.from(signalIds).filter((s) =>
          /\b(ear|head_tilt|balance|vestibular)\b/i.test(s)
        );
        expect(earSignals).toHaveLength(0);
      });
    });

    describe("9.3 appetite / weight-loss / drinking-more", () => {
      it("has zero appetite/weight/drinking question cards in registry", () => {
        const appCards = allCards.filter((c) =>
          /\b(appetite|weight_loss|drink|polydipsia|anorexia)\b/i.test(c.id)
        );
        expect(appCards).toHaveLength(0);
      });

      it("has zero appetite/weight red flags in canonical list", () => {
        const appFlags = EMERGENCY_RED_FLAG_IDS.filter((f) =>
          /\b(appetite|weight_loss|drink|polydipsia|anorexia)\b/i.test(f)
        );
        expect(appFlags).toHaveLength(0);
      });

      it("has zero appetite/weight clinical signals", () => {
        const appSignals = Array.from(signalIds).filter((s) =>
          /\b(appetite|weight_loss|drink|polydipsia|anorexia)\b/i.test(s)
        );
        expect(appSignals).toHaveLength(0);
      });
    });

    describe("9.4 post-vaccination reaction", () => {
      it("has zero vaccine-specific question cards in registry", () => {
        const vaxCards = allCards.filter((c) =>
          /\b(vaccine|vax|injection)\b/i.test(c.id)
        );
        expect(vaxCards).toHaveLength(0);
      });

      it("has zero vaccine-specific red flags in canonical list", () => {
        const vaxFlags = EMERGENCY_RED_FLAG_IDS.filter((f) =>
          /\b(vaccine|vax|injection)\b/i.test(f)
        );
        expect(vaxFlags).toHaveLength(0);
      });

      it("has zero vaccine-specific clinical signals", () => {
        const vaxSignals = Array.from(signalIds).filter((s) =>
          /\b(vaccine|vax|injection)\b/i.test(s)
        );
        expect(vaxSignals).toHaveLength(0);
      });
    });

    describe("9.5 pain / abdomen not already covered by GI / bloat", () => {
      it("has no dedicated abdominal-pain question cards beyond bloat/gi screens", () => {
        const painCards = allCards.filter((c) =>
          /\b(abdominal_pain|belly_pain|guarding|rigid)\b/i.test(c.id)
        );
        expect(painCards).toHaveLength(0);
      });

      it("has only one abdominal-pain clinical signal (possible_abdominal_pain)", () => {
        const painSignals = Array.from(signalIds).filter((s) =>
          /(?:^|_)(abdominal|belly_pain|guarding)(?:$|_)/i.test(s)
        );
        expect(painSignals).toEqual(["possible_abdominal_pain"]);
      });
    });

    describe("9.6 wound / skin issue overlap with future trauma module", () => {
      it("skin module fires for 'skin wound' but trauma module does not yet exist", () => {
        const matches = findComplaintModulesForText("my dog has a skin wound");
        const ids = matches.map((m) => m.id);
        expect(ids).toContain("skin_itching_allergy");
        // trauma_bleeding_wound is not yet in the registry
        expect(ids).not.toContain("trauma_bleeding_wound");
      });

      it("does not trigger skin module for standalone 'wound'", () => {
        const matches = findComplaintModulesForText("deep wound on paw");
        const ids = matches.map((m) => m.id);
        expect(ids).not.toContain("skin_itching_allergy");
        expect(ids).not.toContain("trauma_bleeding_wound");
      });
    });

    describe("9.7 heatstroke / heat exposure (not yet landed)", () => {
      it("heatstroke_heat_exposure module is not exported from registry", () => {
        expect(getComplaintModuleById("heatstroke_heat_exposure")).toBeUndefined();
      });

      it("has heat-related red flags in canonical list", () => {
        const heatFlags = EMERGENCY_RED_FLAG_IDS.filter((f) =>
          /(?:^|_)(heatstroke|brachycephalic_heat)(?:$|_)/i.test(f)
        );
        expect(heatFlags).toEqual(["heatstroke_signs", "brachycephalic_heat"]);
      });

      it("has heat-related clinical signal", () => {
        const heatSignals = Array.from(signalIds).filter((s) =>
          /(?:^|_)(heat_stroke|heatstroke)(?:$|_)/i.test(s)
        );
        expect(heatSignals).toEqual(["possible_heat_stroke"]);
      });
    });

    describe("9.8 trauma / bleeding / wound (not yet landed)", () => {
      it("trauma_bleeding_wound module is not exported from registry", () => {
        expect(getComplaintModuleById("trauma_bleeding_wound")).toBeUndefined();
      });

      it("has trauma-related red flags in canonical list", () => {
        const traumaFlags = EMERGENCY_RED_FLAG_IDS.filter((f) =>
          /\b(large_blood_volume|wound_deep_bleeding)\b/i.test(f)
        );
        expect(traumaFlags).toEqual(["large_blood_volume", "wound_deep_bleeding"]);
      });

      it("has trauma-related clinical signal", () => {
        const traumaSignals = Array.from(signalIds).filter((s) =>
          /\b(possible_trauma)\b/i.test(s)
        );
        expect(traumaSignals).toEqual(["possible_trauma"]);
      });
    });
  });

  describe("10. Overall validation pass", () => {
    it("validateComplaintModules passes with zero errors against full registry", async () => {
      const knownIds = allCards.map((c) => c.id);
      const result = await validateComplaintModules(knownIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
