/**
 * VET-1503 — Complaint-to-modality router.
 *
 * Deterministically decides whether media (image, audio, or temporal sequence)
 * would materially improve triage quality for a given complaint + session state.
 *
 * Rules:
 *   - Media is NEVER requested on every case — only when it adds clinical value.
 *   - Decision is fully deterministic; no LLM inference here.
 *   - Media inference is additive only; urgency determined by triage engine.
 *   - Emergency-level cases skip media requests (urgency is already maximal).
 *   - Returns null when no media is clinically useful.
 */

import type { TriageSession } from "@/lib/triage-engine";
import type { SupportedImageDomain } from "@/lib/clinical-evidence";
import type {
  SupportedAudioDomain,
  SupportedTemporalDomain,
} from "@/lib/media-intake";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type MediaSuggestionReason =
  | "symptom_key_match"
  | "complaint_keyword_match"
  | "combined_symptom_and_keyword";

export interface ImageSuggestion {
  mediaType: "image";
  domain: SupportedImageDomain;
  reason: MediaSuggestionReason;
  ownerPrompt: string;
}

export interface AudioSuggestion {
  mediaType: "audio";
  domain: SupportedAudioDomain;
  reason: MediaSuggestionReason;
  ownerPrompt: string;
  durationGuidance: string;
}

export interface TemporalSuggestion {
  mediaType: "temporal";
  domain: SupportedTemporalDomain;
  reason: MediaSuggestionReason;
  ownerPrompt: string;
  frameGuidance: string;
}

export type MediaSuggestion = ImageSuggestion | AudioSuggestion | TemporalSuggestion;

// ---------------------------------------------------------------------------
// Symptom keys that benefit from each modality
// Sourced from SYMPTOM_MAP keys in triage-engine.ts + clinical-matrix definitions
// ---------------------------------------------------------------------------

const IMAGE_SYMPTOM_KEYS: Record<SupportedImageDomain, string[]> = {
  skin_wound: [
    "wound_skin_issue",
    "skin_rash",
    "hot_spot",
    "lesion",
    "hair_loss",
    "scab",
    "abscess",
  ],
  mass_swelling: [
    "lump_bump",
    "mass",
    "swelling",
    "cyst",
    "nodule",
    "growth",
  ],
  eye: [
    "eye_discharge",
    "eye_redness",
    "eye_squinting",
    "eye_cloudiness",
    "ocular_issue",
  ],
  ear: [
    "ear_scratching",
    "ear_infection",
    "ear_swelling",
    "ear_discharge",
    "head_shaking",
  ],
  oral_gum: [
    "gum_color_change",
    "oral_lesion",
    "dental_concern",
    "pale_gums",
    "bad_breath",
    "drooling_excessive",
    "mouth_pain",
  ],
  abdominal_distension: [
    "swollen_abdomen",
    "bloat",
    "abdominal_distension",
    "distended_abdomen_with_retching",
  ],
  stool_vomit: [
    "vomiting",
    "diarrhea",
    "vomiting_diarrhea_combined",
    "bloody_stool",
    "stool_concern",
  ],
  unsupported: [],
};

const AUDIO_SYMPTOM_KEYS: Record<SupportedAudioDomain, string[]> = {
  respiratory_cough: ["coughing", "coughing_breathing_combined", "persistent_cough"],
  respiratory_wheeze: ["wheezing", "coughing_breathing_combined", "difficulty_breathing"],
  respiratory_stridor: ["stridor", "difficulty_breathing", "noisy_breathing"],
  respiratory_labored: [
    "difficulty_breathing",
    "coughing_breathing_combined",
    "labored_breathing",
    "breathing_fast",
  ],
  unsupported: [],
};

const TEMPORAL_SYMPTOM_KEYS: Record<SupportedTemporalDomain, string[]> = {
  gait_lameness: ["limping", "lameness", "gait_abnormality", "leg_weakness"],
  wound_progression: ["wound_skin_issue", "swelling", "abscess"],
  swelling_progression: ["swelling", "mass", "lump_bump"],
  unsupported: [],
};

