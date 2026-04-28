import type { ClinicalQuestionCard } from "./question-card-types";

import {
  emergencyGlobalScreen,
  gumColorCheck,
  breathingDifficultyCheck,
  collapseWeaknessCheck,
  toxinExposureCheck,
  bloatRetchingAbdomenCheck,
  urinaryBlockageCheck,
  seizureNeuroCheck,
  skinEmergencyAllergyScreen,
} from "./question-cards/emergency";

import {
  skinLocationDistribution,
  skinChangesCheck,
  skinExposureCheck,
} from "./question-cards/skin";

import {
  giVomitingFrequency,
  giBloodCheck,
  giKeepWaterDownCheck,
} from "./question-cards/gi";

import {
  limpingWeightBearing,
  limpingTraumaOnset,
} from "./question-cards/limping";

import { urinaryStrainingOutput } from "./question-cards/urinary";

import { neuroSeizureDuration } from "./question-cards/neuro";

const SOURCE_CARDS: readonly ClinicalQuestionCard[] = [
  emergencyGlobalScreen,
  gumColorCheck,
  breathingDifficultyCheck,
  collapseWeaknessCheck,
  toxinExposureCheck,
  bloatRetchingAbdomenCheck,
  urinaryBlockageCheck,
  seizureNeuroCheck,
  skinEmergencyAllergyScreen,
  skinLocationDistribution,
  skinChangesCheck,
  skinExposureCheck,
  giVomitingFrequency,
  giBloodCheck,
  giKeepWaterDownCheck,
  limpingWeightBearing,
  limpingTraumaOnset,
  urinaryStrainingOutput,
  neuroSeizureDuration,
];

function cloneQuestionCard(card: ClinicalQuestionCard): ClinicalQuestionCard {
  if (card.answerType === "choice") {
    return {
      ...card,
      complaintFamilies: [...card.complaintFamilies],
      bodySystems: [...card.bodySystems],
      screensRedFlags: [...card.screensRedFlags],
      changesUrgencyIf: { ...card.changesUrgencyIf },
      allowedAnswers: [...card.allowedAnswers] as [string, ...string[]],
      skipIfAnswered: [...card.skipIfAnswered],
      askIfAny: card.askIfAny ? [...card.askIfAny] : undefined,
      askIfAll: card.askIfAll ? [...card.askIfAll] : undefined,
      sourceIds: [...card.sourceIds],
      safetyNotes: card.safetyNotes ? [...card.safetyNotes] : undefined,
    };
  }

  return {
    ...card,
    complaintFamilies: [...card.complaintFamilies],
    bodySystems: [...card.bodySystems],
    screensRedFlags: [...card.screensRedFlags],
    changesUrgencyIf: { ...card.changesUrgencyIf },
    skipIfAnswered: [...card.skipIfAnswered],
    askIfAny: card.askIfAny ? [...card.askIfAny] : undefined,
    askIfAll: card.askIfAll ? [...card.askIfAll] : undefined,
    sourceIds: [...card.sourceIds],
    safetyNotes: card.safetyNotes ? [...card.safetyNotes] : undefined,
  };
}

const ALL_CARDS: readonly ClinicalQuestionCard[] = SOURCE_CARDS.map((card) =>
  cloneQuestionCard(card)
);

function buildRegistry(cards: readonly ClinicalQuestionCard[]): {
  byId: Map<string, ClinicalQuestionCard>;
  ids: string[];
} {
  const byId = new Map<string, ClinicalQuestionCard>();
  const ids: string[] = [];

  for (const card of cards) {
    if (byId.has(card.id)) {
      throw new Error(
        `Duplicate ClinicalQuestionCard id in registry: "${card.id}"`
      );
    }
    byId.set(card.id, card);
    ids.push(card.id);
  }

  return { byId, ids };
}

const REGISTRY = buildRegistry(ALL_CARDS);

const DIAGNOSIS_TREATMENT_CLAIM_PATTERNS: readonly string[] = [
  "diagnose",
  "diagnosis",
  "treat",
  "treatment",
  "cure",
  "cured",
  "medication",
  "prescription",
  "antibiotic",
  "steroid",
  "surgery",
  "operate",
  "procedure",
  "dose",
  "dosage",
];

