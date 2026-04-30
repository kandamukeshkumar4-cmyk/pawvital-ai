import type { ComplaintModule } from "./types";
import { skinItchingAllergyModule } from "./skin";
import { giVomitingDiarrheaModule } from "./gi";
import { limpingMobilityPainModule } from "./limping";
import { respiratoryDistressModule } from "./respiratory";
import { seizureCollapseNeuroModule } from "./seizure-collapse";
import { urinaryObstructionModule } from "./urinary";
import { toxinPoisoningExposureModule } from "./toxin-exposure";
import { bloatGdvModule } from "./bloat-gdv";
import { collapseWeaknessModule } from "./collapse-weakness";

const ALL_MODULES: ComplaintModule[] = [
  skinItchingAllergyModule,
  giVomitingDiarrheaModule,
  limpingMobilityPainModule,
  respiratoryDistressModule,
  seizureCollapseNeuroModule,
  urinaryObstructionModule,
  toxinPoisoningExposureModule,
  bloatGdvModule,
  collapseWeaknessModule,
];

const MODULE_BY_ID = new Map<string, ComplaintModule>();
for (const m of ALL_MODULES) {
  MODULE_BY_ID.set(m.id, m);
}

const VALID_PHASE_IDS = new Set<string>([
  "emergency_screen",
  "characterize",
  "discriminate",
  "timeline",
  "history",
  "handoff",
]);

export function getComplaintModules(): ComplaintModule[] {
  return ALL_MODULES.slice();
}

export function getComplaintModuleById(id: string): ComplaintModule | undefined {
  return MODULE_BY_ID.get(id);
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesWithWordBoundaries(text: string, phrase: string): boolean {
  const escaped = escapeRegExp(phrase);
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(text);
}

export function findComplaintModulesForText(text: string): ComplaintModule[] {
  const matches: ComplaintModule[] = [];
  for (const m of ALL_MODULES) {
    const hit = m.triggers.some((t) => matchesWithWordBoundaries(text, t))
      || m.aliases.some((a) => matchesWithWordBoundaries(text, a));
    if (hit) {
      matches.push(m);
    }
  }
  return matches;
}

export function getEmergencyScreenQuestionIdsForModule(
  moduleId: string,
): string[] | undefined {
  const m = MODULE_BY_ID.get(moduleId);
  return m ? m.emergencyScreenQuestionIds.slice() : undefined;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function hasDiagnosisOrTreatmentLanguage(text: string): boolean {
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
  ];
  const lower = text.toLowerCase();
  return forbidden.some((f) => lower.includes(f));
}

export async function validateComplaintModules(
  knownQuestionIds?: string[],
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Unique IDs
  const seenIds = new Set<string>();
  for (const m of ALL_MODULES) {
    if (seenIds.has(m.id)) {
      errors.push(`Duplicate module ID: ${m.id}`);
    }
    seenIds.add(m.id);
  }

  // 2. Triggers and aliases
  for (const m of ALL_MODULES) {
    if (!m.triggers || m.triggers.length === 0) {
      errors.push(`Module ${m.id} has no triggers`);
    }
    if (!m.aliases || m.aliases.length === 0) {
      warnings.push(`Module ${m.id} has no aliases`);
    }
  }

  // 3. At least one emergency screen question
  for (const m of ALL_MODULES) {
    if (!m.emergencyScreenQuestionIds || m.emergencyScreenQuestionIds.length === 0) {
      errors.push(`Module ${m.id} has no emergency screen questions`);
    }
  }

  // 4. Referenced question IDs exist in registry (if available)
  let registryIds: Set<string> | undefined;
  if (knownQuestionIds && knownQuestionIds.length > 0) {
    registryIds = new Set(knownQuestionIds);
  } else {
    warnings.push("Question-card registry not provided; skipping question-ID validation against registry");
  }

  if (registryIds) {
    for (const m of ALL_MODULES) {
      for (const qid of m.emergencyScreenQuestionIds) {
        if (!registryIds.has(qid)) {
          errors.push(`Module ${m.id} references unknown emergency question ID: ${qid}`);
        }
      }
      for (const phase of m.phases) {
        for (const qid of phase.questionIds) {
          if (!registryIds.has(qid)) {
            errors.push(`Module ${m.id} phase ${phase.id} references unknown question ID: ${qid}`);
          }
        }
      }
    }
  }

  // 5. Stop conditions
  for (const m of ALL_MODULES) {
    if (!m.stopConditions || m.stopConditions.length === 0) {
      errors.push(`Module ${m.id} has no stop conditions`);
    }
  }

  // 6. Report fields
  for (const m of ALL_MODULES) {
    if (!m.reportFields || m.reportFields.length === 0) {
      errors.push(`Module ${m.id} has no reportFields`);
    }
  }

  // 7. No diagnosis/treatment claims
  for (const m of ALL_MODULES) {
    const fieldsToCheck = [
      m.displayNameForLogs,
      ...m.triggers,
      ...m.aliases,
      ...m.safetyNotes,
      ...m.reportFields,
    ];
    for (const text of fieldsToCheck) {
      if (hasDiagnosisOrTreatmentLanguage(text)) {
        errors.push(`Module ${m.id} contains diagnosis/treatment language in: "${text}"`);
      }
    }
  }

  // 8. Valid phase IDs and positive maxQuestionsFromPhase
  for (const m of ALL_MODULES) {
    for (const phase of m.phases) {
      if (!VALID_PHASE_IDS.has(phase.id)) {
        errors.push(`Module ${m.id} has invalid phase ID: ${phase.id}`);
      }
      if (phase.maxQuestionsFromPhase <= 0) {
        errors.push(
          `Module ${m.id} phase ${phase.id} has invalid maxQuestionsFromPhase: ${phase.maxQuestionsFromPhase}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export {
  skinItchingAllergyModule,
  giVomitingDiarrheaModule,
  limpingMobilityPainModule,
  respiratoryDistressModule,
  seizureCollapseNeuroModule,
  urinaryObstructionModule,
  toxinPoisoningExposureModule,
  bloatGdvModule,
  collapseWeaknessModule,
};
