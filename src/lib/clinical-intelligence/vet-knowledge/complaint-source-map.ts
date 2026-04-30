import type { VetKnowledgeAllowedUse } from "./source-registry";
import { getComplaintModuleById, getComplaintModules } from "../complaint-modules";
import { planRetrieval } from "./retrieval-planner";
import { buildCitations } from "./citation-builder";

export interface ComplaintSourceMapEntry {
  complaintModuleId: string;
  displayName: string;
  vetKnowledgeFamilies: string[];
  relevantRedFlags: string[];
  retrievalIntent: VetKnowledgeAllowedUse | "none";
  citationIntent: VetKnowledgeAllowedUse | "none";
  rationaleNotes: string[];
}

export interface ComplaintSourceMapResult {
  entry: ComplaintSourceMapEntry | null;
  retrievalSourceCount: number;
  citationCount: number;
}

const COMPLAINT_SOURCE_MAP: ComplaintSourceMapEntry[] = [
  {
    complaintModuleId: "skin_itching_allergy",
    displayName: "Skin Itching / Allergy",
    vetKnowledgeFamilies: ["dermatological", "emergency"],
    relevantRedFlags: [
      "face_swelling",
      "breathing_difficulty",
      "collapse",
      "pale_gums",
      "blue_gums",
    ],
    retrievalIntent: "internal_reasoning",
    citationIntent: "owner_visible_citation",
    rationaleNotes: [
      "Skin/dermatological complaints map to internal vet-reviewed question notes for symptom assessment patterns.",
      "Emergency red flags (breathing difficulty, collapse, gum color changes) map to Merck XABCDE triage and AAHA emergency signs.",
      "Owner-visible citations should only come from AAHA emergency signs source when anaphylaxis-related red flags are present.",
    ],
  },
  {
    complaintModuleId: "gi_vomiting_diarrhea",
    displayName: "GI Vomiting / Diarrhea",
    vetKnowledgeFamilies: ["gastrointestinal", "emergency"],
    relevantRedFlags: [
      "hematemesis",
      "melena",
      "hematochezia",
      "gastric_dilatation_volvulus",
      "unproductive_retching",
      "pale_gums",
      "blue_gums",
      "collapse",
      "unable_to_retain_water",
      "persistent_vomiting",
    ],
    retrievalIntent: "internal_reasoning",
    citationIntent: "owner_visible_citation",
    rationaleNotes: [
      "GI complaints map to AAHA emergency signs and Cornell GDV/bloat sources for owner-visible citations.",
      "Internal vet-reviewed question notes cover gastrointestinal symptom assessment patterns.",
      "GDV-related red flags (unproductive retching, gastric dilatation volvulus) map directly to Cornell bloat source.",
      "Blood-related red flags (hematemesis, melena, hematochezia) map to AAHA emergency signs with bleeding guidance.",
    ],
  },
  {
    complaintModuleId: "limping_mobility_pain",
    displayName: "Limping / Mobility Pain",
    vetKnowledgeFamilies: ["musculoskeletal", "trauma", "emergency"],
    relevantRedFlags: [
      "non_weight_bearing",
      "post_trauma_lameness",
      "collapse",
      "pale_gums",
      "blue_gums",
    ],
    retrievalIntent: "internal_reasoning",
    citationIntent: "owner_visible_citation",
    rationaleNotes: [
      "Musculoskeletal complaints map to internal vet-reviewed question notes for symptom assessment.",
      "Trauma-related red flags map to Merck XABCDE triage framework.",
      "Systemic compromise red flags (collapse, pale/blue gums) map to emergency triage sources.",
      "No owner-visible citation source is specific to musculoskeletal complaints; emergency citations may apply when systemic red flags are present.",
    ],
  },
  {
    complaintModuleId: "respiratory_distress",
    displayName: "Respiratory Distress / Coughing / Breathing Difficulty",
    vetKnowledgeFamilies: ["respiratory", "emergency"],
    relevantRedFlags: [
      "breathing_difficulty",
      "collapse",
      "pale_gums",
      "blue_gums",
    ],
    retrievalIntent: "internal_reasoning",
    citationIntent: "owner_visible_citation",
    rationaleNotes: [
      "Respiratory complaints map to Merck XABCDE triage (airway, breathing) and internal vet-reviewed notes.",
      "Emergency red flags (breathing difficulty, collapse, gum color changes) map to AAHA emergency signs.",
      "Owner-visible citations should reference AAHA emergency signs for breathing difficulty recognition.",
    ],
  },
  {
    complaintModuleId: "seizure_collapse_neuro",
    displayName: "Seizure / Collapse / Neurologic Emergency",
    vetKnowledgeFamilies: ["neurological", "emergency"],
    relevantRedFlags: [
      "seizure_activity",
      "seizure_prolonged",
      "collapse",
      "unresponsive",
    ],
    retrievalIntent: "internal_reasoning",
    citationIntent: "owner_visible_citation",
    rationaleNotes: [
      "Neurological complaints map to internal vet-reviewed question notes covering seizure activity and prolonged seizures.",
      "Collapse and unresponsiveness red flags map to Merck XABCDE triage (disability, circulation).",
      "AAHA emergency signs cover collapse recognition for owner-visible citations.",
      "No owner-visible citation source is specific to neurological complaints; emergency citations apply for collapse-related red flags.",
    ],
  },
  {
    complaintModuleId: "urinary_obstruction",
    displayName: "Urinary Obstruction / Urination Problems",
    vetKnowledgeFamilies: ["emergency"],
    relevantRedFlags: ["urinary_blockage", "no_urine_24h"],
    retrievalIntent: "internal_reasoning",
    citationIntent: "none",
    rationaleNotes: [
      "Urinary obstruction maps to internal vet-reviewed question notes which include urinary_blockage red flag.",
      "No dedicated owner-visible citation source exists for urinary complaints in the current registry.",
      "Emergency triage sources may apply when systemic compromise red flags are present.",
      "Future registry expansion should add a urinary-specific curated source for owner-visible citations.",
    ],
  },
  {
    complaintModuleId: "toxin_poisoning_exposure",
    displayName: "Toxin / Poisoning / Exposure",
    vetKnowledgeFamilies: ["gastrointestinal", "emergency"],
    relevantRedFlags: [
      "toxin_confirmed",
      "rat_poison_confirmed",
      "toxin_with_symptoms",
      "collapse",
      "vomit_blood",
    ],
    retrievalIntent: "internal_reasoning",
    citationIntent: "owner_visible_citation",
    rationaleNotes: [
      "Toxin exposure maps to GI and emergency complaint families in the vet-knowledge registry.",
      "Vomit blood red flag maps to AAHA emergency signs source for owner-visible citations.",
      "Collapse red flag maps to Merck XABCDE triage and AAHA emergency signs.",
      "Internal vet-reviewed notes cover toxin exposure as a clinical signal across multiple complaint modules.",
    ],
  },
];

