import fs from "node:fs";
import path from "node:path";

import {
  getAllQuestionCards,
  getQuestionCardById,
} from "@/lib/clinical-intelligence/question-card-registry";
import {
  EMERGENCY_RED_FLAG_IDS,
  isEmergencyRedFlagId,
} from "@/lib/clinical-intelligence/emergency-red-flags";

type CandidateProposal = {
  candidateId: string;
  proposedCardIds: string[];
  readyAfterPack: boolean;
  requiredNewRedFlags: string[];
  requiredNewSignals: string[];
  existingRedFlags: string[];
  existingSignals: string[];
};

const PROPOSAL_DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "question-card-gap-proposal-pack-kimi.md"
);
const PROPOSAL_DOC = fs.readFileSync(PROPOSAL_DOC_PATH, "utf8");

const KNOWN_SIGNAL_IDS = [
  "possible_abdominal_pain",
  "possible_nonproductive_retching",
  "possible_pale_gums",
  "possible_blue_gums",
  "possible_breathing_difficulty",
  "possible_collapse_or_weakness",
  "possible_urinary_obstruction",
  "toxin_exposure",
  "possible_heat_stroke",
  "possible_neuro_emergency",
  "possible_trauma",
  "possible_bloat_gdv",
  "possible_bloody_vomit",
  "possible_bloody_diarrhea",
] as const;

const CANDIDATE_PROPOSALS: readonly CandidateProposal[] = [
  {
    candidateId: "eye_vision_discharge",
    proposedCardIds: [
      "eye_discharge_check",
      "eye_swelling_check",
      "vision_change_check",
      "eye_injury_check",
    ],
    readyAfterPack: false,
    requiredNewRedFlags: [
      "severe_eye_discharge",
      "eye_protrusion",
      "eye_injury",
      "sudden_blindness",
    ],
    requiredNewSignals: [
      "possible_eye_emergency",
      "possible_vision_loss",
    ],
    existingRedFlags: [],
    existingSignals: [],
  },
  {
    candidateId: "ear_head_tilt_balance",
    proposedCardIds: [
      "ear_pain_check",
      "ear_discharge_check",
      "head_tilt_check",
      "balance_loss_check",
    ],
    readyAfterPack: false,
    requiredNewRedFlags: ["ear_infection_severe", "vestibular_event"],
    requiredNewSignals: [
      "possible_ear_emergency",
      "possible_vestibular_attack",
    ],
    existingRedFlags: [],
    existingSignals: [
      "possible_neuro_emergency",
      "possible_collapse_or_weakness",
    ],
  },
  {
    candidateId: "appetite_weight_loss_drinking",
    proposedCardIds: [
      "appetite_change_check",
      "weight_loss_check",
      "polydipsia_check",
    ],
    readyAfterPack: false,
    requiredNewRedFlags: [
      "anorexia_prolonged",
      "rapid_weight_loss",
      "polyuria_polydipsia",
    ],
    requiredNewSignals: ["possible_systemic_illness"],
    existingRedFlags: [],
    existingSignals: [],
  },
  {
    candidateId: "post_vaccination_reaction",
    proposedCardIds: [
      "vaccine_recent_check",
      "injection_site_swelling_check",
      "fever_lethargy_post_vax_check",
    ],
    readyAfterPack: false,
    requiredNewRedFlags: [
      "post_vaccine_anaphylaxis",
      "injection_site_abscess",
    ],
    requiredNewSignals: ["possible_post_vaccine_reaction"],
    existingRedFlags: [
      "face_swelling",
      "hives_widespread",
      "allergic_with_breathing",
      "collapse",
      "breathing_difficulty",
    ],
    existingSignals: [],
  },
  {
    candidateId: "abdominal_pain_standalone",
    proposedCardIds: [
      "abdominal_pain_check",
      "posture_guarding_check",
      "belly_touch_response_check",
    ],
    readyAfterPack: false,
    requiredNewRedFlags: ["severe_abdominal_pain", "rigid_abdomen"],
    requiredNewSignals: [],
    existingRedFlags: [
      "distended_abdomen_painful",
      "unproductive_retching",
      "rapid_onset_distension",
    ],
    existingSignals: ["possible_abdominal_pain"],
  },
  {
    candidateId: "wound_skin_overlap",
    proposedCardIds: [
      "wound_characterization_check",
      "bleeding_volume_check",
      "laceration_depth_check",
    ],
    readyAfterPack: true,
    requiredNewRedFlags: [],
    requiredNewSignals: [],
    existingRedFlags: ["large_blood_volume", "wound_deep_bleeding"],
    existingSignals: ["possible_trauma"],
  },
  {
    candidateId: "heatstroke_heat_exposure",
    proposedCardIds: [
      "heat_exposure_check",
      "brachycephalic_breed_check",
      "panting_excess_check",
    ],
    readyAfterPack: true,
    requiredNewRedFlags: [],
    requiredNewSignals: [],
    existingRedFlags: [
      "heatstroke_signs",
      "brachycephalic_heat",
      "collapse",
      "breathing_difficulty",
      "pale_gums",
      "blue_gums",
    ],
    existingSignals: [
      "possible_heat_stroke",
      "possible_collapse_or_weakness",
      "possible_breathing_difficulty",
    ],
  },
  {
    candidateId: "trauma_bleeding_wound",
    proposedCardIds: [
      "trauma_mechanism_check",
      "wound_characterization_check",
      "bleeding_volume_check",
    ],
    readyAfterPack: true,
    requiredNewRedFlags: [],
    requiredNewSignals: [],
    existingRedFlags: [
      "large_blood_volume",
      "wound_deep_bleeding",
      "collapse",
      "unresponsive",
      "pale_gums",
      "blue_gums",
      "breathing_difficulty",
    ],
    existingSignals: [
      "possible_trauma",
      "possible_collapse_or_weakness",
      "possible_pale_gums",
      "possible_blue_gums",
      "possible_breathing_difficulty",
    ],
  },
];

