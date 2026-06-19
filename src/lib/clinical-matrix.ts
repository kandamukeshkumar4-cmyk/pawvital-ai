// =============================================================================
// CLINICAL MATRIX — The hardcoded medical brain
// Maps: Symptoms → Linked Diseases → Required Follow-Up Questions → Breed Multipliers
// This is NOT AI-generated at runtime. It's the deterministic backbone.
//
// Data lives in focused files under src/lib/clinical/:
//   types.ts              — interfaces + DiseaseEntry factory helpers
//   symptom-map.ts        — SYMPTOM_MAP (~1170 entries)
//   disease-db.ts         — DISEASE_DB (~900 entries)
//   breed-modifiers.ts    — BREED_MODIFIERS (~235 entries)
//   follow-up-questions.ts — FOLLOW_UP_QUESTIONS (~1770 entries)
//
// All existing import paths remain unchanged — this file is the public API.
// =============================================================================

export type { SymptomEntry, DiseaseEntry, BreedModifiers, FollowUpQuestion } from "./clinical/types";
export { SYMPTOM_MAP } from "./clinical/symptom-map";
export { DISEASE_DB } from "./clinical/disease-db";
export { BREED_MODIFIERS } from "./clinical/breed-modifiers";
export { FOLLOW_UP_QUESTIONS } from "./clinical/follow-up-questions";
