import type { ClinicalCaseState, ClinicalSignal } from "../../src/lib/clinical-intelligence/case-state";
import { createInitialClinicalCaseState } from "../../src/lib/clinical-intelligence/case-state";
import { detectSignals } from "../../src/lib/clinical-intelligence/clinical-signal-detector";
import { getComplaintModuleById } from "../../src/lib/clinical-intelligence/complaint-modules";
import { EMERGENCY_RED_FLAG_IDS } from "../../src/lib/clinical-intelligence/emergency-red-flags";
import { filterAnsweredOrAskedQuestions } from "../../src/lib/clinical-intelligence/next-question-planner";
import {
  getAllQuestionCards,
  getQuestionCardById,
} from "../../src/lib/clinical-intelligence/question-card-registry";
import { getCoverageByModuleId } from "../../src/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry";
import { getComplaintSourceMapEntry } from "../../src/lib/clinical-intelligence/vet-knowledge/complaint-source-map";
import { getGapByModuleId } from "../../src/lib/clinical-intelligence/vet-knowledge/source-gap-plan";

const HEAT_CARD_IDS = [
  "heat_exposure_check",
  "brachycephalic_breed_check",
  "panting_excess_check",
] as const;

const TRAUMA_CARD_IDS = [
  "trauma_mechanism_check",
  "wound_characterization_check",
  "bleeding_volume_check",
  "laceration_depth_check",
] as const;

const HEAT_MODULE_ID = "heatstroke_heat_exposure";
const TRAUMA_MODULE_ID = "trauma_bleeding_wound";

const REQUIRED_HEAT_RED_FLAGS = [
  "heatstroke_signs",
  "brachycephalic_heat",
  "collapse",
  "breathing_difficulty",
  "pale_gums",
  "blue_gums",
] as const;

const REQUIRED_TRAUMA_RED_FLAGS = [
  "large_blood_volume",
  "wound_deep_bleeding",
  "collapse",
  "unresponsive",
  "pale_gums",
  "blue_gums",
  "breathing_difficulty",
] as const;

const REQUIRED_SIGNAL_PHRASES: Record<string, string> = {
  possible_heat_stroke:
    "He is panting heavily after being outside in the heat and looks overheated.",
  possible_trauma: "My dog was hit by a car and is bleeding.",
  possible_collapse_or_weakness: "She collapsed and cannot stand up.",
  possible_breathing_difficulty: "He is struggling to breathe right now.",
  possible_pale_gums: "His gums look pale and white.",
  possible_blue_gums: "Her gums look blue and dusky.",
};

function makeSignal(id: string, evidenceText: string): ClinicalSignal {
  return {
    id,
    type: "owner_language",
    severity: "high",
    evidenceText,
    turnDetected: 1,
  };
}

function buildCaseState(
  overrides: Partial<ClinicalCaseState> = {}
): ClinicalCaseState {
  const base = createInitialClinicalCaseState();
  return {
    ...base,
    ...overrides,
    explicitAnswers: {
      ...base.explicitAnswers,
      ...(overrides.explicitAnswers ?? {}),
    },
    redFlagStatus: {
      ...base.redFlagStatus,
      ...(overrides.redFlagStatus ?? {}),
    },
    clinicalSignals: overrides.clinicalSignals ?? base.clinicalSignals,
    concernBuckets: overrides.concernBuckets ?? base.concernBuckets,
    missingCriticalSlots:
      overrides.missingCriticalSlots ?? base.missingCriticalSlots,
    askedQuestionIds: overrides.askedQuestionIds ?? base.askedQuestionIds,
    answeredQuestionIds:
      overrides.answeredQuestionIds ?? base.answeredQuestionIds,
    skippedQuestionIds: overrides.skippedQuestionIds ?? base.skippedQuestionIds,
  };
}

function getCandidateIds(caseState: ClinicalCaseState): string[] {
  return filterAnsweredOrAskedQuestions(getAllQuestionCards(), caseState).map(
    (card) => card.id
  );
}

