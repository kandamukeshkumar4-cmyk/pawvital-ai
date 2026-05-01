# Complaint Module Registry Gap Audit (VET-1424K)

**Agent:** Kimi 2.6  
**Branch:** kimi/vet-1424k-complaint-module-registry-gap-audit  
**Date:** 2026-05-01  
**Scope:** Audit only — no new modules added, no protected runtime files touched.

---

## 1. Current Registered Modules (9 total)

| # | Module ID | Display Name | Pack |
|---|-----------|--------------|------|
| 1 | `skin_itching_allergy` | Skin Itching / Allergy | MVP |
| 2 | `gi_vomiting_diarrhea` | GI Vomiting / Diarrhea | MVP |
| 3 | `limping_mobility_pain` | Limping / Mobility Pain | MVP |
| 4 | `respiratory_distress` | Respiratory Distress / Coughing / Breathing Difficulty | Pack 2 |
| 5 | `seizure_collapse_neuro` | Seizure / Collapse / Neurologic Emergency | Pack 2 |
| 6 | `urinary_obstruction` | Urinary Obstruction / Urination Problems | Pack 2 |
| 7 | `toxin_poisoning_exposure` | Toxin / Poisoning / Exposure | Pack 3 |
| 8 | `bloat_gdv` | Bloat / GDV / Abdominal Distension | Gap Pack |
| 9 | `collapse_weakness` | Collapse / Weakness / Fainting | Gap Pack |

**Note:** The task brief referenced 11 modules after heatstroke and trauma landed. At the time of this audit, `heatstroke_heat_exposure` and `trauma_bleeding_wound` are **not yet present** in `complaint-modules/index.ts` or in the file system. They are evaluated as candidate gaps in §8.7 and §8.8.

---

## 2. Trigger Uniqueness & Risky Short Triggers

### 2.1 Unique triggers per module
All nine modules have triggers that are unique at the word-boundary level (verified by `findComplaintModulesForText` boundary-aware matching). No two modules share an identical trigger word.

### 2.2 Known intentional clinical overlaps
Three triggers appear in more than one module by design:

| Trigger | Modules | Clinical justification |
|---------|---------|------------------------|
| `retching` | `gi_vomiting_diarrhea`, `bloat_gdv` | Retching is an emergency screen for both GI upset and bloat/GDV; both modules need to fire so the emergency screen can differentiate. |
| `collapse` | `seizure_collapse_neuro`, `collapse_weakness` | Collapse can indicate neurologic or cardiovascular etiology; multi-module firing is expected. |
| `fainted` | `seizure_collapse_neuro`, `collapse_weakness` | Same rationale as collapse (syncope vs. seizure). |

### 2.3 Risky short triggers audited
| Module | Short Trigger | Length | Boundary-safe? | Evidence |
|--------|--------------|--------|----------------|----------|
| `seizure_collapse_neuro` | `fit` | 3 | Yes | Test rejects `"benefit"` |
| `urinary_obstruction` | `uti` | 3 | Yes | Test rejects `"cuticle"` |
| `skin_itching_allergy` | `skin` | 4 | Yes | No false-positive test added, but `\bskin\b` is safe |

---

## 3. Emergency Screen Question IDs Validity

All nine modules reference only real question-card IDs that exist in `question-card-registry.ts`.

**Registry count:** 19 question cards  
**Modules with 100% valid emergencyScreenQuestionIds:** 9/9

| Module | Emergency Question IDs | Status |
|--------|------------------------|--------|
| skin | `skin_emergency_allergy_screen`, `breathing_difficulty_check`, `collapse_weakness_check`, `gum_color_check` | Valid |
| gi | `gi_blood_check`, `gi_keep_water_down_check`, `bloat_retching_abdomen_check`, `toxin_exposure_check`, `collapse_weakness_check`, `gum_color_check` | Valid |
| limping | `limping_weight_bearing`, `limping_trauma_onset`, `collapse_weakness_check`, `gum_color_check` | Valid |
| respiratory | `breathing_difficulty_check`, `gum_color_check`, `collapse_weakness_check`, `emergency_global_screen` | Valid |
| seizure | `seizure_neuro_check`, `collapse_weakness_check`, `gum_color_check`, `emergency_global_screen` | Valid |
| urinary | `urinary_blockage_check`, `gum_color_check`, `collapse_weakness_check`, `emergency_global_screen` | Valid |
| toxin | `toxin_exposure_check`, `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`, `bloat_retching_abdomen_check` | Valid |
| bloat | `bloat_retching_abdomen_check`, `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check` | Valid |
| collapse | `collapse_weakness_check`, `emergency_global_screen`, `gum_color_check`, `breathing_difficulty_check` | Valid |

