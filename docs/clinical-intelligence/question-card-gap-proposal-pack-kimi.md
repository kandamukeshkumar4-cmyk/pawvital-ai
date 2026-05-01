# Question Card Gap Proposal Pack (VET-1429K)

**Agent:** Kimi 2.6  
**Branch:** `kimi/vet-1429k-question-card-gap-proposal-pack`  
**Date:** 2026-05-01  
**Scope:** Proposal / audit only — no question cards added, no complaint modules added, no runtime files touched.

---

## 1. Context

VET-1424K identified eight candidate complaint-module areas that are **blocked** because they lack dedicated question-card coverage. This document converts those blockers into exact, implementation-ready question-card proposals.

**Current registry:** 26 question cards, 35 canonical red flags, 14 clinical signals.

*Note: 7 of the 24 proposed cards were implemented by VET-1432K (`heat_exposure_check`, `brachycephalic_breed_check`, `panting_excess_check`, `trauma_mechanism_check`, `wound_characterization_check`, `bleeding_volume_check`, `laceration_depth_check`). The remaining 17 proposed cards are still pending implementation.*
**Rule:** Every proposed ID below is prefixed with `(PROPOSED)` in this document. None are registered in `question-card-registry.ts` at the time of writing.

---

## 2. Proposal Summary by Candidate

| # | Candidate Area | Proposed Cards | Blocker After This Pack | Priority |
|---|----------------|----------------|------------------------|----------|
| 1 | eye / vision / discharge | 4 | needs red flags + signals | High |
| 2 | ear / head-tilt / balance | 4 | needs red flags + signals | High |
| 3 | appetite / weight-loss / drinking-more | 3 | needs red flags + signals | Medium |
| 4 | post-vaccination reaction | 3 | needs red flags | Medium |
| 5 | abdominal pain (not GI/bloat) | 3 | needs red flags | Medium |
| 6 | wound / skin overlap (trauma prep) | 3 | **ready** (existing red flags + signal) | Medium |
| 7 | heatstroke / heat exposure | 3 | **ready** (existing red flags + signals) | **Highest** |
| 8 | trauma / bleeding / wound | 3 | **ready** (existing red flags + signals) | **Highest** |

**Total proposed question cards:** 24 (shared usage is reflected in the candidate mappings in §4).

---

## 3. Detailed Proposals

### 3.1 Eye / Vision / Discharge

**Current blocker:** `blocked_missing_question_cards`, `blocked_missing_red_flags`, `blocked_missing_signals`  
**Existing usable cards:** `emergency_global_screen` (generic)  
**Existing usable red flags:** none eye-specific  
**Existing usable signals:** none eye-specific

