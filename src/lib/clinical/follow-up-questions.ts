import type { FollowUpQuestion } from "./types";
// --- FOLLOW-UP QUESTION DEFINITIONS ---

export const FOLLOW_UP_QUESTIONS: Record<string, FollowUpQuestion> = {
  // Generic open-ended context capture. Asked once, after the structured
  // follow-ups for the known symptoms are exhausted, so an owner who still has
  // more to share is invited to add it instead of being cut off with an abrupt
  // "I have enough information". Deliberately NOT linked to any disease or
  // urgency mapping — it only widens the history before the report.
  additional_context: {
    id: "additional_context",
    question_text:
      "Before I put the report together — is there anything else you've noticed about your pet? Even small changes in appetite, energy, mood, drinking, or bathroom habits can matter, even if they seem unrelated.",
    data_type: "string",
    extraction_hint:
      "any additional symptoms, changes, or context the owner volunteers",
    critical: false,
  },
  // Limping questions
  which_leg: {
    id: "which_leg",
    question_text: "Which leg is affected? Front or back? Left or right?",
    data_type: "string",
    extraction_hint: "leg affected: front/back, left/right",
    critical: true,
  },
  limping_onset: {
    id: "limping_onset",
    question_text:
      "When did the limping start? Was it sudden or gradual?",
    data_type: "string",
    extraction_hint: "onset: sudden/gradual, timeframe",
    critical: true,
  },
  limping_progression: {
    id: "limping_progression",
    question_text:
      "Is the limping getting better, worse, or staying the same since it started?",
    data_type: "choice",
    choices: ["better", "worse", "same", "unknown"],
    extraction_hint: "progression: better/worse/same",
    critical: true,
  },
  weight_bearing: {
    id: "weight_bearing",
    question_text:
      "Is your dog putting weight on the affected leg, or completely avoiding it?",
    data_type: "choice",
    choices: ["weight_bearing", "partial", "non_weight_bearing", "unknown"],
    extraction_hint: "weight bearing status on affected leg",
    critical: true,
  },
  pain_on_touch: {
    id: "pain_on_touch",
    question_text:
      "Does your dog react (yelp, pull away, growl) when you touch the affected area?",
    data_type: "boolean",
    extraction_hint: "pain response when area is touched",
    critical: false,
  },
  trauma_history: {
    id: "trauma_history",
    question_text:
      "Was there any specific incident? A fall, jump, rough play, or getting hit?",
    data_type: "choice",
    choices: ["yes_trauma", "no_trauma", "unknown"],
    extraction_hint: "trauma incident: yes_trauma, no_trauma, or unknown",
    critical: true,
  },
  worse_after_rest: {
    id: "worse_after_rest",
    question_text:
      "Is the limping worse when your dog first gets up from resting?",
    data_type: "boolean",
    extraction_hint: "stiffness after rest that improves with movement",
    critical: false,
  },
  swelling_present: {
    id: "swelling_present",
    question_text: "Is there any visible swelling around the affected area?",
    data_type: "boolean",
    extraction_hint: "visible swelling or enlargement",
    critical: false,
  },
  warmth_present: {
    id: "warmth_present",
    question_text:
      "Does the area feel warm or hot compared to the same area on the other side?",
    data_type: "boolean",
    extraction_hint: "warmth or heat at the affected site",
    critical: false,
  },
  prior_limping: {
    id: "prior_limping",
    question_text:
      "Has your dog had any previous episodes of limping or stiffness?",
    data_type: "boolean",
    extraction_hint: "history of prior lameness or stiffness episodes",
    critical: false,
  },
  trauma_mechanism: {
    id: "trauma_mechanism",
    question_text:
      "What kind of incident happened? A fall, hit by car, bite, rough play, or something else?",
    data_type: "choice",
    choices: [
      "fall_jump",
      "hit_by_car",
      "bite_attack",
      "rough_play",
      "unknown",
      "other",
    ],
    extraction_hint: "type of traumatic event",
    critical: true,
  },
  trauma_timeframe: {
    id: "trauma_timeframe",
    question_text: "When did the injury happen? Just now, today, or earlier?",
    data_type: "string",
    extraction_hint: "time since trauma or injury occurred",
    critical: true,
  },
  trauma_area: {
    id: "trauma_area",
    question_text:
      "Where is your dog injured? Chest, belly, leg, head, back, or skin?",
    data_type: "string",
    extraction_hint: "body area involved in trauma",
    critical: true,
  },
  active_bleeding_trauma: {
    id: "active_bleeding_trauma",
    question_text:
      "Is there active bleeding that is soaking through towels or not slowing down with pressure?",
    data_type: "boolean",
    extraction_hint: "ongoing significant bleeding after trauma",
    critical: true,
  },
  visible_fracture: {
    id: "visible_fracture",
    question_text:
      "Do you see a bone sticking out or a limb that looks obviously broken or deformed?",
    data_type: "boolean",
    extraction_hint: "obvious fracture or exposed bone",
    critical: true,
  },
  trauma_mobility: {
    id: "trauma_mobility",
    question_text:
      "Can your dog stand and walk, or are they unable to get up?",
    data_type: "choice",
    choices: ["walking", "limping", "inability_to_stand", "unknown"],
    extraction_hint: "mobility after trauma",
    critical: true,
  },

  // Vomiting questions
  vomit_duration: {
    id: "vomit_duration",
    question_text: "How long has the vomiting been going on?",
    data_type: "string",
    extraction_hint: "duration of vomiting in hours or days",
    critical: true,
  },
  vomit_frequency: {
    id: "vomit_frequency",
    question_text: "How many times has your dog vomited?",
    data_type: "string",
    extraction_hint: "number of vomiting episodes",
    critical: true,
  },
  vomit_blood: {
    id: "vomit_blood",
    question_text:
      "Is there any blood in the vomit? It can look red or like coffee grounds.",
    data_type: "boolean",
    extraction_hint: "blood or coffee-ground material in vomit",
    critical: true,
  },
  vomit_content: {
    id: "vomit_content",
    question_text: "What does the vomit look like? Food, bile (yellow), foam, or something else?",
    data_type: "string",
    extraction_hint: "vomit content: food/bile/foam/other",
    critical: false,
  },
  toxin_exposure: {
    id: "toxin_exposure",
    question_text:
      "Could your dog have eaten anything unusual — trash, human food, plants, medications, or chemicals?",
    data_type: "string",
    extraction_hint: "possible toxin or foreign substance exposure",
    critical: true,
  },
  dietary_change: {
    id: "dietary_change",
    question_text: "Any recent food changes, new treats, or table scraps?",
    data_type: "string",
    extraction_hint: "recent diet changes or unusual food",
    critical: false,
  },

  // General questions
  appetite_status: {
    id: "appetite_status",
    question_text: "How is your dog's appetite? Eating normally, less, or not at all?",
    data_type: "choice",
    choices: ["normal", "decreased", "none", "unknown"],
    extraction_hint: "appetite status: normal/decreased/absent",
    critical: false,
  },
  appetite_duration: {
    id: "appetite_duration",
    question_text: "How long has the appetite been reduced?",
    data_type: "string",
    extraction_hint: "duration of appetite loss",
    critical: true,
  },
  water_intake: {
    id: "water_intake",
    question_text: "Is your dog drinking water normally?",
    data_type: "choice",
    choices: ["normal", "more_than_usual", "less_than_usual", "not_drinking", "unknown"],
    extraction_hint: "water intake status",
    critical: true,
  },
  lethargy_duration: {
    id: "lethargy_duration",
    question_text: "How long has your dog been lethargic?",
    data_type: "string",
    extraction_hint: "duration of lethargy",
    critical: true,
  },
  lethargy_severity: {
    id: "lethargy_severity",
    question_text:
      "Is your dog slightly less active, or barely moving at all?",
    data_type: "choice",
    choices: ["mild", "moderate", "severe"],
    extraction_hint: "severity of lethargy: mild/moderate/severe",
    critical: true,
  },

  // Stool questions
  stool_blood: {
    id: "stool_blood",
    question_text:
      "Is there blood in the stool? Is it bright red or dark/tarry?",
    data_type: "string",
    extraction_hint: "blood in stool: red/dark/none",
    critical: true,
  },
  stool_frequency: {
    id: "stool_frequency",
    question_text: "How many bowel movements per day?",
    data_type: "string",
    extraction_hint: "frequency of bowel movements",
    critical: false,
  },
  stool_consistency: {
    id: "stool_consistency",
    question_text: "What's the stool consistency? Formed, soft, watery?",
    data_type: "choice",
    choices: ["formed", "soft", "watery", "mucus", "unknown"],
    extraction_hint: "stool consistency",
    critical: false,
  },
  diarrhea_duration: {
    id: "diarrhea_duration",
    question_text: "How long has the diarrhea been going on?",
    data_type: "string",
    extraction_hint: "duration of diarrhea",
    critical: true,
  },

  // Respiratory questions
  cough_type: {
    id: "cough_type",
    question_text:
      "What does the cough sound like? Dry/honking, wet/productive, or gagging?",
    data_type: "choice",
    choices: ["dry_honking", "wet_productive", "gagging"],
    extraction_hint: "cough type",
    critical: true,
  },
  cough_duration: {
    id: "cough_duration",
    question_text: "How long has the coughing been going on?",
    data_type: "string",
    extraction_hint: "duration of cough",
    critical: true,
  },
  cough_timing: {
    id: "cough_timing",
    question_text: "When does the coughing happen? At rest, after exercise, at night?",
    data_type: "string",
    extraction_hint: "timing pattern of cough",
    critical: false,
  },
  breathing_rate: {
    id: "breathing_rate",
    question_text:
      "Can you count your dog's breaths for 15 seconds while resting? Multiply by 4. Normal is 15-30 per minute.",
    data_type: "number",
    extraction_hint: "respiratory rate at rest",
    critical: false,
  },
  exercise_intolerance: {
    id: "exercise_intolerance",
    question_text:
      "Does your dog tire more easily than usual during walks or play?",
    data_type: "boolean",
    extraction_hint: "exercise intolerance or tiring easily",
    critical: false,
  },
  breathing_onset: {
    id: "breathing_onset",
    question_text: "Did the breathing difficulty start suddenly or gradually?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of breathing difficulty",
    critical: true,
  },
  gum_color: {
    id: "gum_color",
    question_text:
      "What color are your dog's gums? Pink is normal. Blue, white, or bright red is concerning.",
    data_type: "choice",
    choices: ["pink_normal", "pale_white", "blue", "bright_red", "yellow"],
    extraction_hint: "gum/mucous membrane color",
    critical: true,
  },

  // Skin questions
  scratch_location: {
    id: "scratch_location",
    question_text:
      "Where is the scratching focused? Face, ears, paws, belly, all over?",
    data_type: "string",
    extraction_hint: "location of scratching/itching",
    critical: true,
  },
  scratch_duration: {
    id: "scratch_duration",
    question_text: "How long has the scratching been going on?",
    data_type: "string",
    extraction_hint: "duration of scratching",
    critical: true,
  },
  skin_changes: {
    id: "skin_changes",
    question_text:
      "Are there any visible skin changes? Redness, bumps, scabs, hair loss, or hot spots?",
    data_type: "string",
    extraction_hint: "visible skin changes",
    critical: false,
  },
  flea_prevention: {
    id: "flea_prevention",
    question_text: "Is your dog on monthly flea prevention?",
    data_type: "boolean",
    extraction_hint: "flea prevention status",
    critical: false,
  },
  seasonal_pattern: {
    id: "seasonal_pattern",
    question_text: "Does the itching seem seasonal or year-round?",
    data_type: "choice",
    choices: ["seasonal", "year_round", "unknown"],
    extraction_hint: "seasonal vs year-round pattern",
    critical: false,
  },

  // Drinking questions
  water_amount_change: {
    id: "water_amount_change",
    question_text: "Roughly how much more water is your dog drinking? Double? Triple?",
    data_type: "string",
    extraction_hint: "estimated increase in water consumption",
    critical: true,
  },
  urination_frequency: {
    id: "urination_frequency",
    question_text: "Is your dog urinating more often than usual?",
    data_type: "boolean",
    extraction_hint: "increased urination frequency",
    critical: true,
  },
  urination_accidents: {
    id: "urination_accidents",
    question_text: "Any urinary accidents in the house (previously housetrained)?",
    data_type: "boolean",
    extraction_hint: "urinary accidents or incontinence",
    critical: false,
  },
  weight_change: {
    id: "weight_change",
    question_text: "Has your dog gained or lost weight recently?",
    data_type: "string",
    extraction_hint: "recent weight change",
    critical: false,
  },
  spay_status: {
    id: "spay_status",
    question_text: "Is your dog spayed/neutered?",
    data_type: "boolean",
    extraction_hint: "spay/neuter status",
    critical: true,
  },

  // Ear questions
  ear_odor: {
    id: "ear_odor",
    question_text: "Is there a smell coming from the ears? Sweet, foul, or yeasty?",
    data_type: "string",
    extraction_hint: "ear odor type",
    critical: false,
  },
  ear_discharge: {
    id: "ear_discharge",
    question_text: "Is there any discharge from the ears? What color?",
    data_type: "string",
    extraction_hint: "ear discharge presence and color",
    critical: true,
  },
  head_shaking: {
    id: "head_shaking",
    question_text: "Is your dog shaking their head frequently?",
    data_type: "boolean",
    extraction_hint: "head shaking behavior",
    critical: false,
  },
  head_tilt: {
    id: "head_tilt",
    question_text: "Is there a head tilt — where the head stays tilted to one side?",
    data_type: "boolean",
    extraction_hint: "persistent head tilt",
    critical: false,
  },
  balance_issues: {
    id: "balance_issues",
    question_text: "Any loss of balance, stumbling, or walking in circles?",
    data_type: "boolean",
    extraction_hint: "vestibular signs: imbalance, circling",
    critical: false,
  },

  // General systemic
  weight_loss: {
    id: "weight_loss",
    question_text: "Have you noticed any weight loss recently?",
    data_type: "boolean",
    extraction_hint: "whether the pet has lost weight",
    critical: false,
  },
  weight_loss_duration: {
    id: "weight_loss_duration",
    question_text: "Over what time period has the weight loss occurred?",
    data_type: "string",
    extraction_hint: "timeframe of weight loss",
    critical: true,
  },
  weight_loss_amount: {
    id: "weight_loss_amount",
    question_text: "Roughly how much weight has been lost?",
    data_type: "string",
    extraction_hint: "estimated weight loss amount",
    critical: false,
  },
  appetite_change: {
    id: "appetite_change",
    question_text: "Has appetite increased, decreased, or stayed normal with the weight loss?",
    data_type: "choice",
    choices: ["increased", "decreased", "normal", "unknown"],
    extraction_hint: "appetite change with weight loss",
    critical: true,
  },
  nasal_discharge: {
    id: "nasal_discharge",
    question_text: "Is there any nasal discharge? Clear, colored, or bloody?",
    data_type: "string",
    extraction_hint: "nasal discharge type",
    critical: false,
  },
  trembling_duration: {
    id: "trembling_duration",
    question_text: "How long has the trembling been going on?",
    data_type: "string",
    extraction_hint: "duration of trembling",
    critical: true,
  },
  trembling_timing: {
    id: "trembling_timing",
    question_text: "Is the trembling constant or does it come and go?",
    data_type: "choice",
    choices: ["constant", "intermittent", "unknown"],
    extraction_hint: "trembling pattern",
    critical: false,
  },
  consciousness_level: {
    id: "consciousness_level",
    question_text: "Is your dog alert and responsive, or dull/unresponsive?",
    data_type: "choice",
    choices: ["alert", "dull", "unresponsive"],
    extraction_hint: "level of consciousness",
    critical: true,
  },
  temperature_feel: {
    id: "temperature_feel",
    question_text: "Do your dog's ears feel warmer than usual? This can indicate a fever.",
    data_type: "boolean",
    extraction_hint: "subjective fever assessment",
    critical: false,
  },
  abdomen_onset: {
    id: "abdomen_onset",
    question_text: "When did you first notice the abdominal swelling?",
    data_type: "string",
    extraction_hint: "onset of abdominal distension",
    critical: true,
  },
  abdomen_pain: {
    id: "abdomen_pain",
    question_text: "Does your dog seem painful when you touch the belly area?",
    data_type: "boolean",
    extraction_hint: "abdominal pain on palpation",
    critical: true,
  },
  unproductive_retching: {
    id: "unproductive_retching",
    question_text:
      "Is your dog trying to vomit but nothing comes up? This is a potential emergency sign.",
    data_type: "boolean",
    extraction_hint: "unproductive retching — trying to vomit with no output",
    critical: true,
  },
  restlessness: {
    id: "restlessness",
    question_text: "Is your dog restless — pacing, unable to settle, or looking at their belly?",
    data_type: "boolean",
    extraction_hint: "restlessness or inability to get comfortable",
    critical: false,
  },
  treats_accepted: {
    id: "treats_accepted",
    question_text: "Will your dog take treats or favorite foods even if refusing regular meals?",
    data_type: "boolean",
    extraction_hint: "whether dog accepts treats despite reduced appetite",
    critical: false,
  },
  stool_changes: {
    id: "stool_changes",
    question_text: "Any changes in stool — color, consistency, or frequency?",
    data_type: "string",
    extraction_hint: "stool changes",
    critical: false,
  },

  // Eye questions
  discharge_color: {
    id: "discharge_color",
    question_text: "What color is the eye discharge? Clear, white, yellow, or green?",
    data_type: "string",
    extraction_hint: "eye discharge color",
    critical: true,
  },
  discharge_duration: {
    id: "discharge_duration",
    question_text: "How long has the eye discharge been present?",
    data_type: "string",
    extraction_hint: "duration of eye discharge",
    critical: true,
  },
  squinting: {
    id: "squinting",
    question_text: "Is your dog squinting or holding the eye shut?",
    data_type: "boolean",
    extraction_hint: "squinting or blepharospasm",
    critical: true,
  },
  eye_redness: {
    id: "eye_redness",
    question_text: "Is the white part of the eye red or bloodshot?",
    data_type: "boolean",
    extraction_hint: "conjunctival redness",
    critical: false,
  },
  vision_changes: {
    id: "vision_changes",
    question_text: "Have you noticed any changes in vision — bumping into things or hesitating?",
    data_type: "boolean",
    extraction_hint: "signs of vision impairment",
    critical: false,
  },

  // Blood in stool
  blood_color: {
    id: "blood_color",
    question_text: "Is the blood bright red or dark/tarry? Bright red = lower GI, dark = upper GI.",
    data_type: "choice",
    choices: ["bright_red", "dark_tarry", "unknown"],
    extraction_hint: "color of blood in stool",
    critical: true,
  },
  blood_amount: {
    id: "blood_amount",
    question_text: "How much blood? Streaks on surface, mixed in, or mostly blood?",
    data_type: "choice",
    choices: ["streaks", "mixed_in", "mostly_blood", "unknown"],
    extraction_hint: "amount of blood in stool",
    critical: true,
  },
  rat_poison_access: {
    id: "rat_poison_access",
    question_text: "Could your dog have had access to rat poison or rodent bait stations?",
    data_type: "boolean",
    extraction_hint: "rodenticide access",
    critical: true,
  },

  // Abdomen
  ear_swelling: {
    id: "ear_swelling",
    question_text: "Is the ear flap puffy or swollen like a pillow?",
    data_type: "boolean",
    extraction_hint: "aural hematoma - ear flap swelling",
    critical: false,
  },
  position_preference: {
    id: "position_preference",
    question_text:
      "Is your dog preferring a specific position — sitting upright, neck extended, or refusing to lie down?",
    data_type: "string",
    extraction_hint: "positional preference indicating orthopnea",
    critical: false,
  },
  diet_change: {
    id: "diet_change",
    question_text: "Any recent changes to diet or new foods introduced?",
    data_type: "string",
    extraction_hint: "recent dietary changes",
    critical: false,
  },

  // Wound / skin issue questions
  wound_location: {
    id: "wound_location",
    question_text: "Where exactly on the body is the wound or skin issue? Which leg, side, or area?",
    data_type: "string",
    extraction_hint: "body location of wound or skin lesion",
    critical: true,
  },
  wound_size: {
    id: "wound_size",
    question_text: "How big is the affected area? Compare to a coin, golf ball, or your palm.",
    data_type: "string",
    extraction_hint: "approximate size of wound or lesion",
    critical: true,
  },
  wound_duration: {
    id: "wound_duration",
    question_text: "How long has this wound or skin issue been present? Is it getting bigger or staying the same?",
    data_type: "string",
    extraction_hint: "duration and progression of the wound",
    critical: true,
  },
  wound_color: {
    id: "wound_color",
    question_text: "What color is the wound or surrounding skin? Red, pink, dark, yellowish, or any unusual color?",
    data_type: "string",
    extraction_hint: "color of wound or affected skin area",
    critical: false,
  },
  wound_discharge: {
    id: "wound_discharge",
    question_text: "Is there any discharge from the wound — pus, clear fluid, or blood?",
    data_type: "choice",
    choices: ["none", "clear_fluid", "pus", "blood", "mixed", "unknown"],
    extraction_hint: "type of wound discharge",
    critical: true,
  },
  wound_odor: {
    id: "wound_odor",
    question_text: "Does the wound have any smell? A bad odor can indicate infection.",
    data_type: "boolean",
    extraction_hint: "presence of wound odor suggesting infection",
    critical: false,
  },
  wound_licking: {
    id: "wound_licking",
    question_text: "Is your pet constantly licking, biting, or scratching at the area?",
    data_type: "boolean",
    extraction_hint: "self-trauma behavior - licking or chewing at wound",
    critical: true,
  },

  // --- VET-902: New questions for expanded complaint families ---

  // Seizure/collapse questions
  seizure_duration: {
    id: "seizure_duration",
    question_text: "How long did the seizure or collapse episode last?",
    data_type: "string",
    extraction_hint: "duration of seizure or collapse in seconds or minutes",
    critical: true,
  },
  prior_seizures: {
    id: "prior_seizures",
    question_text: "Has your dog ever had a seizure or collapse episode before?",
    data_type: "boolean",
    extraction_hint: "history of prior seizure or collapse events",
    critical: true,
  },
  trembling_present: {
    id: "trembling_present",
    question_text: "Is your dog trembling or shaking now?",
    data_type: "boolean",
    extraction_hint: "current trembling or shaking behavior",
    critical: false,
  },
  breathing_status: {
    id: "breathing_status",
    question_text: "How is your dog breathing right now? Normal, fast, labored, or noisy?",
    data_type: "choice",
    choices: ["normal", "fast", "labored", "noisy"],
    extraction_hint: "current breathing status",
    critical: true,
  },

  // Urination questions
  straining_present: {
    id: "straining_present",
    question_text: "Is your dog straining to urinate — trying but producing little or nothing?",
    data_type: "boolean",
    extraction_hint: "straining or difficulty during urination",
    critical: true,
  },
  blood_in_urine: {
    id: "blood_in_urine",
    question_text: "Is there any blood in the urine? Pink, red, or brown color?",
    data_type: "boolean",
    extraction_hint: "visible blood in urine",
    critical: true,
  },

  // Behavior questions
  behavior_change_duration: {
    id: "behavior_change_duration",
    question_text: "How long have you noticed the behavior change?",
    data_type: "string",
    extraction_hint: "duration of behavior change",
    critical: true,
  },
  behavior_change_type: {
    id: "behavior_change_type",
    question_text: "What type of behavior change — aggression, confusion, hiding, clinginess, wandering?",
    data_type: "string",
    extraction_hint: "specific type of behavior change",
    critical: true,
  },
  sleep_pattern: {
    id: "sleep_pattern",
    question_text: "Has your dog's sleep pattern changed — sleeping more, restlessness at night, confused waking?",
    data_type: "string",
    extraction_hint: "changes in sleep or rest pattern",
    critical: false,
  },
  recent_events: {
    id: "recent_events",
    question_text: "Any recent changes in environment, routine, medication, or family?",
    data_type: "string",
    extraction_hint: "recent changes in dog's environment or routine",
    critical: false,
  },

  // Lump questions
  lump_location: {
    id: "lump_location",
    question_text: "Where exactly is the lump? Which body area?",
    data_type: "string",
    extraction_hint: "body location of lump or swelling",
    critical: true,
  },
  lump_size: {
    id: "lump_size",
    question_text: "How big is the lump? Compare it to a pea, grape, golf ball, or larger.",
    data_type: "string",
    extraction_hint: "approximate size of lump or swelling",
    critical: true,
  },
  lump_duration: {
    id: "lump_duration",
    question_text: "How long has the lump been present?",
    data_type: "string",
    extraction_hint: "duration of lump or swelling",
    critical: true,
  },
  lump_growth_rate: {
    id: "lump_growth_rate",
    question_text: "Is the lump growing? How fast — days, weeks, months?",
    data_type: "string",
    extraction_hint: "growth rate of lump",
    critical: true,
  },
  lump_mobility: {
    id: "lump_mobility",
    question_text: "Does the lump move under the skin when you push it, or is it fixed in place?",
    data_type: "choice",
    choices: ["freely_movable", "slightly_mobile", "fixed"],
    extraction_hint: "mobility of lump under skin",
    critical: true,
  },
  other_lumps_present: {
    id: "other_lumps_present",
    question_text: "Have you found any other lumps or bumps elsewhere on your dog?",
    data_type: "boolean",
    extraction_hint: "presence of additional lumps",
    critical: false,
  },

  // Dental questions
  breath_odor_severity: {
    id: "breath_odor_severity",
    question_text: "How bad is your dog's breath? Mild, noticeably bad, or very foul?",
    data_type: "choice",
    choices: ["mild", "noticeable", "very_foul"],
    extraction_hint: "severity of breath odor",
    critical: false,
  },
  drooling_present: {
    id: "drooling_present",
    question_text: "Is your dog drooling more than usual?",
    data_type: "boolean",
    extraction_hint: "excessive drooling",
    critical: true,
  },
  chewing_difficulty: {
    id: "chewing_difficulty",
    question_text: "Is your dog having trouble chewing — dropping food, chewing on one side, or refusing to chew?",
    data_type: "boolean",
    extraction_hint: "difficulty or reluctance to chew",
    critical: true,
  },
  gum_appearance: {
    id: "gum_appearance",
    question_text: "What do your dog's gums look like? Pink, red, swollen, bleeding, or receding?",
    data_type: "string",
    extraction_hint: "appearance of gums",
    critical: true,
  },
  tooth_mobility: {
    id: "tooth_mobility",
    question_text: "Are any teeth loose or missing?",
    data_type: "boolean",
    extraction_hint: "loose or missing teeth",
    critical: false,
  },

  // Hair loss questions
  hair_loss_pattern: {
    id: "hair_loss_pattern",
    question_text: "Where is the hair loss? Symmetrical (both sides) or patchy?",
    data_type: "string",
    extraction_hint: "pattern and location of hair loss",
    critical: true,
  },
  skin_appearance: {
    id: "skin_appearance",
    question_text: "What does the skin look like where the hair is lost? Normal, red, flaky, thickened?",
    data_type: "string",
    extraction_hint: "appearance of skin in hair loss areas",
    critical: true,
  },
  itching_present: {
    id: "itching_present",
    question_text: "Is your dog itchy or scratching, licking, or chewing at the area?",
    data_type: "boolean",
    extraction_hint: "whether itching, scratching, licking, or chewing is present",
    critical: false,
  },
  hair_loss_duration: {
    id: "hair_loss_duration",
    question_text: "How long has the hair loss been going on?",
    data_type: "string",
    extraction_hint: "duration of hair loss",
    critical: true,
  },
  diet_quality: {
    id: "diet_quality",
    question_text: "What type of food does your dog eat? Brand name, homemade, or mixed?",
    data_type: "string",
    extraction_hint: "type and quality of dog's diet",
    critical: false,
  },

  // Regurgitation questions
  regurgitation_timing: {
    id: "regurgitation_timing",
    question_text: "How soon after eating does the regurgitation happen? Immediately, within minutes, or hours later?",
    data_type: "string",
    extraction_hint: "timing of regurgitation relative to eating",
    critical: true,
  },
  food_appearance: {
    id: "food_appearance",
    question_text: "What does the regurgitated material look like? Undigested food, tubular shape, or liquid?",
    data_type: "string",
    extraction_hint: "appearance of regurgitated material",
    critical: true,
  },
  coughing_present: {
    id: "coughing_present",
    question_text: "Is your dog also coughing?",
    data_type: "boolean",
    extraction_hint: "presence of coughing",
    critical: false,
  },

  // Constipation questions
  last_normal_stool: {
    id: "last_normal_stool",
    question_text: "When was the last time your dog had a normal bowel movement?",
    data_type: "string",
    extraction_hint: "time since last normal bowel movement",
    critical: true,
  },
  straining_duration: {
    id: "straining_duration",
    question_text: "How long has your dog been straining?",
    data_type: "string",
    extraction_hint: "duration of straining to defecate or urinate",
    critical: true,
  },
  stool_consistency_when_produced: {
    id: "stool_consistency_when_produced",
    question_text: "When your dog does manage to poop, what is the stool like? Hard pellets, soft, or normal?",
    data_type: "choice",
    choices: ["hard_pellets", "soft", "normal", "nothing_produced"],
    extraction_hint: "consistency of stool when produced during constipation",
    critical: true,
  },

  // Stiffness questions
  stiffness_onset: {
    id: "stiffness_onset",
    question_text: "When did the stiffness start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset pattern of stiffness",
    critical: true,
  },
  affected_areas: {
    id: "affected_areas",
    question_text: "Which areas seem stiff or sore? Legs, back, neck, or all over?",
    data_type: "string",
    extraction_hint: "body areas affected by stiffness",
    critical: true,
  },
  fever_present: {
    id: "fever_present",
    question_text: "Does your dog feel warm? Have you checked temperature?",
    data_type: "boolean",
    extraction_hint: "presence of fever or elevated temperature",
    critical: true,
  },
  worse_after_rest_or_exercise: {
    id: "worse_after_rest_or_exercise",
    question_text: "Is the stiffness worse after resting, after exercise, or constant?",
    data_type: "choice",
    choices: ["after_rest", "after_exercise", "constant"],
    extraction_hint: "when stiffness is worse",
    critical: true,
  },

  // Nasal questions
  discharge_side: {
    id: "discharge_side",
    question_text: "Is the nasal discharge from one nostril or both?",
    data_type: "choice",
    choices: ["one_side", "both_sides"],
    extraction_hint: "whether nasal discharge is unilateral or bilateral",
    critical: true,
  },
  sneezing_frequency: {
    id: "sneezing_frequency",
    question_text: "How often is your dog sneezing? Occasional, frequent, or constant?",
    data_type: "choice",
    choices: ["occasional", "frequent", "constant"],
    extraction_hint: "frequency of sneezing",
    critical: false,
  },
  blood_present: {
    id: "blood_present",
    question_text: "Is there any blood in the discharge?",
    data_type: "boolean",
    extraction_hint: "presence of blood in discharge",
    critical: true,
  },
  nasal_discharge_duration: {
    id: "nasal_discharge_duration",
    question_text: "How long has the nasal discharge been present?",
    data_type: "string",
    extraction_hint: "duration of nasal discharge",
    critical: true,
  },

  // Reproductive questions
  vaginal_discharge_color: {
    id: "vaginal_discharge_color",
    question_text: "What color is the discharge? Clear, bloody, yellow/green, or dark?",
    data_type: "choice",
    choices: ["clear", "bloody", "yellow_green", "dark"],
    extraction_hint: "color of vaginal or other discharge",
    critical: true,
  },
  discharge_odor: {
    id: "discharge_odor",
    question_text: "Does the discharge have a smell? Normal, foul, or very bad?",
    data_type: "choice",
    choices: ["none", "foul", "very_bad"],
    extraction_hint: "odor of discharge",
    critical: false,
  },
  heat_cycle_timing: {
    id: "heat_cycle_timing",
    question_text: "When was your dog's last heat cycle? Is she currently in heat?",
    data_type: "string",
    extraction_hint: "timing of last heat cycle",
    critical: true,
  },

  // Testicular/prostate questions
  neuter_status: {
    id: "neuter_status",
    question_text: "Is your dog neutered?",
    data_type: "boolean",
    extraction_hint: "neuter status",
    critical: true,
  },
  swelling_location: {
    id: "swelling_location",
    question_text: "Where is the swelling — testicle, scrotum, around the anus, or another area?",
    data_type: "string",
    extraction_hint: "location of reproductive or prostate-region swelling",
    critical: true,
  },
  urination_changes: {
    id: "urination_changes",
    question_text: "Any changes in urination — frequency, difficulty, or accidents?",
    data_type: "boolean",
    extraction_hint: "changes in urination pattern",
    critical: true,
  },
  prostate_stool_changes: {
    id: "prostate_stool_changes",
    question_text: "Any changes in stool — ribbon-like, difficulty passing, or constipation?",
    data_type: "boolean",
    extraction_hint: "changes in stool appearance or passing",
    critical: false,
  },
  testicular_prostate_duration: {
    id: "testicular_prostate_duration",
    question_text: "How long have you noticed the swelling or changes?",
    data_type: "string",
    extraction_hint: "duration of testicular or prostate changes",
    critical: true,
  },

  // Exercise-induced lameness questions
  exercise_type: {
    id: "exercise_type",
    question_text: "What type of exercise triggers the lameness? Walking, running, playing, or all activity?",
    data_type: "string",
    extraction_hint: "type of exercise that triggers lameness",
    critical: true,
  },
  onset_during_exercise: {
    id: "onset_during_exercise",
    question_text: "Does the lameness start during exercise or after?",
    data_type: "choice",
    choices: ["during", "after"],
    extraction_hint: "when lameness starts relative to exercise",
    critical: true,
  },
  recovery_time: {
    id: "recovery_time",
    question_text: "How long does it take your dog to recover after the lameness starts?",
    data_type: "string",
    extraction_hint: "recovery time after exercise-induced lameness",
    critical: true,
  },
  breathing_after_exercise: {
    id: "breathing_after_exercise",
    question_text: "How is your dog's breathing after exercise? Normal, fast, or labored?",
    data_type: "choice",
    choices: ["normal", "fast", "labored"],
    extraction_hint: "breathing status after exercise",
    critical: false,
  },
  prior_episodes: {
    id: "prior_episodes",
    question_text: "Has this happened before?",
    data_type: "boolean",
    extraction_hint: "history of prior similar episodes",
    critical: true,
  },

  // Skin odor questions
  odor_location: {
    id: "odor_location",
    question_text: "Where is the odor worst? All over, specific area, ears, paws, or skin folds?",
    data_type: "string",
    extraction_hint: "location of worst skin odor",
    critical: true,
  },
  bath_frequency: {
    id: "bath_frequency",
    question_text: "How often do you bathe your dog?",
    data_type: "string",
    extraction_hint: "frequency of bathing",
    critical: false,
  },
  ear_involvement: {
    id: "ear_involvement",
    question_text: "Are the ears also affected — smelly, red, or discharging?",
    data_type: "boolean",
    extraction_hint: "whether ears are also involved in skin issue",
    critical: false,
  },

  // Recurrent ear/skin questions
  infection_frequency: {
    id: "infection_frequency",
    question_text: "How often does your dog get these infections? Monthly, every few months, or rarely?",
    data_type: "string",
    extraction_hint: "frequency of recurrent infections",
    critical: true,
  },
  last_treatment: {
    id: "last_treatment",
    question_text: "What was the last treatment your dog received for this? How long ago?",
    data_type: "string",
    extraction_hint: "most recent treatment and timing",
    critical: true,
  },
  underlying_allergy_diagnosis: {
    id: "underlying_allergy_diagnosis",
    question_text: "Has your dog been diagnosed with allergies?",
    data_type: "boolean",
    extraction_hint: "whether dog has diagnosed allergies",
    critical: false,
  },
  food_trial_done: {
    id: "food_trial_done",
    question_text: "Has your dog ever done a hypoallergenic food trial?",
    data_type: "boolean",
    extraction_hint: "whether hypoallergenic food trial has been attempted",
    critical: false,
  },
  ear_cleaning_routine: {
    id: "ear_cleaning_routine",
    question_text: "Do you clean your dog's ears regularly? How often and with what product?",
    data_type: "string",
    extraction_hint: "ear cleaning routine",
    critical: false,
  },
  skin_infection_frequency: {
    id: "skin_infection_frequency",
    question_text: "How often does your dog get skin infections?",
    data_type: "string",
    extraction_hint: "frequency of skin infections",
    critical: true,
  },
  antibiotic_history: {
    id: "antibiotic_history",
    question_text: "What antibiotics has your dog been on for skin issues? How effective were they?",
    data_type: "string",
    extraction_hint: "history of antibiotic treatments for skin",
    critical: true,
  },
  allergy_testing_done: {
    id: "allergy_testing_done",
    question_text: "Has your dog had allergy testing?",
    data_type: "boolean",
    extraction_hint: "whether allergy testing has been performed",
    critical: false,
  },
  immune_status: {
    id: "immune_status",
    question_text: "Does your dog have any known immune system issues or take immune-suppressing medications?",
    data_type: "boolean",
    extraction_hint: "known immune system problems or immunosuppressive medications",
    critical: false,
  },

  // Inappropriate urination questions
  behavioral_changes: {
    id: "behavioral_changes",
    question_text: "Any other behavior changes — aggression, confusion, anxiety, or clinginess?",
    data_type: "boolean",
    extraction_hint: "presence of other behavior changes",
    critical: false,
  },

  // Fecal incontinence questions
  fecal_incontinence_onset: {
    id: "fecal_incontinence_onset",
    question_text: "When did the fecal incontinence start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of fecal incontinence",
    critical: true,
  },
  hind_limb_function: {
    id: "hind_limb_function",
    question_text: "Is your dog's hind limb strength normal? Any weakness, dragging, or wobbling?",
    data_type: "boolean",
    extraction_hint: "hind limb weakness or dysfunction",
    critical: true,
  },
  tail_movement: {
    id: "tail_movement",
    question_text: "Can your dog move their tail normally? Lift it, wag it?",
    data_type: "boolean",
    extraction_hint: "tail mobility",
    critical: false,
  },
  back_pain: {
    id: "back_pain",
    question_text: "Does your dog seem painful in the back — crying when picked up or reluctant to jump?",
    data_type: "boolean",
    extraction_hint: "back pain",
    critical: true,
  },
  perineal_reflex: {
    id: "perineal_reflex",
    question_text: "Does your dog's anus squeeze when you gently touch the area? (This is a neurologic reflex.)",
    data_type: "boolean",
    extraction_hint: "presence of perineal reflex (veterinary assessment)",
    critical: false,
  },

  // Combined vomiting/diarrhea questions
  combined_vomiting_duration: {
    id: "combined_vomiting_duration",
    question_text: "How long has the vomiting been going on?",
    data_type: "string",
    extraction_hint: "duration of vomiting in combined GI presentation",
    critical: true,
  },
  combined_diarrhea_duration: {
    id: "combined_diarrhea_duration",
    question_text: "How long has the diarrhea been going on?",
    data_type: "string",
    extraction_hint: "duration of diarrhea in combined GI presentation",
    critical: true,
  },
  blood_in_either: {
    id: "blood_in_either",
    question_text: "Have you seen blood in the vomit or diarrhea?",
    data_type: "boolean",
    extraction_hint: "blood present in either vomit or diarrhea",
    critical: true,
  },

  // Coughing + breathing combined questions
  coughing_breathing_onset: {
    id: "coughing_breathing_onset",
    question_text: "When did the coughing and breathing difficulty start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of combined coughing and breathing difficulty",
    critical: true,
  },

  // Oral mass questions
  oral_mass_location: {
    id: "oral_mass_location",
    question_text: "Where in the mouth is the mass? Gums, tongue, palate, or throat?",
    data_type: "string",
    extraction_hint: "location of oral mass",
    critical: true,
  },
  oral_mass_size: {
    id: "oral_mass_size",
    question_text: "How big is the mass? Compare to a pea, marble, or larger.",
    data_type: "string",
    extraction_hint: "size of oral mass",
    critical: true,
  },
  bleeding_present: {
    id: "bleeding_present",
    question_text: "Is the area bleeding or has there been blood from the mouth?",
    data_type: "boolean",
    extraction_hint: "bleeding associated with the oral mass or affected area",
    critical: true,
  },
  eating_difficulty: {
    id: "eating_difficulty",
    question_text: "Is your dog having difficulty eating — dropping food, chewing on one side, or refusing?",
    data_type: "boolean",
    extraction_hint: "difficulty eating due to oral mass",
    critical: true,
  },
  oral_mass_duration: {
    id: "oral_mass_duration",
    question_text: "How long have you noticed the mass?",
    data_type: "string",
    extraction_hint: "duration of oral mass",
    critical: true,
  },

  // Vision questions
  vision_loss_onset: {
    id: "vision_loss_onset",
    question_text: "Did the vision loss happen suddenly or gradually?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of vision loss",
    critical: true,
  },
  one_or_both_eyes: {
    id: "one_or_both_eyes",
    question_text: "Is the vision loss in one eye or both?",
    data_type: "choice",
    choices: ["one", "both"],
    extraction_hint: "whether vision loss is unilateral or bilateral",
    critical: true,
  },
  pain_present: {
    id: "pain_present",
    question_text: "Does the eye or affected area seem painful — squinting, pawing, yelping, or avoiding touch?",
    data_type: "boolean",
    extraction_hint: "pain signs such as squinting, pawing, yelping, or avoiding touch",
    critical: true,
  },
  pupil_appearance: {
    id: "pupil_appearance",
    question_text: "Do the pupils look normal? Are they dilated, unequal, or not reacting to light?",
    data_type: "string",
    extraction_hint: "appearance of pupils",
    critical: true,
  },
  other_neurologic_signs: {
    id: "other_neurologic_signs",
    question_text: "Any other neurologic signs — head tilt, circling, weakness, or seizures?",
    data_type: "boolean",
    extraction_hint: "presence of other neurologic signs",
    critical: true,
  },
  vision_loss_duration: {
    id: "vision_loss_duration",
    question_text: "How long have you noticed the vision changes?",
    data_type: "string",
    extraction_hint: "duration of vision loss",
    critical: true,
  },

  // Hearing questions
  hearing_loss_onset: {
    id: "hearing_loss_onset",
    question_text: "Did the hearing loss happen suddenly or gradually?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of hearing loss",
    critical: true,
  },
  ear_infection_history: {
    id: "ear_infection_history",
    question_text: "Has your dog had ear infections before, or any recent ear odor, redness, or discharge?",
    data_type: "boolean",
    extraction_hint: "history of ear infection or current ear odor, redness, or discharge",
    critical: false,
  },
  response_to_loud_sounds: {
    id: "response_to_loud_sounds",
    question_text: "Does your dog respond to loud noises like clapping or door slams?",
    data_type: "boolean",
    extraction_hint: "response to loud sounds",
    critical: true,
  },
  dog_age_years: {
    id: "dog_age_years",
    question_text: "How old is your dog in years?",
    data_type: "number",
    extraction_hint: "age of dog in years",
    critical: true,
  },

  // Aggression questions
  aggression_onset: {
    id: "aggression_onset",
    question_text: "When did the aggressive behavior start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of aggressive behavior",
    critical: true,
  },
  trigger_situations: {
    id: "trigger_situations",
    question_text: "What triggers the aggression? Being touched, eating, guarding, or random?",
    data_type: "string",
    extraction_hint: "situations that trigger aggression",
    critical: true,
  },

  // Pacing questions
  abdomen_appearance: {
    id: "abdomen_appearance",
    question_text: "Does your dog's belly look swollen, tight, or distended?",
    data_type: "boolean",
    extraction_hint: "abdominal distension",
    critical: true,
  },
  retching_present: {
    id: "retching_present",
    question_text: "Is your dog trying to vomit but nothing is coming up?",
    data_type: "boolean",
    extraction_hint: "unproductive retching",
    critical: true,
  },
  pacing_duration: {
    id: "pacing_duration",
    question_text: "How long has your dog been pacing or restless?",
    data_type: "string",
    extraction_hint: "duration of pacing or restlessness",
    critical: true,
  },

  // Abnormal gait questions
  abnormal_gait_onset: {
    id: "abnormal_gait_onset",
    question_text: "When did the abnormal gait start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of abnormal gait",
    critical: true,
  },
  affected_limbs: {
    id: "affected_limbs",
    question_text: "Which limbs are affected? Front, back, one side, or all four?",
    data_type: "string",
    extraction_hint: "which limbs are affected by abnormal gait",
    critical: true,
  },
  bladder_control: {
    id: "bladder_control",
    question_text: "Has your dog lost bladder control — leaking urine or unable to urinate?",
    data_type: "boolean",
    extraction_hint: "loss of bladder control",
    critical: true,
  },
  abnormal_gait_progression: {
    id: "abnormal_gait_progression",
    question_text: "Is the gait getting better, worse, or staying the same?",
    data_type: "choice",
    choices: ["better", "worse", "same"],
    extraction_hint: "progression of abnormal gait",
    critical: true,
  },

  // Heat intolerance questions
  temperature_exposure: {
    id: "temperature_exposure",
    question_text: "What was the temperature? Was your dog in a hot car, direct sun, or unventilated area?",
    data_type: "string",
    extraction_hint: "temperature and exposure conditions",
    critical: true,
  },
  heat_exposure_duration: {
    id: "heat_exposure_duration",
    question_text: "How long was your dog exposed to the heat?",
    data_type: "string",
    extraction_hint: "duration of heat exposure",
    critical: true,
  },

  // Post-operative questions
  surgery_type: {
    id: "surgery_type",
    question_text: "What type of surgery did your dog have?",
    data_type: "string",
    extraction_hint: "type of surgery performed",
    critical: true,
  },
  days_post_op: {
    id: "days_post_op",
    question_text: "How many days ago was the surgery?",
    data_type: "number",
    extraction_hint: "number of days since surgery",
    critical: true,
  },
  incision_appearance: {
    id: "incision_appearance",
    question_text: "What does the incision look like? Clean, red, swollen, open, or oozing?",
    data_type: "string",
    extraction_hint: "appearance of surgical incision",
    critical: true,
  },
  discharge_present: {
    id: "discharge_present",
    question_text: "Is there any discharge from the incision?",
    data_type: "boolean",
    extraction_hint: "discharge from surgical site",
    critical: true,
  },
  activity_level: {
    id: "activity_level",
    question_text: "How active has your dog been since surgery? Resting, walking normally, or running/playing?",
    data_type: "string",
    extraction_hint: "activity level since surgery",
    critical: false,
  },

  // Medication reaction questions
  medication_name: {
    id: "medication_name",
    question_text: "What medication did your dog receive?",
    data_type: "string",
    extraction_hint: "name of medication",
    critical: true,
  },
  medication_dose: {
    id: "medication_dose",
    question_text: "What dose was given? How many pills or ml?",
    data_type: "string",
    extraction_hint: "dose of medication",
    critical: true,
  },
  medication_timing: {
    id: "medication_timing",
    question_text: "How long ago was the medication given?",
    data_type: "string",
    extraction_hint: "time since medication was given",
    critical: true,
  },
  reaction_symptoms: {
    id: "reaction_symptoms",
    question_text: "What symptoms did your dog develop after the medication?",
    data_type: "string",
    extraction_hint: "symptoms of medication reaction",
    critical: true,
  },
  prior_reactions: {
    id: "prior_reactions",
    question_text: "Has your dog ever had a reaction to medication before?",
    data_type: "boolean",
    extraction_hint: "history of prior medication reactions",
    critical: false,
  },
  current_medications: {
    id: "current_medications",
    question_text: "Is [name] currently taking any medications, supplements, or flea/tick preventatives?",
    data_type: "string",
    extraction_hint: "any medications, drugs, supplements, flea treatment, heartworm prevention",
    critical: false,
  },
  vaccination_timing: {
    id: "vaccination_timing",
    question_text:
      "How long after the vaccine did the symptoms start? Within hours, later the same day, or the next day?",
    data_type: "choice",
    choices: ["within_hours", "same_day", "next_day", "longer_ago", "unknown"],
    extraction_hint: "timing of symptoms relative to vaccination",
    critical: true,
  },
  vaccination_type: {
    id: "vaccination_type",
    question_text:
      "What vaccine or booster did your dog receive, if you know?",
    data_type: "string",
    extraction_hint: "type of recent vaccine or booster",
    critical: false,
  },
  face_swelling: {
    id: "face_swelling",
    question_text:
      "Has your dog's face, muzzle, or eyelids become swollen after the vaccine?",
    data_type: "boolean",
    extraction_hint: "facial swelling after vaccination",
    critical: true,
  },
  hives_with_breathing: {
    id: "hives_with_breathing",
    question_text:
      "Are there hives or a rash together with breathing trouble after the vaccine?",
    data_type: "boolean",
    extraction_hint: "hives or rash with breathing difficulty after vaccination",
    critical: true,
  },

  // Pregnancy/birth questions
  days_pregnant: {
    id: "days_pregnant",
    question_text: "How many days pregnant is your dog? (Normal is 63 days from ovulation.)",
    data_type: "number",
    extraction_hint: "number of days pregnant",
    critical: true,
  },
  contraction_status: {
    id: "contraction_status",
    question_text: "Is your dog having contractions? Visible straining?",
    data_type: "boolean",
    extraction_hint: "presence of contractions",
    critical: true,
  },
  puppies_delivered: {
    id: "puppies_delivered",
    question_text: "How many puppies have been delivered so far?",
    data_type: "number",
    extraction_hint: "number of puppies delivered",
    critical: true,
  },
  time_since_last_puppy: {
    id: "time_since_last_puppy",
    question_text: "How long since the last puppy was delivered?",
    data_type: "string",
    extraction_hint: "time since last puppy delivery",
    critical: true,
  },

  // Puppy questions
  puppy_age_weeks: {
    id: "puppy_age_weeks",
    question_text: "How old is the puppy in weeks?",
    data_type: "number",
    extraction_hint: "age of puppy in weeks",
    critical: true,
  },
  nursing_status: {
    id: "nursing_status",
    question_text: "Is the puppy nursing? When was the last feed?",
    data_type: "string",
    extraction_hint: "nursing status of puppy",
    critical: true,
  },
  puppy_temperature: {
    id: "puppy_temperature",
    question_text: "Does the puppy feel warm or cold to touch?",
    data_type: "choice",
    choices: ["warm", "cool", "cold"],
    extraction_hint: "body temperature of puppy by touch",
    critical: true,
  },
  weight_trend: {
    id: "weight_trend",
    question_text: "Is the puppy gaining, maintaining, or losing weight?",
    data_type: "choice",
    choices: ["gaining", "maintaining", "losing"],
    extraction_hint: "weight trend of puppy",
    critical: true,
  },
  littermate_status: {
    id: "littermate_status",
    question_text: "Are the other puppies in the litter doing okay?",
    data_type: "string",
    extraction_hint: "health status of littermates",
    critical: false,
  },
  vaccination_status: {
    id: "vaccination_status",
    question_text: "Has the puppy started vaccinations? Which ones?",
    data_type: "string",
    extraction_hint: "vaccination status of puppy",
    critical: false,
  },

  // Senior decline questions
  senior_decline_duration: {
    id: "senior_decline_duration",
    question_text: "Over what time period have you noticed the decline? Weeks, months, or years?",
    data_type: "string",
    extraction_hint: "duration of senior decline",
    critical: true,
  },
  specific_changes: {
    id: "specific_changes",
    question_text: "What specific changes have you noticed? Sleeping more, slower, confused, not eating?",
    data_type: "string",
    extraction_hint: "specific changes noticed in senior dog",
    critical: true,
  },
  mobility_level: {
    id: "mobility_level",
    question_text: "How is your dog's mobility? Walking normally, stiff, or struggling to stand?",
    data_type: "choice",
    choices: ["normal", "stiff", "struggling"],
    extraction_hint: "mobility level",
    critical: true,
  },

  // Multi-system decline questions
  each_symptom_duration: {
    id: "each_symptom_duration",
    question_text: "How long has each symptom been going on?",
    data_type: "string",
    extraction_hint: "duration of each symptom",
    critical: true,
  },
  energy_level: {
    id: "energy_level",
    question_text: "How is your dog's energy? Normal, slightly reduced, very low, or barely moving?",
    data_type: "choice",
    choices: ["normal", "slightly_reduced", "very_low", "barely_moving"],
    extraction_hint: "overall energy level",
    critical: true,
  },
  vomiting_present: {
    id: "vomiting_present",
    question_text: "Is your dog vomiting?",
    data_type: "boolean",
    extraction_hint: "presence of vomiting",
    critical: false,
  },

  // Trajectory question — asked once after emergency screen to detect worsening
  condition_progression: {
    id: "condition_progression",
    question_text:
      "Compared to when this started, is [name] getting worse, staying about the same, or starting to improve?",
    data_type: "choice",
    choices: ["worsening", "same", "improving"],
    extraction_hint:
      "whether the condition is getting worse, staying the same, or improving — look for words like worse, deteriorating, declined vs same, unchanged vs better, improving",
    critical: false,
  },

  // Unknown concern questions
  chief_complaint_guess: {
    id: "chief_complaint_guess",
    question_text: "What is your best guess about what's wrong? Even if you're not sure.",
    data_type: "string",
    extraction_hint: "owner's best guess about the problem",
    critical: true,
  },
  last_normal: {
    id: "last_normal",
    question_text: "When was the last time your dog seemed completely normal?",
    data_type: "string",
    extraction_hint: "last time dog seemed normal",
    critical: true,
  },

  // Treatment and medical history questions
  prior_similar_episode: {
    id: "prior_similar_episode",
    question_text: "Has [name] had anything like this before?",
    data_type: "boolean",
    extraction_hint: "whether the pet has had similar symptoms or this condition before",
    critical: false,
  },
  recent_diet_change: {
    id: "recent_diet_change",
    question_text: "Has there been any change in [name]'s diet, treats, or what [he/she] eats in the last week?",
    data_type: "boolean",
    extraction_hint: "diet change, new food, new treats, table scraps, garbage",
    critical: false,
  },
  spay_neuter_status: {
    id: "spay_neuter_status",
    question_text: "Is [name] spayed or neutered?",
    data_type: "choice",
    choices: ["yes", "no", "not_sure"],
    extraction_hint: "whether the pet is spayed (female) or neutered (male) or intact",
    critical: false,
  },
  last_vet_visit: {
    id: "last_vet_visit",
    question_text: "When did [name] last see a veterinarian, and was anything noted at that visit?",
    data_type: "string",
    extraction_hint: "last vet visit date, recent diagnosis, recent exam findings",
    critical: false,
  },
};