---

## 4. Stop-Condition Red Flag Validity

All red-flag IDs referenced in `stopConditions` are either:
- Listed in `EMERGENCY_RED_FLAG_IDS` (canonical), **or**
- Emitted by a question card in `question-card-registry.ts` (real emitted flags).

**Canonical red flags:** 37 ids  
**Emitted red flags:** 23 ids (from 19 cards)  
**Total valid red-flag pool:** 60 ids

### 4.1 Red flags used by module
| Module | Canonical flags used | Emitted flags used | Invalid flags |
|--------|---------------------|--------------------|---------------|
| skin | `face_swelling`, `breathing_difficulty`, `collapse`, `pale_gums`, `blue_gums` | — | 0 |
| gi | `collapse`, `pale_gums`, `blue_gums` | `hematemesis`, `melena`, `hematochezia`, `gastric_dilatation_volvulus`, `unproductive_retching`, `unable_to_retain_water`, `persistent_vomiting` | 0 |
| limping | `collapse`, `pale_gums`, `blue_gums` | `non_weight_bearing`, `post_trauma_lameness` | 0 |
| respiratory | `breathing_difficulty`, `collapse`, `pale_gums`, `blue_gums` | — | 0 |
| seizure | `seizure_activity`, `seizure_prolonged`, `collapse`, `unresponsive` | — | 0 |
| urinary | `urinary_blockage`, `no_urine_24h` | — | 0 |
| toxin | `toxin_confirmed`, `rat_poison_confirmed`, `toxin_with_symptoms`, `collapse`, `vomit_blood` | — | 0 |
| bloat | `unproductive_retching`, `rapid_onset_distension`, `bloat_with_restlessness`, `distended_abdomen_painful`, `collapse`, `pale_gums` | `gastric_dilatation_volvulus` | 0 |
| collapse | `collapse`, `unresponsive`, `pale_gums`, `blue_gums`, `breathing_difficulty` | — | 0 |

**Finding:** Zero invalid red-flag references across all nine modules.

---

## 5. Stop-Condition Signal Validity

All `ifAnySignalPresent` entries reference real signal IDs defined in `clinical-signal-detector.ts`.

**Available signals:** 14 ids
- `possible_abdominal_pain`
- `possible_nonproductive_retching`
- `possible_pale_gums`
- `possible_blue_gums`
- `possible_breathing_difficulty`
- `possible_collapse_or_weakness`
- `possible_urinary_obstruction`
- `toxin_exposure`
- `possible_heat_stroke`
- `possible_neuro_emergency`
- `possible_trauma`
- `possible_bloat_gdv`
- `possible_bloody_vomit`
- `possible_bloody_diarrhea`

### 5.1 Signals used by module
| Module | Signals used | Invalid signals |
|--------|-------------|-----------------|
| skin | `possible_nonproductive_retching`, `possible_bloody_vomit`, `toxin_exposure` | 0 |
| gi | `toxin_exposure`, `possible_abdominal_pain` | 0 |
| respiratory | `possible_breathing_difficulty` | 0 |
| seizure | `possible_neuro_emergency`, `possible_collapse_or_weakness` | 0 |
| urinary | `possible_urinary_obstruction` | 0 |
| toxin | `toxin_exposure` | 0 |
| bloat | `possible_bloat_gdv`, `possible_nonproductive_retching` | 0 |
| collapse | `possible_collapse_or_weakness`, `possible_pale_gums`, `possible_blue_gums` | 0 |

**Finding:** Zero invalid signal references.

---

## 6. No Diagnosis / Treatment Language

All nine modules were scanned for forbidden terms:
- `diagnos`, `treat`, `prescri`, `surgery`, `prognosis`, `disease`, `condition`, `cure`, `heal`, `antibiotic`, `steroid`, `vaccine`

**Finding:** Zero violations. Existing tests (`complaint-modules-mvp.test.ts` describe block 12 and subsequent pack tests) confirm this continuously.

---

## 7. Vet-Knowledge Mapping Coverage

All nine registered module IDs appear in `complaint-source-map.ts`.