describe("Question Card Gap Proposal Pack (VET-1429K packaging)", () => {
  it("locks the current live registry counts in the proposal doc", () => {
    expect(getAllQuestionCards()).toHaveLength(19);
    expect(EMERGENCY_RED_FLAG_IDS).toHaveLength(35);
    expect(KNOWN_SIGNAL_IDS).toHaveLength(14);

    expect(PROPOSAL_DOC).toContain(
      "19 question cards, 35 canonical red flags, 14 clinical signals."
    );
    expect(PROPOSAL_DOC).not.toContain("37 canonical red flags");
  });

  it("keeps the candidate surface and ready-after-pack set stable", () => {
    expect(CANDIDATE_PROPOSALS).toHaveLength(8);
    expect(
      CANDIDATE_PROPOSALS.filter((candidate) => candidate.readyAfterPack).map(
        (candidate) => candidate.candidateId
      )
    ).toEqual([
      "wound_skin_overlap",
      "heatstroke_heat_exposure",
      "trauma_bleeding_wound",
    ]);
  });

  it("keeps the proposed question-card inventory deduplicated at 24 ids", () => {
    const flattenedIds = CANDIDATE_PROPOSALS.flatMap(
      (candidate) => candidate.proposedCardIds
    );
    const uniqueIds = Array.from(new Set(flattenedIds));
    const duplicateIds = flattenedIds.filter(
      (id, index) => flattenedIds.indexOf(id) !== index
    );

    expect(uniqueIds).toHaveLength(24);
    expect(Array.from(new Set(duplicateIds)).sort()).toEqual([
      "bleeding_volume_check",
      "wound_characterization_check",
    ]);
  });

  it("does not register any proposed question cards yet", () => {
    const proposedIds = Array.from(
      new Set(
        CANDIDATE_PROPOSALS.flatMap((candidate) => candidate.proposedCardIds)
      )
    );

    for (const proposedId of proposedIds) {
      expect(getQuestionCardById(proposedId)).toBeUndefined();
    }
  });

  it("keeps blocked candidates dependent on missing red flags or signals", () => {
    const blockedCandidates = CANDIDATE_PROPOSALS.filter(
      (candidate) => !candidate.readyAfterPack
    );

    for (const candidate of blockedCandidates) {
      for (const redFlagId of candidate.requiredNewRedFlags) {
        expect(isEmergencyRedFlagId(redFlagId)).toBe(false);
      }

      for (const signalId of candidate.requiredNewSignals) {
        expect(KNOWN_SIGNAL_IDS).not.toContain(signalId);
      }
    }
  });

  it("keeps ready-after-pack candidates backed by live red flags and signals", () => {
    const readyCandidates = CANDIDATE_PROPOSALS.filter(
      (candidate) => candidate.readyAfterPack
    );

    for (const candidate of readyCandidates) {
      expect(candidate.requiredNewRedFlags).toEqual([]);
      expect(candidate.requiredNewSignals).toEqual([]);

      for (const redFlagId of candidate.existingRedFlags) {
        expect(isEmergencyRedFlagId(redFlagId)).toBe(true);
      }

      for (const signalId of candidate.existingSignals) {
        expect(KNOWN_SIGNAL_IDS).toContain(signalId);
      }
    }
  });

  it("documents wound or skin overlap as question-card-only blocked today", () => {
    const woundSectionMatch = PROPOSAL_DOC.match(
      /### 3\.6 Wound \/ Skin Overlap \(Trauma Prep\)([\s\S]*?)### 3\.7 Heatstroke \/ Heat Exposure/
    );

    expect(woundSectionMatch).toBeTruthy();

    const woundSection = woundSectionMatch?.[1] ?? "";
    expect(woundSection).toContain(
      "**Current blocker:** `blocked_missing_question_cards` only"
    );
    expect(woundSection).not.toContain("blocked_missing_red_flags");
    expect(woundSection).not.toContain("blocked_missing_signals");
    expect(PROPOSAL_DOC).toContain(
      "| 6 | wound / skin overlap (trauma prep) | 3 | **ready** (existing red flags + signal) | Medium |"
    );
  });
});
