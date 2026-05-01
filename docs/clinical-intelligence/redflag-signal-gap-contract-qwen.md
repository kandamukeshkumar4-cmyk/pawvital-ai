# Red-Flag and Clinical-Signal Gap Contract (VET-1430Q)

**Agent:** Qwen 3.6 Plus  
**Branch:** qwen/vet-1430q-redflag-signal-gap-contract  
**Date:** 2026-05-01  
**Scope:** Contract/validation only — no new red flags, signals, modules, or runtime changes.

---

## 1. Purpose

This contract documents which missing red flags and clinical signals are required before each blocked complaint-module candidate (identified by VET-1424K) can be safely implemented. It is a **validation-only** artifact: tests verify registry consistency, proposed-ID naming, and forbidden-language absence.

---

## 2. Canonical Registries Referenced

| Registry | File | Count |
|----------|------|-------|
| Emergency red flags | `src/lib/clinical-intelligence/emergency-red-flags.ts` | 37 IDs |
| Clinical signals | `src/lib/clinical-intelligence/clinical-signal-detector.ts` | 14 patterns |
| Question cards | `src/lib/clinical-intelligence/question-card-registry.ts` | 19 cards |
| Complaint modules | `src/lib/clinical-intelligence/complaint-modules/index.ts` | 9 modules |

---

## 3. Blocked Candidates

### 3.1 eye_vision_discharge

| Category | Detail |
|----------|--------|
| **Existing red flags** | None |
| **Existing signals** | None |
| **Proposed red flags** | `proposed_eye_injury`, `proposed_sudden_blindness`, `proposed_eye_protrusion`, `proposed_severe_eye_discharge` |
| **Proposed signals** | `proposed_possible_eye_emergency`, `proposed_possible_vision_loss` |
| **Missing question cards** | `eye_discharge_check`, `eye_swelling_check`, `vision_change_check`, `eye_injury_check` |
| **Can raise urgency** | Yes (via emergency_global_screen fallback) |
| **Can become explicit answer** | No |
| **Required confirmation question** | `emergency_global_screen` |
| **Unsafe overlap risks** | Without eye-specific red flags, eye complaints may silently route to `respiratory_distress` or `seizure_collapse_neuro` via generic collapse/breathing flags. |
| **Blocked reasons** | `missing_question_cards`, `missing_red_flags`, `missing_signals` |

### 3.2 ear_head_tilt_balance

| Category | Detail |
|----------|--------|
| **Existing red flags** | None |
| **Existing signals** | `possible_neuro_emergency`, `possible_collapse_or_weakness` |
| **Proposed red flags** | `proposed_ear_infection_severe`, `proposed_vestibular_event` |
| **Proposed signals** | `proposed_possible_ear_emergency`, `proposed_possible_vestibular_attack` |
| **Missing question cards** | `ear_pain_check`, `ear_discharge_check`, `head_tilt_check`, `balance_loss_check` |
| **Can raise urgency** | Yes |
| **Can become explicit answer** | No |
| **Required confirmation question** | `seizure_neuro_check` |
| **Unsafe overlap risks** | Head-tilt currently routes to `seizure_collapse_neuro` via `possible_neuro_emergency` signal; dedicated ear module without ear-specific red flags would mis-route inner-ear infections as neuro emergencies. |
| **Blocked reasons** | `missing_question_cards`, `missing_red_flags`, `missing_signals` |

### 3.3 appetite_weight_loss_drinking

| Category | Detail |
|----------|--------|
| **Existing red flags** | None |
| **Existing signals** | None |
| **Proposed red flags** | `proposed_anorexia_prolonged`, `proposed_rapid_weight_loss`, `proposed_polyuria_polydipsia` |
| **Proposed signals** | `proposed_possible_systemic_illness` |
| **Missing question cards** | `appetite_change_check`, `weight_loss_check`, `polydipsia_check`, `duration_symptoms_check` |
| **Can raise urgency** | Yes |
| **Can become explicit answer** | No |
| **Required confirmation question** | `emergency_global_screen` |
| **Unsafe overlap risks** | `gi_vomiting_diarrhea` already catches "not eating" and "off food" via triggers; isolated appetite module without dedicated cards would produce hollow discriminative power. |
| **Blocked reasons** | `missing_question_cards`, `missing_red_flags`, `missing_signals` |