| Module ID | Mapped? | Retrieval Intent | Citation Intent |
|-----------|---------|------------------|-----------------|
| `skin_itching_allergy` | Yes | `internal_reasoning` | `owner_visible_citation` |
| `gi_vomiting_diarrhea` | Yes | `internal_reasoning` | `owner_visible_citation` |
| `limping_mobility_pain` | Yes | `internal_reasoning` | `owner_visible_citation` |
| `respiratory_distress` | Yes | `internal_reasoning` | `owner_visible_citation` |
| `seizure_collapse_neuro` | Yes | `internal_reasoning` | `owner_visible_citation` |
| `urinary_obstruction` | Yes | `internal_reasoning` | `none` |
| `toxin_poisoning_exposure` | Yes | `internal_reasoning` | `owner_visible_citation` |
| `bloat_gdv` | Yes | `internal_reasoning` | `owner_visible_citation` |
| `collapse_weakness` | Yes | `internal_reasoning` | `owner_visible_citation` |

**Finding:** 100% coverage. No orphaned modules.

---

## 8. Candidate Gap Evaluation

### 8.1 eye / vision / discharge
- **Available real question cards:** `emergency_global_screen` only (generic). No eye-specific cards exist.
- **Available real red flags:** None eye-specific.
- **Available real clinical signals:** None eye-specific.
- **Missing IDs:**
  - Question cards: `eye_discharge_check`, `eye_swelling_check`, `vision_change_check`, `eye_injury_check`
  - Red flags: `eye_injury`, `sudden_blindness`, `eye_protrusion`, `severe_eye_discharge`
  - Signals: `possible_eye_emergency`, `possible_vision_loss`
- **Recommendation:** `blocked_missing_question_cards` + `blocked_missing_red_flags` + `blocked_missing_signals`
- **Rationale:** Building an eye module with only `emergency_global_screen` would provide almost zero discriminative value and no eye-specific safety routing. Unsafe without schema expansion.

### 8.2 ear / head-tilt / balance
- **Available real question cards:** `emergency_global_screen`, `seizure_neuro_check` (indirectly covers head-tilt as neurologic).
- **Available real red flags:** None ear-specific.
- **Available real clinical signals:** `possible_neuro_emergency` (matches `"tilted head"` and `"circling"`), `possible_collapse_or_weakness`.
- **Missing IDs:**
  - Question cards: `ear_pain_check`, `ear_discharge_check`, `head_tilt_check`, `balance_loss_check`
  - Red flags: `ear_infection_severe`, `vestibular_event`
  - Signals: `possible_ear_emergency`, `possible_vestibular_attack`
- **Recommendation:** `blocked_missing_question_cards` + `blocked_missing_red_flags` + `blocked_missing_signals`
- **Rationale:** Head-tilt currently routes to `seizure_collapse_neuro` via `possible_neuro_emergency`. A dedicated ear module would need ear-specific cards and red flags to avoid mis-routing inner-ear infections as neuro emergencies.

### 8.3 appetite / weight-loss / drinking-more
- **Available real question cards:** `emergency_global_screen` only.
- **Available real red flags:** None appetite/weight-specific.
- **Available real clinical signals:** None appetite/weight-specific.
- **Missing IDs:**
  - Question cards: `appetite_change_check`, `weight_loss_check`, `polydipsia_check`, `duration_symptoms_check`
  - Red flags: `anorexia_prolonged`, `rapid_weight_loss`, `polyuria_polydipsia`
  - Signals: `possible_systemic_illness`
- **Recommendation:** `blocked_missing_question_cards` + `blocked_missing_red_flags` + `blocked_missing_signals`
- **Rationale:** `gi_vomiting_diarrhea` already catches `"not eating"` and `"off food"` via triggers, but there is no module for isolated appetite/weight/drinking changes. Building one without dedicated cards would produce a hollow module with no discriminative power.

### 8.4 post-vaccination reaction
- **Available real question cards:** `skin_emergency_allergy_screen` (mentions vaccine as a trigger context), `emergency_global_screen`, `breathing_difficulty_check`, `collapse_weakness_check`.
- **Available real red flags:** `face_swelling`, `hives_widespread`, `allergic_with_breathing`, `collapse`, `breathing_difficulty`.
- **Available real clinical signals:** None vaccine-specific.
- **Missing IDs:**
  - Question cards: `vaccine_recent_check`, `injection_site_swelling_check`, `fever_lethargy_post_vax_check`
  - Red flags: `post_vaccine_anaphylaxis`, `injection_site_abscess`
  - Signals: `possible_post_vaccine_reaction`