// ---------------------------------------------------------------------------
// Complaint keywords that signal each modality (when no symptom key matches yet)
// ---------------------------------------------------------------------------

const IMAGE_KEYWORDS: Record<SupportedImageDomain, string[]> = {
  skin_wound: [
    "wound",
    "cut",
    "laceration",
    "rash",
    "skin",
    "hot spot",
    "hotspot",
    "lesion",
    "sore",
    "scab",
    "blister",
    "bleeding",
    "abscess",
    "hair loss",
    "bald spot",
    "crusty",
    "pus",
  ],
  mass_swelling: [
    "lump",
    "bump",
    "mass",
    "swelling",
    "growth",
    "cyst",
    "nodule",
    "tumor",
    "bulge",
    "raised area",
    "knot under skin",
  ],
  eye: [
    "eye",
    "eyes",
    "goopy",
    "discharge from eye",
    "red eye",
    "squinting",
    "cloudy eye",
    "eyelid",
    "tear",
    "watery eye",
  ],
  ear: [
    "ear",
    "ears",
    "ear flap",
    "ear canal",
    "smelly ear",
    "ear discharge",
    "shaking head",
    "head shaking",
    "scratching ear",
    "scratching his ear",
    "scratching her ear",
  ],
  oral_gum: [
    "gum",
    "gums",
    "pale gums",
    "yellow gums",
    "blue gums",
    "mouth",
    "teeth",
    "dental",
    "bad breath",
    "drooling",
    "oral",
    "tooth",
    "jaw",
    "tongue",
  ],
  abdominal_distension: [
    "bloated",
    "bloat",
    "distended",
    "swollen belly",
    "enlarged abdomen",
    "belly is swollen",
  ],
  stool_vomit: [
    "vomit",
    "vomiting",
    "threw up",
    "throw up",
    "stool",
    "poop",
    "diarrhea",
    "diarrhoea",
    "blood in stool",
    "bloody diarrhea",
  ],
  unsupported: [],
};

const AUDIO_KEYWORDS: Record<SupportedAudioDomain, string[]> = {
  respiratory_cough: ["cough", "coughing", "hacking", "gagging cough", "kennel cough"],
  respiratory_wheeze: ["wheeze", "wheezing", "whistling sound", "rattling breath"],
  respiratory_stridor: ["stridor", "high pitched breathing", "noisy breathing", "snorting"],
  respiratory_labored: [
    "breathing hard",
    "labored breathing",
    "struggling to breathe",
    "breathing fast",
    "rapid breathing",
    "short of breath",
    "panting heavily",
    "can't catch breath",
  ],
  unsupported: [],
};

const TEMPORAL_KEYWORDS: Record<SupportedTemporalDomain, string[]> = {
  gait_lameness: [
    "limp",
    "limping",
    "lameness",
    "can't walk",
    "trouble walking",
    "favoring",
    "not putting weight",
    "dragging leg",
    "stiff gait",
    "hobbling",
  ],
  wound_progression: [
    "wound is getting worse",
    "healing slowly",
    "spreading",
    "wound progression",
    "not healing",
  ],
  swelling_progression: [
    "swelling getting bigger",
    "swelling is spreading",
    "lump growing",
    "bump getting larger",
  ],
  unsupported: [],
};

// ---------------------------------------------------------------------------
// Owner-facing prompts
// ---------------------------------------------------------------------------