### 3.4 post_vaccination_reaction

| Category | Detail |
|----------|--------|
| **Existing red flags** | `face_swelling`, `hives_widespread`, `allergic_with_breathing`, `collapse`, `breathing_difficulty` |
| **Existing signals** | None |
| **Proposed red flags** | `proposed_post_vaccine_anaphylaxis`, `proposed_injection_site_abscess` |
| **Proposed signals** | `proposed_possible_post_vaccine_reaction` |
| **Missing question cards** | `vaccine_recent_check`, `injection_site_swelling_check`, `fever_lethargy_post_vax_check` |
| **Can raise urgency** | Yes |
| **Can become explicit answer** | No |
| **Required confirmation question** | `skin_emergency_allergy_screen` |
| **Unsafe overlap risks** | Post-vax reaction is clinically distinct from generic allergy due to temporal onset link; without `vaccine_recent_check`, module loses urgency context and may duplicate `skin_itching_allergy` routing. |
| **Blocked reasons** | `missing_question_cards`, `missing_red_flags` |

### 3.5 abdominal_pain_standalone

| Category | Detail |
|----------|--------|
| **Existing red flags** | `distended_abdomen_painful`, `unproductive_retching`, `rapid_onset_distension` |
| **Existing signals** | `possible_abdominal_pain` |
| **Proposed red flags** | `proposed_severe_abdominal_pain`, `proposed_rigid_abdomen` |
| **Proposed signals** | None |
| **Missing question cards** | `abdominal_pain_check`, `posture_guarding_check`, `belly_touch_response_check` |
| **Can raise urgency** | Yes |
| **Can become explicit answer** | No |
| **Required confirmation question** | `bloat_retching_abdomen_check` |
| **Unsafe overlap risks** | `possible_abdominal_pain` signal already routes to emergency via `gi_vomiting_diarrhea` stop conditions; standalone module risks duplicate emergency routing with GI and `bloat_gdv`. |
| **Blocked reasons** | `missing_question_cards`, `missing_red_flags` |

### 3.6 wound_skin_overlap

| Category | Detail |
|----------|--------|
| **Existing red flags** | `large_blood_volume`, `wound_deep_bleeding` |
| **Existing signals** | `possible_trauma` |
| **Proposed red flags** | None |
| **Proposed signals** | None |
| **Missing question cards** | `wound_characterization_check`, `bleeding_volume_check`, `laceration_depth_check` |
| **Can raise urgency** | Yes |
| **Can become explicit answer** | No |
| **Required confirmation question** | `emergency_global_screen` |
| **Unsafe overlap risks** | `skin_itching_allergy` handles chronic dermatologic issues; future `trauma_bleeding_wound` module would overlap when text contains both "skin" and "wound". No dedicated question card exists for wound age/depth/contamination to disambiguate. |
| **Blocked reasons** | `missing_question_cards` |

### 3.7 heatstroke_heat_exposure

| Category | Detail |
|----------|--------|
| **Existing red flags** | `heatstroke_signs`, `brachycephalic_heat`, `collapse`, `breathing_difficulty`, `pale_gums`, `blue_gums` |
| **Existing signals** | `possible_heat_stroke`, `possible_collapse_or_weakness`, `possible_breathing_difficulty` |
| **Proposed red flags** | None |
| **Proposed signals** | None |
| **Missing question cards** | `heat_exposure_check`, `brachycephalic_breed_check`, `panting_excess_check` |
| **Can raise urgency** | Yes |
| **Can become explicit answer** | No |
| **Required confirmation question** | `emergency_global_screen` |
| **Unsafe overlap risks** | Could partially route through `respiratory_distress` via `breathing_difficulty`; without heat-specific question card, module would have no characterize/timeline questions beyond generics. |
| **Blocked reasons** | `missing_question_cards` |

