import type { ComplaintModule } from "./types";

export const limpingMobilityPainModule: ComplaintModule = {
  id: "limping_mobility_pain",
  displayNameForLogs: "Limping / Mobility Pain",
  triggers: [
    "limping",
    "lame",
    "lameness",
    "not walking",
    "won't walk",
    "can't walk",
    "favoring",
    "favoring leg",
    "holding up paw",
    "not bearing weight",
    "stiff",
    "stiffness",
    "difficulty standing",
    "trouble getting up",
    "dragging leg",
    "yelps when touched",
    "yelps when moved",
  ],
  aliases: [
    "leg pain",
    "joint pain",
    "muscle strain",
    "mobility issue",
    "orthopedic concern",
    "gait abnormality",
  ],

  emergencyScreenQuestionIds: [
    "limping_weight_bearing",
    "limping_trauma_onset",
    "collapse_weakness_check",
    "gum_color_check",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "collapse_weakness_check",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "characterize",
      questionIds: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "emergency_global_screen",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "limping_weight_bearing",
        "limping_trauma_onset",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gum_color_check",
        "limping_weight_bearing",
        "limping_trauma_onset",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["limping_weight_bearing"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "limping_non_weight_bearing_or_trauma",
      ifRedFlagPositive: [
        "non_weight_bearing",
        "post_trauma_lameness",
        "collapse",
        "pale_gums",
        "blue_gums",
      ],
      result: "emergency",
    },
    {
      id: "limping_enough_for_report",
      ifEnoughInformation: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "emergency_global_screen",
        "gum_color_check",
      ],
      result: "ready_for_report",
    },
    {
      id: "limping_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "limping_weight_bearing",
    "limping_trauma_onset",
    "emergency_global_screen",
    "gum_color_check",
    "breathing_difficulty_check",
    "collapse_weakness_check",
    "toxin_exposure_check",
    "bloat_retching_abdomen_check",
  ],

  safetyNotes: [
    "Complete non-weight-bearing after trauma suggests fracture or severe soft-tissue injury; escalate immediately to a veterinarian.",
    "Severe swelling or obvious deformity after trauma is an emergency requiring immediate veterinary attention.",
    "Collapse or pale gums during a mobility workup indicates systemic compromise; escalate immediately to a veterinary clinic.",
    "Neurological signs (dragging limbs, loss of proprioception) with back pain may indicate spinal emergency; seek veterinary care.",
    "Severe pain unresponsive to rest requires prompt veterinary evaluation.",
  ],
};