#### (PROPOSED) `eye_discharge_check`
- **ownerText:** "Do you see any discharge from your pet’s eye(s)? If yes, what color and consistency is it?"
- **shortReason:** "The type of eye discharge helps determine whether the issue is likely irritation, infection, or something more urgent."
- **answerType:** `choice`
- **allowedAnswers:** `["Clear / watery", "Cloudy / mucoid", "Yellow / green", "Bloody", "No discharge", "Not sure"]`
- **phase:** `characterize`
- **ownerAnswerability:** 3
- **urgencyImpact:** 1
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags (proposed):** `severe_eye_discharge`
- **changesUrgencyIf:** `{ "yellow / green": "Increase urgency; purulent discharge may indicate serious infection.", "bloody": "Escalate to urgent evaluation." }`
- **skipIfAnswered:** `[]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners can visually inspect discharge color and consistency without clinical tools.
- **why no diagnosis/treat:** Describes observation only; does not name a disease, prescribe medication, or recommend surgery.
- **dependencies:** Needs red flag `severe_eye_discharge` (proposed) and signal `possible_eye_emergency` (proposed).

#### (PROPOSED) `eye_swelling_check`
- **ownerText:** "Is the area around your pet’s eye swollen, or is the eyelid bulging or closed shut?"
- **shortReason:** "Swelling around the eye can indicate allergy, infection, or injury that may affect vision or comfort."
- **answerType:** `boolean`
- **phase:** `emergency_screen`
- **ownerAnswerability:** 3
- **urgencyImpact:** 3
- **discriminativeValue:** 2
- **reportValue:** 2
- **screensRedFlags (proposed):** `eye_protrusion`
- **changesUrgencyIf:** `{ "yes": "Escalate to immediate emergency evaluation." }`
- **skipIfAnswered:** `["emergency_global_screen"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners can easily see if an eyelid is swollen or closed.
- **why no diagnosis/treat:** Describes physical appearance only; does not diagnose or prescribe.
- **dependencies:** Needs red flag `eye_protrusion` (proposed) and signal `possible_eye_emergency` (proposed).

#### (PROPOSED) `vision_change_check`
- **ownerText:** "Have you noticed your pet bumping into furniture, having trouble finding toys, or keeping one eye closed?"
- **shortReason:** "Behavioral changes that suggest reduced vision help determine whether an eye or neurologic issue may be present."
- **answerType:** `choice`
- **allowedAnswers:** `["Bumping into things", "Trouble finding objects", "Keeping one eye closed", "Dilated pupil", "No changes", "Not sure"]`
- **phase:** `characterize`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags (proposed):** `sudden_blindness`
- **changesUrgencyIf:** `{ "bumping into things": "Increase urgency; sudden vision loss needs rapid assessment.", "dilated pupil": "Increase urgency; unequal or fixed pupils may indicate serious issues." }`
- **skipIfAnswered:** `["eye_discharge_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners observe daily behavior and can notice navigational mistakes or squinting.
- **why no diagnosis/treat:** Frames observations behaviorally; no disease naming or treatment advice.
- **dependencies:** Needs red flag `sudden_blindness` (proposed) and signal `possible_vision_loss` (proposed).

#### (PROPOSED) `eye_injury_check`
- **ownerText:** "Do you see any scratch, cut, foreign object, or bleeding on the surface of the eye, or has the eye changed shape after trauma?"
- **shortReason:** "Visible injury to the eye surface or globe can worsen quickly and may threaten vision."
- **answerType:** `boolean`
- **phase:** `emergency_screen`
- **ownerAnswerability:** 2
- **urgencyImpact:** 3
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags (proposed):** `eye_injury`
- **changesUrgencyIf:** `{ "yes": "Escalate to immediate emergency evaluation." }`
- **skipIfAnswered:** `["emergency_global_screen"]`
- **sourceIds:** `["internal_pending_review"]`
- **safetyNotes:** `["If you suspect a foreign body, do not attempt to remove it yourself."]`
- **why owner-answerable:** Owners can see obvious surface injuries, though subtle lesions may be missed (hence ownerAnswerability 2 + safety note).
- **why no diagnosis/treat:** Describes injury presence only; defers removal and treatment to a veterinarian.
- **dependencies:** Needs red flag `eye_injury` (proposed).

---

### 3.2 Ear / Head-Tilt / Balance

**Current blocker:** `blocked_missing_question_cards`, `blocked_missing_red_flags`, `blocked_missing_signals`  
**Existing usable cards:** `emergency_global_screen`, `seizure_neuro_check` (indirect — head-tilt can match neuro signal)  
**Existing usable red flags:** none ear-specific  
**Existing usable signals:** `possible_neuro_emergency` (matches "tilted head", "circling")

#### (PROPOSED) `ear_pain_check`
- **ownerText:** "Does your pet yelp, pull away, or act sensitive when you gently touch the base of the ear or the ear flap?"
- **shortReason:** "Pain on ear touch helps distinguish ear canal issues from inner-ear or neurologic causes of head tilt."
- **answerType:** `boolean`
- **phase:** `characterize`
- **ownerAnswerability:** 3
- **urgencyImpact:** 1
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags:** `[]`
- **changesUrgencyIf:** `{}`
- **skipIfAnswered:** `[]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners naturally interact with their pet’s ears and can detect flinching or vocalization.
- **why no diagnosis/treat:** Describes behavioral response only; does not diagnose otitis or prescribe drops.
- **dependencies:** None new; relies on existing neuro signal if head tilt is present.

#### (PROPOSED) `ear_discharge_check`
- **ownerText:** "Is there any discharge, odor, or debris inside the ear canal or on the ear flap?"
- **shortReason:** "Discharge character helps differentiate infection, infestation, or foreign body from clean inner-ear disease."
- **answerType:** `choice`
- **allowedAnswers:** `["No discharge / clean", "Brown / waxy", "Yellow / pus-like", "Bloody", "Strong odor", "Not sure"]`
- **phase:** `discriminate`
- **ownerAnswerability:** 3
- **urgencyImpact:** 1
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags:** `[]`
- **changesUrgencyIf:** `{ "bloody": "Increase urgency; bloody ear discharge may indicate trauma or deep infection." }`
- **skipIfAnswered:** `["ear_pain_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners can see and smell ear discharge during routine handling.
- **why no diagnosis/treat:** Describes material only; does not name pathogens or recommend antibiotics.
- **dependencies:** None new.

#### (PROPOSED) `head_tilt_check`
- **ownerText:** "Is your pet holding its head tilted to one side persistently, or does the head tilt come and go?"
- **shortReason:** "Persistent head tilt can indicate inner-ear or vestibular disease and helps separate ear issues from seizure or stroke."
- **answerType:** `choice`
- **allowedAnswers:** `["Persistent tilt to one side", "Comes and goes", "Only when shaking head", "No tilt", "Not sure"]`
- **phase:** `characterize`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags (proposed):** `vestibular_event`
- **changesUrgencyIf:** `{ "persistent tilt to one side": "Increase urgency; persistent vestibular signs need prompt assessment." }`
- **skipIfAnswered:** `[]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Head posture is a visible, static observation.
- **why no diagnosis/treat:** Describes posture only; does not diagnose vestibular disease or prescribe treatment.
- **dependencies:** Needs red flag `vestibular_event` (proposed) and signal `possible_vestibular_attack` (proposed).

#### (PROPOSED) `balance_loss_check`
- **ownerText:** "Is your pet falling over, rolling, or unable to walk in a straight line?"
- **shortReason:** "Loss of balance helps determine whether the problem is peripheral (ear) or central (brainstem / neurologic)."
- **answerType:** `boolean`
- **phase:** `discriminate`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags (proposed):** `vestibular_event`
- **changesUrgencyIf:** `{ "yes": "Increase urgency; ataxia may indicate neurologic or severe inner-ear disease." }`
- **skipIfAnswered:** `["head_tilt_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Gait and balance are observable during normal movement.
- **why no diagnosis/treat:** Describes locomotion only; defers neurologic diagnosis to clinician.
- **dependencies:** Needs red flag `vestibular_event` (proposed).

---

### 3.3 Appetite / Weight-Loss / Drinking-More

**Current blocker:** `blocked_missing_question_cards`, `blocked_missing_red_flags`, `blocked_missing_signals`  
**Existing usable cards:** `emergency_global_screen`  
**Existing usable red flags:** none appetite-specific  
**Existing usable signals:** none appetite-specific

#### (PROPOSED) `appetite_change_check`
- **ownerText:** "Has your pet’s appetite changed recently — are they eating less than usual, refusing food entirely, or eating more than normal?"
- **shortReason:** "Appetite direction and magnitude are early indicators of systemic, metabolic, or gastrointestinal disease."
- **answerType:** `choice`
- **allowedAnswers:** `["Eating less", "Refusing food entirely", "Eating more", "Normal appetite", "Not sure"]`
- **phase:** `characterize`
- **ownerAnswerability:** 3
- **urgencyImpact:** 1
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags (proposed):** `anorexia_prolonged`
- **changesUrgencyIf:** `{ "refusing food entirely": "Increase urgency if lasting more than 24 hours in small pets or 48 hours in large pets." }`
- **skipIfAnswered:** `[]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners measure appetite by observing bowl emptying and treat interest.
- **why no diagnosis/treat:** Describes intake behavior only; does not diagnose diabetes, kidney disease, etc.
- **dependencies:** Needs red flag `anorexia_prolonged` (proposed) and signal `possible_systemic_illness` (proposed).

#### (PROPOSED) `weight_loss_check`
- **ownerText:** "Has your pet lost weight recently, and if so, was it gradual over weeks or sudden over days?"
- **shortReason:** "Rate of weight loss helps separate chronic metabolic disease from acute illness."
- **answerType:** `choice`
- **allowedAnswers:** `["Gradual over weeks", "Sudden over days", "Not sure — looks thinner", "No weight loss", "Not sure"]`
- **phase:** `timeline`
- **ownerAnswerability:** 2
- **urgencyImpact:** 1
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags (proposed):** `rapid_weight_loss`
- **changesUrgencyIf:** `{ "sudden over days": "Increase urgency; acute weight loss warrants prompt evaluation." }`
- **skipIfAnswered:** `["appetite_change_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners notice body-condition changes but may not have scale data (hence 2).
- **why no diagnosis/treat:** Frames body-condition observation; no disease naming or dosing.
- **dependencies:** Needs red flag `rapid_weight_loss` (proposed).

#### (PROPOSED) `polydipsia_check`
- **ownerText:** "Is your pet drinking noticeably more water than usual, or are you refilling the water bowl more often?"
- **shortReason:** "Excessive thirst can be an early clue to metabolic, endocrine, or renal issues."
- **answerType:** `boolean`
- **phase:** `characterize`
- **ownerAnswerability:** 3
- **urgencyImpact:** 1
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags (proposed):** `polyuria_polydipsia`
- **changesUrgencyIf:** `{ "yes": "Increase urgency if accompanied by weight loss or lethargy." }`
- **skipIfAnswered:** `["appetite_change_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Water-bowl refill frequency is a direct, daily owner observation.
- **why no diagnosis/treat:** Describes intake volume only; does not diagnose diabetes insipidus, Cushing’s, etc.
- **dependencies:** Needs red flag `polyuria_polydipsia` (proposed).

---

### 3.4 Post-Vaccination Reaction

**Current blocker:** `blocked_missing_question_cards`, `blocked_missing_red_flags`  
**Existing usable cards:** `skin_emergency_allergy_screen`, `emergency_global_screen`, `breathing_difficulty_check`, `collapse_weakness_check`  
**Existing usable red flags:** `face_swelling`, `hives_widespread`, `allergic_with_breathing`, `collapse`, `breathing_difficulty`  
**Existing usable signals:** none vaccine-specific

#### (PROPOSED) `vaccine_recent_check`
- **ownerText:** "Did your pet receive a vaccine, booster, or new medication within the last 24 to 48 hours?"
- **shortReason:** "Recent vaccination or medication is the key temporal discriminator for a post-vaccination reaction versus unrelated allergy."
- **answerType:** `boolean`
- **phase:** `history`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags:** `[]`
- **changesUrgencyIf:** `{ "yes": "Consider urgent evaluation if swelling, hives, or breathing difficulty is present." }`
- **skipIfAnswered:** `[]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners know their pet’s vaccination schedule and recent vet visits.
- **why no diagnosis/treat:** Records timing only; does not diagnose anaphylaxis or prescribe antihistamines.
- **dependencies:** Needs signal `possible_post_vaccine_reaction` (proposed) and red flag `post_vaccine_anaphylaxis` (proposed) for full module routing.

#### (PROPOSED) `injection_site_swelling_check`
- **ownerText:** "Is there a firm lump, heat, or swelling at the injection site, or is the swelling spreading to the face or body?"
- **shortReason:** "Localized injection-site reactions are usually mild, but spreading swelling can signal a systemic reaction."
- **answerType:** `choice`
- **allowedAnswers:** `["Small lump at injection site only", "Warmth / redness at site", "Spreading to face or body", "No swelling", "Not sure"]`
- **phase:** `discriminate`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags (proposed):** `injection_site_abscess`
- **changesUrgencyIf:** `{ "spreading to face or body": "Escalate to urgent evaluation." }`
- **skipIfAnswered:** `["vaccine_recent_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners can palpate and visually inspect the injection site.
- **why no diagnosis/treat:** Describes localization only; does not diagnose cellulitis or prescribe antibiotics.
- **dependencies:** Needs red flag `injection_site_abscess` (proposed).

#### (PROPOSED) `fever_lethargy_post_vax_check`
- **ownerText:** "Is your pet unusually lethargic, warm to the touch, or shivering after the vaccine?"
- **shortReason:** "Systemic signs after vaccination help distinguish a mild immune response from a more serious reaction."
- **answerType:** `boolean`
- **phase:** `discriminate`
- **ownerAnswerability:** 2
- **urgencyImpact:** 2
- **discriminativeValue:** 2
- **reportValue:** 2
- **screensRedFlags:** `[]`
- **changesUrgencyIf:** `{ "yes": "Increase urgency if lethargy is profound or accompanied by vomiting or collapse." }`
- **skipIfAnswered:** `["vaccine_recent_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **safetyNotes:** `["Owners cannot reliably measure temperature; this question captures perceived warmth and behavior change."]`
- **why owner-answerable:** Owners perceive lethargy and warmth subjectively (hence 2 + safety note).
- **why no diagnosis/treat:** Describes perceived systemic state; does not diagnose fever or prescribe antipyretics.
- **dependencies:** None new beyond existing emergency cards.

---

### 3.5 Abdominal Pain (Not GI / Bloat)

**Current blocker:** `blocked_missing_question_cards`, `blocked_missing_red_flags`  
**Existing usable cards:** `bloat_retching_abdomen_check`, `emergency_global_screen`  
**Existing usable red flags:** `distended_abdomen_painful`, `unproductive_retching`, `rapid_onset_distension` (all in bloat context)  
**Existing usable signals:** `possible_abdominal_pain`

#### (PROPOSED) `abdominal_pain_check`
- **ownerText:** "Does your pet yelp, growl, or try to move away when you gently press on the belly or pick them up?"
- **shortReason:** "A pain response to abdominal touch helps confirm visceral pain that may not be accompanied by vomiting or bloating."
- **answerType:** `boolean`
- **phase:** `emergency_screen`
- **ownerAnswerability:** 2
- **urgencyImpact:** 3
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags (proposed):** `severe_abdominal_pain`
- **changesUrgencyIf:** `{ "yes": "Escalate to immediate emergency evaluation." }`
- **skipIfAnswered:** `["emergency_global_screen"]`
- **sourceIds:** `["internal_pending_review"]`
- **safetyNotes:** `["Tell the owner to stop pressing if the pet shows pain; do not encourage repeated palpation."]`
- **why owner-answerable:** Owners pick up their pets daily and can detect a pain response (hence 2 + safety note).
- **why no diagnosis/treat:** Describes behavioral reaction only; does not diagnose pancreatitis, peritonitis, etc.
- **dependencies:** Needs red flag `severe_abdominal_pain` (proposed). Existing signal `possible_abdominal_pain` is sufficient for initial routing.

#### (PROPOSED) `posture_guarding_check`
- **ownerText:** "Is your pet standing with a hunched back, ‘praying’ position with front legs down and rear up, or reluctant to lie down?"
- **shortReason:** "Specific postures are reliable owner-visible signs of abdominal discomfort that help differentiate from musculoskeletal pain."
- **answerType:** `choice`
- **allowedAnswers:** `["Hunched back", "Praying position", "Reluctant to lie down", "Normal posture", "Not sure"]`
- **phase:** `characterize`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags (proposed):** `rigid_abdomen`
- **changesUrgencyIf:** `{ "praying position": "Increase urgency; this posture is strongly associated with significant abdominal pain.", "hunched back": "Increase urgency; sustained hunching suggests visceral pain." }`
- **skipIfAnswered:** `["abdominal_pain_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Posture is a static visual observation requiring no clinical skill.
- **why no diagnosis/treat:** Describes posture only; does not diagnose GDV, pancreatitis, or foreign body obstruction.
- **dependencies:** Needs red flag `rigid_abdomen` (proposed).

#### (PROPOSED) `belly_touch_response_check`
- **ownerText:** "If you very lightly touch the belly, does it feel soft and relaxed, tense / firm, or does your pet react with pain?"
- **shortReason:** "Abdominal wall tension helps an owner distinguish soft belly from a rigid, painful abdomen that needs urgent care."
- **answerType:** `choice`
- **allowedAnswers:** `["Soft and relaxed", "Tense / firm", "Reacts with pain", "Won’t let me touch", "Not sure"]`
- **phase:** `discriminate`
- **ownerAnswerability:** 2
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags (proposed):** `rigid_abdomen`
- **changesUrgencyIf:** `{ "tense / firm": "Increase urgency; a rigid abdomen may indicate peritonitis or obstruction.", "reacts with pain": "Escalate to immediate emergency evaluation." }`
- **skipIfAnswered:** `["abdominal_pain_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **safetyNotes:** `["Advise owner to attempt only once and stop if the pet shows distress."]`
- **why owner-answerable:** Light touch is within owner capability, though interpretation is subjective (hence 2 + safety note).
- **why no diagnosis/treat:** Describes tactile feedback only; does not diagnose or recommend imaging.
- **dependencies:** Needs red flag `rigid_abdomen` (proposed).

---

### 3.6 Wound / Skin Overlap (Trauma Prep)

**Current blocker:** `blocked_missing_question_cards` only
**Existing usable cards:** `skin_location_distribution`, `skin_changes_check`, `skin_exposure_check`, `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`  
**Existing usable red flags:** `large_blood_volume`, `wound_deep_bleeding`  
**Existing usable signals:** `possible_trauma`

#### (PROPOSED) `wound_characterization_check`
- **ownerText:** "What type of wound do you see — a cut, puncture, scrape, or bite? Is there dirt or debris inside it?"
- **shortReason:** "Wound type and contamination status determine urgency and whether the pet needs wound care versus emergency stabilization."
- **answerType:** `choice`
- **allowedAnswers:** `["Cut / laceration", "Puncture", "Scrape / abrasion", "Bite wound", "Foreign body visible", "Not sure"]`
- **phase:** `characterize`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags:** `[]`
- **changesUrgencyIf:** `{ "puncture": "Increase urgency; puncture wounds can trap bacteria deep in tissue.", "foreign body visible": "Escalate to urgent evaluation; do not remove deep foreign bodies at home." }`
- **skipIfAnswered:** `[]`
- **sourceIds:** `["internal_pending_review"]`
- **safetyNotes:** `["Do not advise removal of deeply embedded objects; stabilize and transport."]`
- **why owner-answerable:** Wound morphology is visible to the naked eye.
- **why no diagnosis/treat:** Describes morphology only; explicitly defers foreign-body removal and wound closure to a vet.
- **dependencies:** Uses existing signal `possible_trauma` and existing red flags `large_blood_volume`, `wound_deep_bleeding`.

#### (PROPOSED) `bleeding_volume_check`
- **ownerText:** "How much is the wound bleeding — is it a small smear, a steady drip, or enough to soak through a cloth or bandage within minutes?"
- **shortReason:** "Bleeding rate and volume are the primary owner-observable factors that distinguish minor wounds from hemorrhage emergencies."
- **answerType:** `choice`
- **allowedAnswers:** `["Small smear / spot", "Steady drip", "Soaking through cloth", "Spraying / pulsing", "Bleeding has stopped", "Not sure"]`
- **phase:** `emergency_screen`
- **ownerAnswerability:** 3
- **urgencyImpact:** 3
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags:** `["large_blood_volume", "wound_deep_bleeding"]`
- **changesUrgencyIf:** `{ "soaking through cloth": "Escalate to immediate emergency evaluation.", "spraying / pulsing": "Escalate to immediate emergency evaluation; apply firm pressure if safe and transport immediately." }`
- **skipIfAnswered:** `["emergency_global_screen"]`
- **sourceIds:** `["internal_pending_review"]`
- **safetyNotes:** `["If bleeding is severe, advise firm direct pressure and immediate transport without attempting home treatment."]`
- **why owner-answerable:** Owners can estimate blood volume by observing cloth saturation.
- **why no diagnosis/treat:** Describes volume only; explicitly defers hemostasis techniques beyond basic pressure to emergency care.
- **dependencies:** Uses existing red flags `large_blood_volume`, `wound_deep_bleeding`.

#### (PROPOSED) `laceration_depth_check`
- **ownerText:** "Does the wound appear to go only through the skin, or do you see fat, muscle, or bone underneath?"
- **shortReason:** "Depth of a laceration determines whether the wound can be managed conservatively or needs surgical closure."
- **answerType:** `choice`
- **allowedAnswers:** `["Skin only", "Through skin into fat", "Into muscle", "Bone visible", "Not sure"]`
- **phase:** `discriminate`
- **ownerAnswerability:** 2
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags:** `[]`
- **changesUrgencyIf:** `{ "into muscle": "Increase urgency; deep lacerations often need surgical assessment.", "bone visible": "Escalate to immediate emergency evaluation." }`
- **skipIfAnswered:** `["wound_characterization_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **safetyNotes:** `["Owners may misjudge depth; this is a screening question only."]`
- **why owner-answerable:** Gross depth (skin vs. fat vs. bone) is sometimes visible, though owners may misjudge (hence 2 + safety note).
- **why no diagnosis/treat:** Describes perceived depth only; does not recommend suturing, antibiotics, or sedation.
- **dependencies:** None new beyond existing trauma signal and red flags.

---

### 3.7 Heatstroke / Heat Exposure

**Current blocker:** `blocked_missing_question_cards` only  
**Existing usable cards:** `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`, `breathing_difficulty_check`  
**Existing usable red flags:** `heatstroke_signs`, `brachycephalic_heat`, `collapse`, `breathing_difficulty`, `pale_gums`, `blue_gums`  
**Existing usable signals:** `possible_heat_stroke`, `possible_collapse_or_weakness`, `possible_breathing_difficulty`

> **Status:** This candidate has the strongest existing red-flag and signal support. Adding 3 dedicated question cards would make it **ready to build**.

#### (PROPOSED) `heat_exposure_check`
- **ownerText:** "Was your pet in a hot car, outside in high heat, or exercising strenuously in warm weather within the last few hours?"
- **shortReason:** "Heat exposure history is the critical discriminating factor that separates heatstroke from other causes of collapse or panting."
- **answerType:** `boolean`
- **phase:** `history`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags:** `[]`
- **changesUrgencyIf:** `{ "yes": "Increase urgency if panting, collapse, or altered mentation is present." }`
- **skipIfAnswered:** `[]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners know where their pet has been and whether a hot environment was involved.
- **why no diagnosis/treat:** Records environmental exposure only; does not diagnose heatstroke or prescribe cooling protocols.
- **dependencies:** Uses existing signal `possible_heat_stroke` and existing red flags `heatstroke_signs`, `brachycephalic_heat`.

#### (PROPOSED) `brachycephalic_breed_check`
- **ownerText:** "Is your pet a brachycephalic breed — for example, a Bulldog, Pug, Boxer, Persian cat, or similar short-nosed breed?"
- **shortReason:** "Brachycephalic animals are at significantly higher risk for heat-related respiratory compromise and heatstroke."
- **answerType:** `boolean`
- **phase:** `history`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 2
- **screensRedFlags:** `["brachycephalic_heat"]`
- **changesUrgencyIf:** `{ "yes": "Lower threshold for urgent evaluation if any heat exposure or breathing difficulty is reported." }`
- **skipIfAnswered:** `["heat_exposure_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Breed is known to every owner.
- **why no diagnosis/treat:** Describes breed trait only; does not diagnose brachycephalic airway syndrome or recommend surgery.
- **dependencies:** Uses existing red flag `brachycephalic_heat`.

#### (PROPOSED) `panting_excess_check`
- **ownerText:** "Is your pet panting heavily or drooling excessively while at rest in a cool environment, or does the panting not settle after 10–15 minutes in the shade?"
- **shortReason:** "Excessive panting that does not resolve with rest and cooling is a hallmark owner-observable sign of heat-related distress."
- **answerType:** `boolean`
- **phase:** `emergency_screen`
- **ownerAnswerability:** 3
- **urgencyImpact:** 3
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags:** `["heatstroke_signs"]`
- **changesUrgencyIf:** `{ "yes": "Escalate to immediate emergency evaluation." }`
- **skipIfAnswered:** `["emergency_global_screen", "breathing_difficulty_check"]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Panting and drooling are visible and owners can judge whether they persist after cooling.
- **why no diagnosis/treat:** Describes respiratory effort only; does not diagnose hyperthermia or prescribe active cooling measures.
- **dependencies:** Uses existing red flag `heatstroke_signs` and existing signal `possible_heat_stroke`.

---

### 3.8 Trauma / Bleeding / Wound

**Current blocker:** `blocked_missing_question_cards` only  
**Existing usable cards:** `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`, `breathing_difficulty_check`, `limping_trauma_onset`  
**Existing usable red flags:** `large_blood_volume`, `wound_deep_bleeding`, `collapse`, `unresponsive`, `pale_gums`, `blue_gums`, `breathing_difficulty`  
**Existing usable signals:** `possible_trauma`, `possible_collapse_or_weakness`, `possible_pale_gums`, `possible_blue_gums`, `possible_breathing_difficulty`

> **Status:** This candidate also has strong red-flag and signal support. Adding 3 dedicated question cards (2 shared with §3.6) would make it **ready to build**.

#### (PROPOSED) `trauma_mechanism_check`
- **ownerText:** "What happened — was your pet hit by a vehicle, did they fall from a height, were they bitten by another animal, or was there another type of accident?"
- **shortReason:** "Mechanism of injury helps triage the likelihood of internal damage, fractures, or penetrating wounds."
- **answerType:** `choice`
- **allowedAnswers:** `["Hit by vehicle", "Fall from height", "Bite / attack", "Crush injury", "Unknown / not witnessed", "Other"]`
- **phase:** `history`
- **ownerAnswerability:** 3
- **urgencyImpact:** 2
- **discriminativeValue:** 3
- **reportValue:** 3
- **screensRedFlags:** `[]`
- **changesUrgencyIf:** `{ "hit by vehicle": "Escalate to immediate emergency evaluation even if the pet appears stable.", "fall from height": "Increase urgency; internal injuries may not be visible immediately." }`
- **skipIfAnswered:** `[]`
- **sourceIds:** `["internal_pending_review"]`
- **why owner-answerable:** Owners either witnessed the event or can infer it from the scene.
- **why no diagnosis/treat:** Describes event only; does not diagnose internal bleeding or recommend imaging.
- **dependencies:** Uses existing signal `possible_trauma` and existing red flags.

#### (PROPOSED) `wound_characterization_check`
*(Shared with §3.6 — see §3.6 for full specification.)*
- **Proposed ID:** `wound_characterization_check`
- **Rationale for sharing:** Both trauma and skin-overlap candidates need the same wound-type discriminator. A single card can serve both future modules.

#### (PROPOSED) `bleeding_volume_check`
*(Shared with §3.6 — see §3.6 for full specification.)*
- **Proposed ID:** `bleeding_volume_check`
- **Rationale for sharing:** Both trauma and skin-overlap candidates need the same hemorrhage screen. A single card can serve both future modules.

---

## 4. Deduplicated Proposed Card Inventory

The following 24 unique question cards are proposed:

| # | Proposed ID | Phase | Answer Type | Primary Candidate(s) |
|---|-------------|-------|-------------|----------------------|
| 1 | `eye_discharge_check` | characterize | choice | eye |
| 2 | `eye_swelling_check` | emergency_screen | boolean | eye |
| 3 | `vision_change_check` | characterize | choice | eye |
| 4 | `eye_injury_check` | emergency_screen | boolean | eye |
| 5 | `ear_pain_check` | characterize | boolean | ear |
| 6 | `ear_discharge_check` | discriminate | choice | ear |
| 7 | `head_tilt_check` | characterize | choice | ear |
| 8 | `balance_loss_check` | discriminate | boolean | ear |
| 9 | `appetite_change_check` | characterize | choice | appetite |
| 10 | `weight_loss_check` | timeline | choice | appetite |
| 11 | `polydipsia_check` | characterize | boolean | appetite |
| 12 | `vaccine_recent_check` | history | boolean | post-vax |
| 13 | `injection_site_swelling_check` | discriminate | choice | post-vax |
| 14 | `fever_lethargy_post_vax_check` | discriminate | boolean | post-vax |
| 15 | `abdominal_pain_check` | emergency_screen | boolean | abdomen |
| 16 | `posture_guarding_check` | characterize | choice | abdomen |
| 17 | `belly_touch_response_check` | discriminate | choice | abdomen |
| 18 | `wound_characterization_check` | characterize | choice | wound / trauma |
| 19 | `bleeding_volume_check` | emergency_screen | choice | wound / trauma |
| 20 | `laceration_depth_check` | discriminate | choice | wound / trauma |
| 21 | `heat_exposure_check` | history | boolean | heatstroke |
| 22 | `brachycephalic_breed_check` | history | boolean | heatstroke |
| 23 | `panting_excess_check` | emergency_screen | boolean | heatstroke |
| 24 | `trauma_mechanism_check` | history | choice | trauma |

The table above lists each proposed ID once. Shared usage across wound/skin overlap and trauma is reflected in the "Primary Candidate(s)" column, but the deduplicated proposed-card total remains **24**.

---

## 5. Readiness After Proposed Additions

| Candidate | Cards After Proposal | Red Flags After Proposal | Signals After Proposal | Readiness |
|-----------|---------------------|--------------------------|------------------------|-----------|
| eye / vision / discharge | 4 new + 1 generic | needs 4 new | needs 2 new | **blocked** |
| ear / head-tilt / balance | 4 new + 2 existing | needs 2 new | needs 1 new | **blocked** |
| appetite / weight-loss / drinking-more | 3 new + 1 generic | needs 3 new | needs 1 new | **blocked** |
| post-vaccination reaction | 3 new + 4 existing | needs 2 new | needs 1 new | **blocked** |
| abdominal pain (not GI/bloat) | 3 new + 2 existing | needs 2 new | 1 existing | **blocked** |
| wound / skin overlap | 3 new + 6 existing | 2 existing | 1 existing | **ready** |
| heatstroke / heat exposure | 3 new + 4 existing | 2 existing + 4 existing generics | 1 existing + 2 existing generics | **ready** |
| trauma / bleeding / wound | 1 new + 2 shared + 5 existing | 2 existing + 5 existing generics | 1 existing + 4 existing generics | **ready** |

**Ready candidates after this pack:** 3 (wound/skin overlap, heatstroke, trauma).  
**Still blocked:** 5 (eye, ear, appetite, post-vax, abdomen).

---

## 6. Dependencies on Red Flags & Signals

### 6.1 New red flags needed (proposed, not registered)
| Proposed Red Flag | Needed By Cards |
|-------------------|-----------------|
| `severe_eye_discharge` | `eye_discharge_check` |
| `eye_protrusion` | `eye_swelling_check` |
| `eye_injury` | `eye_injury_check` |
| `sudden_blindness` | `vision_change_check` |
| `vestibular_event` | `head_tilt_check`, `balance_loss_check` |
| `ear_infection_severe` | future ear module stop-conditions |
| `anorexia_prolonged` | `appetite_change_check` |
| `rapid_weight_loss` | `weight_loss_check` |
| `polyuria_polydipsia` | `polydipsia_check` |
| `post_vaccine_anaphylaxis` | future post-vax module stop-conditions |
| `injection_site_abscess` | `injection_site_swelling_check` |
| `severe_abdominal_pain` | `abdominal_pain_check` |
| `rigid_abdomen` | `posture_guarding_check`, `belly_touch_response_check` |

### 6.2 New signals needed (proposed, not registered)
| Proposed Signal | Needed By Module |
|-----------------|------------------|
| `possible_eye_emergency` | eye module |
| `possible_vision_loss` | eye module |
| `possible_ear_emergency` | ear module |
| `possible_vestibular_attack` | ear module |
| `possible_systemic_illness` | appetite module |
| `possible_post_vaccine_reaction` | post-vax module |

### 6.3 Existing red flags & signals already sufficient
- **Heatstroke:** `heatstroke_signs`, `brachycephalic_heat`, `collapse`, `breathing_difficulty`, `pale_gums`, `blue_gums` + signals `possible_heat_stroke`, `possible_collapse_or_weakness`, `possible_breathing_difficulty`.
- **Trauma:** `large_blood_volume`, `wound_deep_bleeding`, `collapse`, `unresponsive`, `pale_gums`, `blue_gums`, `breathing_difficulty` + signals `possible_trauma`, `possible_collapse_or_weakness`, `possible_pale_gums`, `possible_blue_gums`, `possible_breathing_difficulty`.
- **Wound / skin overlap:** `large_blood_volume`, `wound_deep_bleeding` + signal `possible_trauma`.

---

## 7. Safety & Clinical Policy Check

### 7.1 No diagnosis / treatment language
All proposed `ownerText` and `shortReason` strings were scanned against the forbidden list:
`diagnos`, `treat`, `prescri`, `surgery`, `prognosis`, `disease`, `condition`, `cure`, `heal`, `antibiotic`, `steroid`, `vaccine` (as a treatment claim; `vaccine` appears only as a temporal exposure in `vaccine_recent_check`).

**Finding:** Zero violations.

### 7.2 Owner-answerability justification
Every proposed card has `ownerAnswerability >= 2`. Cards rated `2` include a `safetyNotes` entry explaining why the owner observation is subjective or approximate (e.g., temperature perception, wound depth, belly tension). No card requires clinical instrumentation.

### 7.3 Emergency-screen urgency
All proposed emergency-screen cards (`eye_swelling_check`, `eye_injury_check`, `abdominal_pain_check`, `bleeding_volume_check`, `panting_excess_check`) have `urgencyImpact = 3` and `phase = "emergency_screen"`, matching existing registry conventions.

### 7.4 No runtime files modified
This proposal is documentation only. No changes were made to:
- `question-card-registry.ts`
- `emergency-red-flags.ts`
- `clinical-signal-detector.ts`
- `complaint-modules/index.ts`
- Any complaint-module definition file
- Any retrieval, citation, or vet-knowledge runtime file

---

## 8. Recommendations for Next Sprint

1. **Highest priority:** Implement `heatstroke_heat_exposure` and `trauma_bleeding_wound` complaint modules first. They require only the proposed question cards; red flags and signals are already in place.
2. **Second priority:** Implement the 3 wound/skin question cards (`wound_characterization_check`, `bleeding_volume_check`, `laceration_depth_check`) because they unlock both a trauma module and reduce skin overlap risk.
3. **Third priority:** Eye and ear modules are high clinical value but require the most new schema additions (cards + red flags + signals). Schedule them after the trauma/heatstroke modules land.
4. **Abdomen module:** Consider merging with GI module rather than creating a standalone module, because `possible_abdominal_pain` already routes correctly to GI stop conditions. If a standalone module is desired, add the 3 proposed abdomen cards plus 2 red flags.
5. **Post-vax module:** Can partially route through `skin_itching_allergy` today using existing emergency cards. The 3 proposed post-vax cards are primarily for temporal discrimination and injection-site localization.

---

*Proposal complete. No files modified. All IDs marked as proposed only.*