### 3.8 trauma_bleeding_wound

| Category | Detail |
|----------|--------|
| **Existing red flags** | `large_blood_volume`, `wound_deep_bleeding`, `collapse`, `unresponsive`, `pale_gums`, `blue_gums`, `breathing_difficulty` |
| **Existing signals** | `possible_trauma`, `possible_collapse_or_weakness`, `possible_pale_gums`, `possible_blue_gums`, `possible_breathing_difficulty` |
| **Proposed red flags** | None |
| **Proposed signals** | None |
| **Missing question cards** | `wound_characterization_check`, `bleeding_volume_check`, `trauma_mechanism_check` |
| **Can raise urgency** | Yes |
| **Can become explicit answer** | No |
| **Required confirmation question** | `emergency_global_screen` |
| **Unsafe overlap risks** | Could partially route through `limping_mobility_pain` via trauma triggers; without trauma-specific question cards, module would have poor characterization and handoff detail. |
| **Blocked reasons** | `missing_question_cards` |

---

## 4. Summary

### 4.1 Existing red flags referenced

| Red Flag | Candidates Using It |
|----------|---------------------|
| `heatstroke_signs` | heatstroke_heat_exposure |
| `brachycephalic_heat` | heatstroke_heat_exposure |
| `collapse` | heatstroke_heat_exposure, trauma_bleeding_wound, post_vaccination_reaction |
| `breathing_difficulty` | heatstroke_heat_exposure, trauma_bleeding_wound, post_vaccination_reaction |
| `pale_gums` | heatstroke_heat_exposure, trauma_bleeding_wound |
| `blue_gums` | heatstroke_heat_exposure, trauma_bleeding_wound |
| `large_blood_volume` | wound_skin_overlap, trauma_bleeding_wound |
| `wound_deep_bleeding` | wound_skin_overlap, trauma_bleeding_wound |
| `unresponsive` | trauma_bleeding_wound |
| `face_swelling` | post_vaccination_reaction |
| `hives_widespread` | post_vaccination_reaction |
| `allergic_with_breathing` | post_vaccination_reaction |
| `distended_abdomen_painful` | abdominal_pain_standalone |
| `unproductive_retching` | abdominal_pain_standalone |
| `rapid_onset_distension` | abdominal_pain_standalone |

### 4.2 Existing signals referenced

| Signal | Candidates Using It |
|--------|---------------------|
| `possible_heat_stroke` | heatstroke_heat_exposure |
| `possible_collapse_or_weakness` | heatstroke_heat_exposure, trauma_bleeding_wound, ear_head_tilt_balance |
| `possible_breathing_difficulty` | heatstroke_heat_exposure, trauma_bleeding_wound |
| `possible_trauma` | wound_skin_overlap, trauma_bleeding_wound |
| `possible_pale_gums` | trauma_bleeding_wound |
| `possible_blue_gums` | trauma_bleeding_wound |
| `possible_neuro_emergency` | ear_head_tilt_balance |
| `possible_abdominal_pain` | abdominal_pain_standalone |

### 4.3 Proposed red flags

| Proposed ID | Candidate |
|-------------|-----------|
| `proposed_eye_injury` | eye_vision_discharge |
| `proposed_sudden_blindness` | eye_vision_discharge |
| `proposed_eye_protrusion` | eye_vision_discharge |
| `proposed_severe_eye_discharge` | eye_vision_discharge |
| `proposed_ear_infection_severe` | ear_head_tilt_balance |
| `proposed_vestibular_event` | ear_head_tilt_balance |
| `proposed_anorexia_prolonged` | appetite_weight_loss_drinking |
| `proposed_rapid_weight_loss` | appetite_weight_loss_drinking |
| `proposed_polyuria_polydipsia` | appetite_weight_loss_drinking |
| `proposed_post_vaccine_anaphylaxis` | post_vaccination_reaction |
| `proposed_injection_site_abscess` | post_vaccination_reaction |
| `proposed_severe_abdominal_pain` | abdominal_pain_standalone |
| `proposed_rigid_abdomen` | abdominal_pain_standalone |