export function getAllQuestionCards(): readonly ClinicalQuestionCard[] {
  return ALL_CARDS.map((card) => cloneQuestionCard(card));
}

export function getQuestionCardById(
  id: string
): ClinicalQuestionCard | undefined {
  const card = REGISTRY.byId.get(id);
  return card ? cloneQuestionCard(card) : undefined;
}

export function getQuestionCardsByComplaintFamily(
  family: string
): readonly ClinicalQuestionCard[] {
  return ALL_CARDS.filter((card) =>
    card.complaintFamilies.includes(family)
  ).map((card) => cloneQuestionCard(card));
}

export function getQuestionCardsByPhase(
  phase: ClinicalQuestionCard["phase"]
): readonly ClinicalQuestionCard[] {
  return ALL_CARDS
    .filter((card) => card.phase === phase)
    .map((card) => cloneQuestionCard(card));
}

export function validateRegistry(): {
  valid: boolean;
  duplicateIds: string[];
  missingOwnerText: string[];
  missingShortReason: string[];
  missingSkipIfAnswered: string[];
  missingSourceIds: string[];
  choiceCardsMissingAllowedAnswers: string[];
  lowOwnerAnswerabilityWithoutSafetyNote: string[];
  emergencyCardsWithLowUrgency: string[];
  diagnosisTreatmentClaims: string[];
} {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  const missingOwnerText: string[] = [];
  const missingShortReason: string[] = [];
  const missingSkipIfAnswered: string[] = [];
  const missingSourceIds: string[] = [];
  const choiceCardsMissingAllowedAnswers: string[] = [];
  const lowOwnerAnswerabilityWithoutSafetyNote: string[] = [];
  const emergencyCardsWithLowUrgency: string[] = [];
  const diagnosisTreatmentClaims: string[] = [];

  for (const card of ALL_CARDS) {
    if (seenIds.has(card.id)) {
      duplicateIds.push(card.id);
    } else {
      seenIds.add(card.id);
    }

    if (!card.ownerText || card.ownerText.trim().length === 0) {
      missingOwnerText.push(card.id);
    }

    if (!card.shortReason || card.shortReason.trim().length === 0) {
      missingShortReason.push(card.id);
    }

    if (!Array.isArray(card.skipIfAnswered)) {
      missingSkipIfAnswered.push(card.id);
    }

    if (!Array.isArray(card.sourceIds) || card.sourceIds.length === 0) {
      missingSourceIds.push(card.id);
    }

    if (
      card.answerType === "choice" &&
      (!Array.isArray(card.allowedAnswers) || card.allowedAnswers.length === 0)
    ) {
      choiceCardsMissingAllowedAnswers.push(card.id);
    }

    if (card.ownerAnswerability < 2) {
      const hasNote =
        Array.isArray(card.safetyNotes) && card.safetyNotes.length > 0;
      if (!hasNote) {
        lowOwnerAnswerabilityWithoutSafetyNote.push(card.id);
      }
    }

    if (
      card.phase === "emergency_screen" &&
      card.urgencyImpact !== 3
    ) {
      emergencyCardsWithLowUrgency.push(card.id);
    }

    const combinedText = `${card.ownerText} ${card.shortReason}`.toLowerCase();
    for (const pattern of DIAGNOSIS_TREATMENT_CLAIM_PATTERNS) {
      if (combinedText.includes(pattern.toLowerCase())) {
        diagnosisTreatmentClaims.push(card.id);
        break;
      }
    }
  }

  const valid =
    duplicateIds.length === 0 &&
    missingOwnerText.length === 0 &&
    missingShortReason.length === 0 &&
    missingSkipIfAnswered.length === 0 &&
    missingSourceIds.length === 0 &&
    choiceCardsMissingAllowedAnswers.length === 0 &&
    lowOwnerAnswerabilityWithoutSafetyNote.length === 0 &&
    emergencyCardsWithLowUrgency.length === 0 &&
    diagnosisTreatmentClaims.length === 0;

  return {
    valid,
    duplicateIds,
    missingOwnerText,
    missingShortReason,
    missingSkipIfAnswered,
    missingSourceIds,
    choiceCardsMissingAllowedAnswers,
    lowOwnerAnswerabilityWithoutSafetyNote,
    emergencyCardsWithLowUrgency,
    diagnosisTreatmentClaims,
  };
}