- **Recommendation:** `blocked_missing_question_cards` + `blocked_missing_red_flags`
- **Rationale:** A post-vax reaction is clinically distinct from generic allergy because onset is temporally linked to a vaccine. Without a `vaccine_recent_check` question card, the module cannot capture the critical timeline discriminator. Could partially route through `skin_itching_allergy` today, but that loses urgency context.

### 8.5 pain / abdomen not already covered by GI / bloat
- **Available real question cards:** `bloat_retching_abdomen_check` (covers swollen/hard belly + retching), `emergency_global_screen`.
- **Available real red flags:** `distended_abdomen_painful` (in bloat module context), `unproductive_retching`, `rapid_onset_distension`.
- **Available real clinical signals:** `possible_abdominal_pain`.
- **Missing IDs:**
  - Question cards: `abdominal_pain_check`, `posture_guarding_check`, `belly_touch_response_check`
  - Red flags: `severe_abdominal_pain`, `rigid_abdomen`, `rebound_pain`
  - Signals: Already has `possible_abdominal_pain`; sufficient for emergency routing, but not for characterization.
- **Recommendation:** `blocked_missing_question_cards` + `blocked_missing_red_flags`
- **Rationale:** `possible_abdominal_pain` signal correctly routes to emergency via GI module stop conditions. However, a standalone abdominal-pain module would need cards to characterize the pain (onset, localization, response to touch) that do not exist. Overlap with GI/bloat is high; risk of duplicate emergency routing.

### 8.6 wound / skin issue overlap with trauma / bleeding
- **Available real question cards:** `skin_location_distribution`, `skin_changes_check`, `skin_exposure_check`, `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`.
- **Available real red flags:** None wound-specific in the current canonical list.
- **Available real clinical signals:** None wound-specific.
- **Missing IDs:**
  - Question cards: `wound_characterization_check`, `bleeding_volume_check`, `laceration_depth_check`
  - Red flags: `large_blood_volume`, `wound_deep_bleeding`
  - Signals: `possible_trauma`
- **Recommendation:** `blocked_missing_question_cards` + `blocked_missing_red_flags` + `blocked_missing_signals`
- **Rationale:**
  - `skin_itching_allergy` handles chronic dermatologic issues (rash, allergy, hot spots).
  - There is **no `trauma_bleeding_wound` module yet** in the registry.
  - If both skin and a future trauma module exist, overlap will occur when text contains both `skin` and `wound`.
  - No dedicated question card exists for `"wound age / depth / contamination"` that would help disambiguate.

### 8.7 heatstroke / heat exposure
- **Status:** Module referenced in task brief but **not present** in `complaint-modules/index.ts` or file system.
- **Available real question cards:** `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`, `breathing_difficulty_check`.
- **Available real red flags:** `heatstroke_signs`, `brachycephalic_heat`, `collapse`, `breathing_difficulty`, `pale_gums`, `blue_gums`.
- **Available real clinical signals:** `possible_heat_stroke`, `possible_collapse_or_weakness`, `possible_breathing_difficulty`.
- **Missing IDs:**
  - Question cards: `heat_exposure_check`, `brachycephalic_breed_check`, `panting_excess_check`
  - Red flags: `heatstroke_signs`, `brachycephalic_heat` are already in canonical list, so red flags are partially available.
  - Signals: `possible_heat_stroke` already exists.
- **Recommendation:** `blocked_missing_question_cards`
- **Rationale:** Heatstroke has strong signal and red-flag support, but lacks a heat-specific question card for characterization. Could be built as a thin module that reuses emergency screen cards, but would have no characterize/timeline questions beyond generics.

### 8.8 trauma / bleeding / wound
- **Status:** Module referenced in task brief but **not present** in `complaint-modules/index.ts` or file system.
- **Available real question cards:** `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`, `breathing_difficulty_check`.
- **Available real red flags:** `large_blood_volume`, `wound_deep_bleeding`, `collapse`, `unresponsive`, `pale_gums`, `blue_gums`, `breathing_difficulty`.
- **Available real clinical signals:** `possible_trauma`, `possible_collapse_or_weakness`, `possible_pale_gums`, `possible_blue_gums`, `possible_breathing_difficulty`.
- **Missing IDs:**
  - Question cards: `wound_characterization_check`, `bleeding_volume_check`, `trauma_mechanism_check`
  - Red flags: `large_blood_volume`, `wound_deep_bleeding` already exist in canonical list.
  - Signals: `possible_trauma` already exists.