const IMAGE_PROMPTS: Record<SupportedImageDomain, string> = {
  skin_wound:
    "A clear close-up photo of the affected skin or wound would help us assess severity. Try to fill the frame with the area, in good lighting.",
  mass_swelling:
    "A clear photo of the lump or swollen area would help us assess its size and appearance. Include something for scale (like a coin) if possible, in good lighting.",
  eye: "A clear photo of your dog's eye area would help. Good lighting and minimal blur are important — a flashlight can help illuminate.",
  ear: "A photo showing the outer ear flap or ear canal opening would be useful. Keep your dog still and use good lighting.",
  abdominal_distension:
    "A photo of your dog's belly from the side, showing the full flank, would help us assess the degree of distension. Have your dog stand if possible. This is an urgent concern — if your dog is also retching or very uncomfortable, go to an emergency vet immediately.",
  oral_gum:
    "A clear photo inside your dog's mouth — particularly the gums and teeth — would help us assess gum color and any lesions. Use a flashlight and ask someone to hold the lip up gently.",
  stool_vomit:
    "A photo of the vomit or stool may help us identify blood, color changes, or foreign material. No need to handle it — just photograph it in place.",
  unsupported: "",
};

const AUDIO_PROMPTS: Record<SupportedAudioDomain, string> = {
  respiratory_cough:
    "A short audio recording of your dog coughing would help us characterize the sound. Record in a quiet room for 10–15 seconds.",
  respiratory_wheeze:
    "A brief audio clip capturing the wheezing or rattling sound during breathing would help. Try recording while your dog is calm and at rest.",
  respiratory_stridor:
    "A short clip of the noisy breathing sound would help. Record in a quiet environment for 10–15 seconds.",
  respiratory_labored:
    "An audio clip of your dog's current breathing pattern would be valuable. Record for 10–15 seconds in a quiet room, ideally while your dog is resting.",
  unsupported: "",
};

const TEMPORAL_PROMPTS: Record<SupportedTemporalDomain, string> = {
  gait_lameness:
    "Two to four short videos or photos of your dog walking — one from each side — would help us assess the gait and which leg is affected.",
  wound_progression:
    "Two or three photos of the wound taken over different days would help us assess whether it is improving, stable, or worsening.",
  swelling_progression:
    "A few photos of the swelling taken on consecutive days, from the same angle, would help us track progression.",
  unsupported: "",
};

const AUDIO_DURATION_GUIDANCE: Record<SupportedAudioDomain, string> = {
  respiratory_cough: "10–15 seconds capturing at least 2–3 cough episodes",
  respiratory_wheeze: "10–20 seconds of breathing at rest",
  respiratory_stridor: "10–20 seconds during an episode",
  respiratory_labored: "15–30 seconds while your dog is resting",
  unsupported: "",
};

const TEMPORAL_FRAME_GUIDANCE: Record<SupportedTemporalDomain, string> = {
  gait_lameness: "2–4 photos: one from each side, taken while walking on a flat surface",
  wound_progression: "2–4 photos from the same angle and distance, taken 24–48 hours apart",
  swelling_progression: "2–3 photos from the same angle, taken on consecutive days",
  unsupported: "",
};

// ---------------------------------------------------------------------------
// Emergency guard: skip media on acute life-threatening presentations
// Media adds nothing when urgency is already maximum.
// ---------------------------------------------------------------------------

const EMERGENCY_SYMPTOM_KEYS = new Set([
  "collapse",
  "unconscious",
  "seizure",
  "not_breathing",
  "difficulty_breathing_severe",
  "profuse_bleeding",
  "suspected_toxin_ingestion",
  "hit_by_car",
  "extreme_pain",
  "cannot_stand",
  "pale_gums",
  "blue_gums",
  "brick_red_gums",
  "distended_abdomen_with_retching",
]);

function isEmergencyPresentation(session: TriageSession): boolean {
  return session.known_symptoms.some((s) => EMERGENCY_SYMPTOM_KEYS.has(s));
}

// ---------------------------------------------------------------------------
// Core router
// ---------------------------------------------------------------------------

/**
 * Suggests the single most clinically useful media type for the current case,
 * or returns null if no media would improve triage quality.
 *
 * Priority order: image > audio > temporal.
 * (Image is lowest latency and highest current sidecar coverage.)
 */