const MODULE_ID_TO_ENTRY = new Map<string, ComplaintSourceMapEntry>(
  COMPLAINT_SOURCE_MAP.map((entry) => [entry.complaintModuleId, entry])
);

function defensiveCloneEntry(entry: ComplaintSourceMapEntry): ComplaintSourceMapEntry {
  return {
    ...entry,
    vetKnowledgeFamilies: [...entry.vetKnowledgeFamilies],
    relevantRedFlags: [...entry.relevantRedFlags],
    rationaleNotes: [...entry.rationaleNotes],
  };
}

export function getAllComplaintSourceMapEntries(): ComplaintSourceMapEntry[] {
  return COMPLAINT_SOURCE_MAP.map(defensiveCloneEntry);
}

export function getComplaintSourceMapEntry(
  moduleId: string
): ComplaintSourceMapEntry | undefined {
  const entry = MODULE_ID_TO_ENTRY.get(moduleId);
  return entry ? defensiveCloneEntry(entry) : undefined;
}

export function getComplaintSourceMapForModule(
  moduleId: string
): ComplaintSourceMapResult {
  const entry = getComplaintSourceMapEntry(moduleId);

  if (!entry) {
    return {
      entry: null,
      retrievalSourceCount: 0,
      citationCount: 0,
    };
  }

  const primaryFamily = entry.vetKnowledgeFamilies[0] ?? "";
  const retrievalPlan = planRetrieval({
    complaintFamily: primaryFamily || undefined,
    redFlags: entry.relevantRedFlags.length > 0 ? entry.relevantRedFlags : undefined,
    allowedUse: entry.retrievalIntent !== "none" ? entry.retrievalIntent : undefined,
  });

  const citationResult =
    entry.citationIntent !== "none"
      ? buildCitations({
          complaintFamily: primaryFamily || undefined,
          redFlags: entry.relevantRedFlags.length > 0 ? entry.relevantRedFlags : undefined,
        })
      : { citations: [], excludedReasons: [], policyWarnings: [] };

  return {
    entry,
    retrievalSourceCount: retrievalPlan.sources.length,
    citationCount: citationResult.citations.length,
  };
}

export function validateComplaintSourceMap(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const entry of COMPLAINT_SOURCE_MAP) {
    const complaintModule = getComplaintModuleById(entry.complaintModuleId);

    if (!complaintModule) {
      errors.push(
        `complaint module "${entry.complaintModuleId}" does not exist in registry`
      );
      continue;
    }

    if (complaintModule.displayNameForLogs !== entry.displayName) {
      warnings.push(
        `display name mismatch for "${entry.complaintModuleId}": map says "${entry.displayName}", registry says "${complaintModule.displayNameForLogs}"`
      );
    }

    for (const family of entry.vetKnowledgeFamilies) {
      const plan = planRetrieval({ complaintFamily: family });
      if (plan.blockedReasons.length > 0 && plan.sources.length === 0) {
        warnings.push(
          `family "${family}" for module "${entry.complaintModuleId}" returns no vet-knowledge sources`
        );
      }
    }

    if (entry.citationIntent === "owner_visible_citation") {
      const citationResult = buildCitations({
        complaintFamily: entry.vetKnowledgeFamilies[0],
        redFlags: entry.relevantRedFlags.length > 0 ? entry.relevantRedFlags : undefined,
      });

      if (citationResult.citations.length === 0) {
        warnings.push(
          `no owner-visible citations available for module "${entry.complaintModuleId}"`
        );
      }
    }
  }

  const registeredModules = getComplaintModules();
  const mappedIds = new Set(COMPLAINT_SOURCE_MAP.map((e) => e.complaintModuleId));

  for (const complaintModule of registeredModules) {
    if (!mappedIds.has(complaintModule.id)) {
      warnings.push(
        `complaint module "${complaintModule.id}" is not mapped in complaint source map`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
