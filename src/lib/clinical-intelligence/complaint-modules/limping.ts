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
        "limping_limb_location",
        "limping_pain_severity",
        "limping_swelling",
        "limping_warmth",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "limping_range_of_motion",
        "limping_neurological_signs",
        "limping_fever_check",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "limping_onset",
        "limping_progression",
        "limping_activity_at_onset",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "limping_prior_injury",
        "limping_activity_level",
        "limping_medications",
        "limping_chronic_conditions",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["limping_summary"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "limping_non_weight_bearing_or_trauma",
      ifRedFlagPositive: [
        "non_weight_bearing",
        "severe_trauma",
        "open_fracture",
        "collapse",
        "pale_gums",
        "blue_gums",
      ],
      result: "emergency",
    },
    {
      id: "limping_severe_pain",
      ifAnySignalPresent: [
        "severe_pain_unresponsive",
        "yelps_on_movement",
        "dragging_limbs",
      ],
      result: "emergency",
    },
    {
      id: "limping_fracture_suspicion",
      ifRedFlagPositive: ["obvious_fracture", "bone_visible", "severe_swelling"],
      result: "emergency",
    },
    {
      id: "limping_enough_for_report",
      ifEnoughInformation: [
        "limping_weight_bearing",
        "limping_limb_location",
        "limping_onset",
        "limping_pain_severity",
      ],
      result: "ready_for_report",
    },
    {
      id: "limping_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "limping_weight_bearing_status",
    "limping_limb_location",
    "limping_pain_severity",
    "limping_swelling",
    "limping_warmth",
    "limping_onset",
    "limping_trauma_history",
    "limping_prior_injury",
    "limping_activity_level",
    "limping_neurological_signs",
  ],

  safetyNotes: [
    "Complete non-weight-bearing after trauma suggests fracture or severe soft-tissue injury; escalate immediately to a veterinarian.",
    "Open fracture or bone visibility is an emergency requiring immediate veterinary attention.",
    "Collapse or pale gums during a mobility workup indicates systemic compromise; escalate immediately to a veterinary clinic.",
    "Neurological signs (dragging limbs, loss of proprioception) with back pain may indicate spinal emergency; seek veterinary care.",
    "Severe pain unresponsive to rest requires prompt veterinary evaluation.",
  ],
};