export function suggestMedia(
  complaintText: string,
  session: TriageSession
): MediaSuggestion | null {
  // Never request media during acute emergencies
  if (isEmergencyPresentation(session)) return null;

  const lower = complaintText.toLowerCase();

  // -- Image --
  const imageSuggestion = suggestImageDomain(lower, session);
  if (imageSuggestion) return imageSuggestion;

  // -- Audio --
  const audioSuggestion = suggestAudioDomain(lower, session);
  if (audioSuggestion) return audioSuggestion;

  // -- Temporal --
  const temporalSuggestion = suggestTemporalDomain(lower, session);
  if (temporalSuggestion) return temporalSuggestion;

  return null;
}

function suggestImageDomain(
  lower: string,
  session: TriageSession
): ImageSuggestion | null {
  const domainPriority: SupportedImageDomain[] = [
    "skin_wound",
    "mass_swelling",
    "abdominal_distension",
    "eye",
    "ear",
    "oral_gum",
    "stool_vomit",
  ];

  for (const domain of domainPriority) {
    const symptomMatch = IMAGE_SYMPTOM_KEYS[domain].some((k) =>
      session.known_symptoms.includes(k)
    );
    const keywordMatch = IMAGE_KEYWORDS[domain].some((kw) => lower.includes(kw));

    if (symptomMatch || keywordMatch) {
      return {
        mediaType: "image",
        domain,
        reason: symptomMatch && keywordMatch
          ? "combined_symptom_and_keyword"
          : symptomMatch
          ? "symptom_key_match"
          : "complaint_keyword_match",
        ownerPrompt: IMAGE_PROMPTS[domain],
      };
    }
  }

  return null;
}

function suggestAudioDomain(
  lower: string,
  session: TriageSession
): AudioSuggestion | null {
  const domainPriority: SupportedAudioDomain[] = [
    "respiratory_labored",
    "respiratory_cough",
    "respiratory_wheeze",
    "respiratory_stridor",
  ];

  for (const domain of domainPriority) {
    const symptomMatch = AUDIO_SYMPTOM_KEYS[domain].some((k) =>
      session.known_symptoms.includes(k)
    );
    const keywordMatch = AUDIO_KEYWORDS[domain].some((kw) => lower.includes(kw));

    if (symptomMatch || keywordMatch) {
      return {
        mediaType: "audio",
        domain,
        reason: symptomMatch && keywordMatch
          ? "combined_symptom_and_keyword"
          : symptomMatch
          ? "symptom_key_match"
          : "complaint_keyword_match",
        ownerPrompt: AUDIO_PROMPTS[domain],
        durationGuidance: AUDIO_DURATION_GUIDANCE[domain],
      };
    }
  }

  return null;
}

function suggestTemporalDomain(
  lower: string,
  session: TriageSession
): TemporalSuggestion | null {
  const domainPriority: SupportedTemporalDomain[] = [
    "gait_lameness",
    "wound_progression",
    "swelling_progression",
  ];

  for (const domain of domainPriority) {
    const symptomMatch = TEMPORAL_SYMPTOM_KEYS[domain].some((k) =>
      session.known_symptoms.includes(k)
    );
    const keywordMatch = TEMPORAL_KEYWORDS[domain].some((kw) => lower.includes(kw));

    if (symptomMatch || keywordMatch) {
      return {
        mediaType: "temporal",
        domain,
        reason: symptomMatch && keywordMatch
          ? "combined_symptom_and_keyword"
          : symptomMatch
          ? "symptom_key_match"
          : "complaint_keyword_match",
        ownerPrompt: TEMPORAL_PROMPTS[domain],
        frameGuidance: TEMPORAL_FRAME_GUIDANCE[domain],
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public utility: check if the session already has usable image evidence
// (avoids requesting a second image when one has already been processed)
// ---------------------------------------------------------------------------

export function hasUsableImageEvidence(session: TriageSession): boolean {
  return (
    session.latest_image_domain != null &&
    session.latest_image_domain !== "unsupported" &&
    session.latest_image_quality != null &&
    session.latest_image_quality !== "poor"
  );
}