- **Recommendation:** `blocked_missing_question_cards`
- **Rationale:** Trauma has strong signal and red-flag support, but lacks trauma-specific question cards for wound depth, bleeding volume, or mechanism. Could be built as a thin module reusing emergency globals, but would have poor characterization and handoff detail.

---

## 9. Summary

### 9.1 Registered modules checked
**9/9** modules audited.

### 9.2 Ready-to-build candidates
**0** — None of the eight candidate gaps can be safely built with the current 19 question cards, 37 canonical red flags, and 14 clinical signals without schema expansion.

### 9.3 Blocked candidates
| Candidate | Primary blockers |
|-----------|------------------|
| eye/vision/discharge | missing question cards, missing red flags, missing signals |
| ear/head-tilt/balance | missing question cards, missing red flags, missing signals |
| appetite/weight-loss/drinking-more | missing question cards, missing red flags, missing signals |
| post-vaccination reaction | missing question cards, missing red flags |
| pain/abdomen (not GI/bloat) | missing question cards, missing red flags, overlap risk |
| wound/skin overlap | missing question cards, missing red flags, missing signals |
| heatstroke/heat exposure | missing question cards |
| trauma/bleeding/wound | missing question cards |

### 9.4 Overlap risks
1. **`bloat_gdv` ↔ `gi_vomiting_diarrhea`** — Both match `retching` contexts. GI module already includes `bloat_retching_abdomen_check` in emergency screen, so bloat-related emergencies are caught by both modules. Clinically desirable redundancy.
2. **`collapse_weakness` ↔ `seizure_collapse_neuro`** — Both match `collapse` and `fainted`. Multi-module firing is expected for syncope vs. seizure differentiation.
3. **Future `trauma_bleeding_wound` ↔ `skin_itching_allergy`** — When text contains both `skin` and `wound` (e.g., `"skin wound"`, `"wound on his skin"`), both modules would fire. Acceptable for emergency screening but may duplicate handoff fields.

### 9.5 Missing IDs inventory
| Category | Missing IDs needed for next modules |
|----------|-------------------------------------|
| **Question cards** | `eye_discharge_check`, `eye_swelling_check`, `vision_change_check`, `ear_pain_check`, `ear_discharge_check`, `head_tilt_check`, `balance_loss_check`, `appetite_change_check`, `weight_loss_check`, `polydipsia_check`, `vaccine_recent_check`, `injection_site_swelling_check`, `abdominal_pain_check`, `posture_guarding_check`, `wound_characterization_check`, `bleeding_volume_check`, `heat_exposure_check`, `trauma_mechanism_check` |
| **Red flags** | `eye_injury`, `sudden_blindness`, `eye_protrusion`, `severe_eye_discharge`, `ear_infection_severe`, `vestibular_event`, `anorexia_prolonged`, `rapid_weight_loss`, `polyuria_polydipsia`, `post_vaccine_anaphylaxis`, `injection_site_abscess`, `severe_abdominal_pain`, `rigid_abdomen` |
| **Clinical signals** | `possible_eye_emergency`, `possible_vision_loss`, `possible_ear_emergency`, `possible_vestibular_attack`, `possible_systemic_illness`, `possible_post_vaccine_reaction` |

---

## 10. Recommendations for Next Sprint

1. **Do not add any new complaint modules** until the missing question-card IDs above are created and reviewed by clinical.
2. **Priority schema expansion:** Eye/vision and ear/balance are the highest-value gaps, but they require the largest ID additions.
3. **Overlap mitigation:** Consider adding a `wound_characterization_check` question card so a future `trauma_bleeding_wound` module can differentiate acute traumatic wounds from chronic skin lesions without relying on trigger overlap.
4. **Signal expansion:** `possible_abdominal_pain` is the only abdominal-pain signal; adding `possible_guarding` or `possible_rigid_abdomen` would strengthen the GI/bloat overlap story.
5. **Heatstroke & trauma modules** have strong red-flag and signal support already. They are the closest to `ready_to_build` once 2–3 dedicated question cards each are added.

---

*Audit complete. No runtime files modified. No new modules added.*