### 4.4 Proposed signals

| Proposed ID | Candidate |
|-------------|-----------|
| `proposed_possible_eye_emergency` | eye_vision_discharge |
| `proposed_possible_vision_loss` | eye_vision_discharge |
| `proposed_possible_ear_emergency` | ear_head_tilt_balance |
| `proposed_possible_vestibular_attack` | ear_head_tilt_balance |
| `proposed_possible_systemic_illness` | appetite_weight_loss_drinking |
| `proposed_possible_post_vaccine_reaction` | post_vaccination_reaction |

### 4.5 Blocked candidates summary

| Candidate | Primary blockers |
|-----------|------------------|
| eye_vision_discharge | missing question cards, missing red flags, missing signals |
| ear_head_tilt_balance | missing question cards, missing red flags, missing signals |
| appetite_weight_loss_drinking | missing question cards, missing red flags, missing signals |
| post_vaccination_reaction | missing question cards, missing red flags |
| abdominal_pain_standalone | missing question cards, missing red flags |
| wound_skin_overlap | missing question cards |
| heatstroke_heat_exposure | missing question cards |
| trauma_bleeding_wound | missing question cards |

### 4.6 Candidates safe after schema expansion

After adding the required question cards, red flags, and signals:

| Candidate | Safe to build after expansion? | Notes |
|-----------|-------------------------------|-------|
| heatstroke_heat_exposure | Yes | Strong existing red flag and signal support; only needs 3 question cards. |
| trauma_bleeding_wound | Yes | Strong existing red flag and signal support; only needs 3 question cards. |
| wound_skin_overlap | Yes | Existing red flags and signals sufficient; needs wound characterization cards. |
| post_vaccination_reaction | Conditional | Needs `vaccine_recent_check` for temporal discriminator; otherwise overlaps with skin_itching_allergy. |
| abdominal_pain_standalone | Conditional | High overlap risk with GI and bloat_gdv; needs careful stop-condition design. |
| ear_head_tilt_balance | Conditional | Needs ear-specific red flags to avoid mis-routing as neuro emergency. |
| eye_vision_discharge | No (largest gap) | Requires largest ID addition (4 cards, 4 red flags, 2 signals). |
| appetite_weight_loss_drinking | No (largest gap) | Requires largest ID addition (4 cards, 3 red flags, 1 signal); low urgency profile. |

---

## 5. Test Contract

The test file `tests/clinical-intelligence/redflag-signal-gap-contract.test.ts` validates:

1. Every referenced existing red flag exists in `EMERGENCY_RED_FLAG_IDS`.
2. Every referenced existing signal exists in `clinical-signal-detector.ts` SIGNAL_PATTERNS.
3. All proposed IDs are clearly marked with `proposed_` prefix.
4. No proposed ID collides with an existing ID.
5. No candidate text contains forbidden diagnosis/treatment/medication/dosage/home-care language.
6. No candidate is marked `ready` if any required red flag, signal, or question card is missing.
7. All candidates document unsafe overlap risks.
8. All candidates have a required confirmation question dependency.

---

## 6. Constraints

- **Contract only.** No runtime files modified.
- No new red flags added to `emergency-red-flags.ts`.
- No new signals added to `clinical-signal-detector.ts`.
- No new modules added to `complaint-modules/`.
- No changes to source maps or retrieval runtime.
- No changes to symptom-chat, triage-engine, clinical-matrix, symptom-memory, planner, emergency sentinel behavior, or RAG runtime.
- No diagnosis/treatment wording in any contract text.

---

*Contract complete. No runtime files modified.*