describe("Heat/Trauma Question-Card Reachability Guard (VET-1435Q)", () => {
  describe("reachability after nearby answers", () => {
    it("heat_exposure_check answered does not suppress brachycephalic_breed_check when heat-risk context remains relevant", () => {
      const state = buildCaseState({
        activeComplaintModule: HEAT_MODULE_ID,
        explicitAnswers: {
          heat_exposure_check: true,
        },
        answeredQuestionIds: ["heat_exposure_check"],
        clinicalSignals: [
          makeSignal(
            "possible_heat_stroke",
            "Panting hard after being out in the heat."
          ),
          makeSignal(
            "possible_breathing_difficulty",
            "Breathing still looks labored after cooling."
          ),
        ],
        currentUrgency: "urgent",
        urgencyTrajectory: "worsening",
      });

      const candidateIds = getCandidateIds(state);

      expect(candidateIds).not.toContain("heat_exposure_check");
      expect(candidateIds).toContain("brachycephalic_breed_check");
      expect(candidateIds).toContain("panting_excess_check");

      const brachy = getQuestionCardById("brachycephalic_breed_check");
      expect(brachy).toBeDefined();
      expect(brachy!.skipIfAnswered).not.toContain("heat_exposure_check");
    });

    it("wound_characterization_check answered does not suppress laceration_depth_check when wound-depth context remains relevant", () => {
      const state = buildCaseState({
        activeComplaintModule: TRAUMA_MODULE_ID,
        explicitAnswers: {
          wound_characterization_check: "Cut / laceration",
        },
        answeredQuestionIds: ["wound_characterization_check"],
        clinicalSignals: [
          makeSignal("possible_trauma", "My dog has a fresh cut after an accident."),
        ],
        currentUrgency: "urgent",
        urgencyTrajectory: "worsening",
      });

      const candidateIds = getCandidateIds(state);

      expect(candidateIds).not.toContain("wound_characterization_check");
      expect(candidateIds).toContain("laceration_depth_check");
      expect(candidateIds).toContain("bleeding_volume_check");

      const depth = getQuestionCardById("laceration_depth_check");
      expect(depth).toBeDefined();
      expect(depth!.skipIfAnswered).not.toContain(
        "wound_characterization_check"
      );
    });
  });

  describe("heat/trauma emergency-screen contract", () => {
    it("bleeding_volume_check remains emergency_screen with urgencyImpact = 3", () => {
      const bleeding = getQuestionCardById("bleeding_volume_check");
      expect(bleeding).toBeDefined();
      expect(bleeding!.phase).toBe("emergency_screen");
      expect(bleeding!.urgencyImpact).toBe(3);
    });

    it("panting_excess_check remains emergency_screen with urgencyImpact = 3", () => {
      const panting = getQuestionCardById("panting_excess_check");
      expect(panting).toBeDefined();
      expect(panting!.phase).toBe("emergency_screen");
      expect(panting!.urgencyImpact).toBe(3);
    });
  });

  describe("canonical red-flag linkage", () => {
    const canonicalRedFlags = new Set<string>(EMERGENCY_RED_FLAG_IDS);

    it("all heat/trauma screensRedFlags reference existing canonical red flags", () => {
      const offenders: string[] = [];

      for (const cardId of [...HEAT_CARD_IDS, ...TRAUMA_CARD_IDS]) {
        const card = getQuestionCardById(cardId);
        expect(card).toBeDefined();

        for (const redFlagId of card!.screensRedFlags) {
          if (!canonicalRedFlags.has(redFlagId)) {
            offenders.push(`${cardId} -> ${redFlagId}`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });

    it("heat readiness retains all required canonical red flags", () => {
      const sourceMapEntry = getComplaintSourceMapEntry(HEAT_MODULE_ID);
      expect(sourceMapEntry).toBeDefined();

      for (const redFlagId of REQUIRED_HEAT_RED_FLAGS) {
        expect(canonicalRedFlags.has(redFlagId)).toBe(true);
        expect(sourceMapEntry!.relevantRedFlags).toContain(redFlagId);
      }
    });

    it("trauma readiness retains all required canonical red flags", () => {
      const sourceMapEntry = getComplaintSourceMapEntry(TRAUMA_MODULE_ID);
      expect(sourceMapEntry).toBeDefined();

      for (const redFlagId of REQUIRED_TRAUMA_RED_FLAGS) {
        expect(canonicalRedFlags.has(redFlagId)).toBe(true);
        expect(sourceMapEntry!.relevantRedFlags).toContain(redFlagId);
      }
    });
  });

  describe("signal and metadata readiness", () => {
    it("all required heat/trauma signals are still detectable from owner-language phrases", () => {
      for (const [signalId, phrase] of Object.entries(REQUIRED_SIGNAL_PHRASES)) {
        const detected = detectSignals(phrase).some((signal) => signal.id === signalId);
        expect(detected).toBe(true);
      }
    });

    it("heatstroke readiness keeps complaint-module and vet-knowledge metadata aligned", () => {
      const complaintModule = getComplaintModuleById(HEAT_MODULE_ID);
      const sourceMapEntry = getComplaintSourceMapEntry(HEAT_MODULE_ID);
      const coverageEntry = getCoverageByModuleId(HEAT_MODULE_ID);
      const gapEntry = getGapByModuleId(HEAT_MODULE_ID);

      expect(complaintModule).toBeDefined();
      expect(sourceMapEntry).toBeDefined();
      expect(sourceMapEntry!.vetKnowledgeFamilies).toEqual(["emergency"]);
      expect(coverageEntry).toBeDefined();
      expect(coverageEntry!.status).toBe("active");
      expect(coverageEntry!.sourceCoverage).toBe("partial");
      expect(coverageEntry!.ownerVisibleCitationCoverage).toBe(
        "emergency_only"
      );
      expect(gapEntry).toBeDefined();
      expect(gapEntry!.priority).toBe("high");
      expect(gapEntry!.internalReasoningNeed).toBe(true);
    });

    it("trauma readiness keeps complaint-module and vet-knowledge metadata aligned", () => {
      const complaintModule = getComplaintModuleById(TRAUMA_MODULE_ID);
      const sourceMapEntry = getComplaintSourceMapEntry(TRAUMA_MODULE_ID);
      const coverageEntry = getCoverageByModuleId(TRAUMA_MODULE_ID);
      const gapEntry = getGapByModuleId(TRAUMA_MODULE_ID);

      expect(complaintModule).toBeDefined();
      expect(sourceMapEntry).toBeDefined();
      expect(sourceMapEntry!.vetKnowledgeFamilies).toEqual([
        "trauma",
        "emergency",
        "bleeding",
      ]);
      expect(coverageEntry).toBeDefined();
      expect(coverageEntry!.status).toBe("active");
      expect(coverageEntry!.sourceCoverage).toBe("partial");
      expect(coverageEntry!.ownerVisibleCitationCoverage).toBe(
        "emergency_only"
      );
      expect(gapEntry).toBeDefined();
      expect(gapEntry!.priority).toBe("high");
      expect(gapEntry!.internalReasoningNeed).toBe(true);
    });
  });
});
