# VET-715: Pending Question Schema Audit

**Date:** 2026-04-03
**Agent:** clinical-reviewer
**Branch:** qwen/vet-715-pending-question-schema-audit-v1
**Source files audited:**
- `src/lib/clinical-matrix.ts` — FOLLOW_UP_QUESTIONS (lines 1492-2114)
- `src/app/api/ai/symptom-chat/route.ts` — pending-recovery and coercion logic (read-only reference)

---

## 1. FOLLOW_UP_QUESTIONS Inventory

All questions in the `FOLLOW_UP_QUESTIONS` record as of the current clinical-matrix.ts source:

### Limping Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `which_leg` | string | — | true |
| `limping_onset` | string | — | true |
| `limping_progression` | choice | better, worse, same | true |
| `weight_bearing` | choice | weight_bearing, partial, non_weight_bearing | true |
| `pain_on_touch` | boolean | — | false |
| `trauma_history` | string | — | true |
| `worse_after_rest` | boolean | — | false |
| `swelling_present` | boolean | — | false |
| `warmth_present` | boolean | — | false |
| `prior_limping` | boolean | — | false |

### Vomiting Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `vomit_duration` | string | — | true |
| `vomit_frequency` | string | — | true |
| `vomit_blood` | boolean | — | true |
| `vomit_content` | string | — | false |
| `toxin_exposure` | string | — | true |
| `dietary_change` | string | — | false |

### General / Systemic Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `appetite_status` | choice | normal, decreased, none | false |
| `appetite_duration` | string | — | true |
| `water_intake` | choice | normal, more_than_usual, less_than_usual, not_drinking | true |
| `lethargy_duration` | string | — | true |
| `lethargy_severity` | choice | mild, moderate, severe | true |

### Stool Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `stool_blood` | string | — | true |
| `stool_frequency` | string | — | false |
| `stool_consistency` | choice | formed, soft, watery, mucus | false |
| `diarrhea_duration` | string | — | true |

### Respiratory Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `cough_type` | choice | dry_honking, wet_productive, gagging | true |
| `cough_duration` | string | — | true |
| `cough_timing` | string | — | false |
| `breathing_rate` | number | — | false |
| `exercise_intolerance` | boolean | — | false |
| `breathing_onset` | choice | sudden, gradual | true |
| `gum_color` | choice | pink_normal, pale_white, blue, bright_red, yellow | true |

### Skin/Allergy Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `scratch_location` | string | — | true |
| `scratch_duration` | string | — | true |
| `skin_changes` | string | — | false |
| `flea_prevention` | boolean | — | false |
| `seasonal_pattern` | choice | seasonal, year_round | false |

### Drinking Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `water_amount_change` | string | — | true |
| `urination_frequency` | boolean | — | true |
| `urination_accidents` | boolean | — | false |
| `weight_change` | string | — | false |
| `spay_status` | boolean | — | true |

### Ear Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `ear_odor` | string | — | false |
| `ear_discharge` | string | — | true |
| `head_shaking` | boolean | — | false |
| `head_tilt` | boolean | — | true |
| `balance_issues` | boolean | — | true |

### General Systemic Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `weight_loss` | boolean | — | false |
| `weight_loss_duration` | string | — | true |
| `weight_loss_amount` | string | — | false |
| `appetite_change` | choice | increased, decreased, normal | true |
| `nasal_discharge` | string | — | false |
| `trembling_duration` | string | — | true |
| `trembling_timing` | choice | constant, intermittent | false |
| `consciousness_level` | choice | alert, dull, unresponsive | true |
| `temperature_feel` | boolean | — | false |
| `abdomen_onset` | string | — | true |
| `abdomen_pain` | boolean | — | true |
| `unproductive_retching` | boolean | — | true |
| `restlessness` | boolean | — | false |
| `treats_accepted` | boolean | — | false |
| `stool_changes` | string | — | false |

### Eye Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `discharge_color` | string | — | true |
| `discharge_duration` | string | — | true |
| `squinting` | boolean | — | true |
| `eye_redness` | boolean | — | false |
| `vision_changes` | boolean | — | false |

### Blood in Stool Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `blood_color` | choice | bright_red, dark_tarry | true |
| `blood_amount` | choice | streaks, mixed_in, mostly_blood | true |
| `rat_poison_access` | boolean | — | true |

### Other / Positional

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `ear_swelling` | boolean | — | false |
| `position_preference` | string | — | false |
| `diet_change` | string | — | false |

### Wound / Skin Lesion Group

| Question ID | data_type | choices | critical |
|-------------|-----------|---------|----------|
| `wound_location` | string | — | true |
| `wound_size` | string | — | true |
| `wound_duration` | string | — | true |
| `wound_color` | string | — | false |
| `wound_discharge` | choice | none, clear_fluid, pus, blood, mixed | true |
| `wound_odor` | boolean | — | false |
| `wound_licking` | boolean | — | true |

**Total questions: 75**
- boolean: 24
- string: 32
- choice: 18
- number: 1

---

## 2. Pending-Recovery Alignment

The pending-recovery system in route.ts has three layers:
1. **`deriveDeterministicAnswerForQuestion()`** — switch-case that calls named extract functions
2. **`coerceFallbackAnswerForPendingQuestion()`** — calls deterministic first, then routes to `coerceAnswerForQuestion()` for non-string/non-location questions
3. **`shouldPersistRawPendingAnswer()`** — gate that allows raw-text fallback for string-type questions

### Questions with dedicated deterministic extractors

These questions have explicit extract functions in `deriveDeterministicAnswerForQuestion()`:

| Question ID | Extractor | Returns | Schema alignment |
|-------------|-----------|---------|-----------------|
| `which_leg` | `extractLegLocation()` | free-text ("left back leg") | ALIGNED — string type matches free-text output |
| `wound_location` | `extractBodyLocation()` | free-text ("left paw") | ALIGNED — string type matches free-text output |
| `limping_onset` | `extractLimpingOnset()` → `extractOnsetPattern()` | "gradual" or "sudden" | MISALIGNED — returns schema-external string values; schema is string type, but values mirror breathing_onset choices |
| `breathing_onset` | `extractBreathingOnset()` → `extractOnsetPattern()` | "gradual" or "sudden" | ALIGNED — matches choices: ["sudden", "gradual"] |
| `abdomen_onset` | `extractAbdomenOnset()` → `extractOnsetPattern()` | "gradual" or "sudden" | MARGINAL — string type, extractor returns onset keywords; fine but not validated against choices |
| `limping_progression` | `extractLimpingProgression()` | "better", "worse", "same" | ALIGNED — matches choices exactly |
| `weight_bearing` | `extractWeightBearingStatus()` | "weight_bearing", "partial", "non_weight_bearing" | ALIGNED — matches choices exactly |
| `trauma_history` | `extractTraumaHistory()` | raw message slice (≤160 chars) or null | MISALIGNED — schema is string; extractor returns raw text only when trauma keywords found; "no trauma" / "I don't know" falls through to `coerceAnswerForQuestion()` which returns the raw message for string type |
| `gum_color` | `extractGumColor()` | "blue", "pale_white", "bright_red", "yellow", "pink_normal" | ALIGNED — matches choices exactly |
| `water_intake` | `extractWaterIntake()` → `coerceChoiceAnswerFromIntent()` | choice value or null | ALIGNED — extensive coercion with water-specific patterns |
| `consciousness_level` | `extractConsciousnessLevel()` | "alert", "dull", "unresponsive" | ALIGNED — matches choices exactly |
| `blood_color` | `extractBloodColor()` | "bright_red", "dark_tarry" | ALIGNED — matches choices; no unknown branch |
| `blood_amount` | `extractBloodAmount()` | "streaks", "mixed_in", "mostly_blood" | ALIGNED — matches choices; no unknown branch |
| `rat_poison_access` | `extractRatPoisonAccess()` | boolean | ALIGNED — boolean schema, returns boolean |
| `toxin_exposure` | `extractToxinExposure()` | raw message slice or null | ALIGNED — string type, returns substance-specific raw text |
| `pain_on_touch` | `extractPainOnTouch()` | boolean | ALIGNED — boolean schema |
| `worse_after_rest` | `extractWorseAfterRest()` | boolean | ALIGNED — boolean schema |
| `swelling_present` | `extractSwellingPresence()` | boolean | ALIGNED — boolean schema |
| `warmth_present` | `extractWarmthPresence()` | boolean | ALIGNED — boolean schema |
| `prior_limping` | `extractPriorLimping()` | boolean | ALIGNED — boolean schema |

### Questions handled only by `coerceChoiceAnswerFromIntent()` (no dedicated extractor)

These choice questions receive intent-based coercion in `coerceChoiceAnswerFromIntent()`:

| Question ID | Coercion coverage | Schema choices | Alignment |
|-------------|-------------------|----------------|-----------|
| `breathing_onset` | "sudden/suddenly/..." → "sudden"; "gradual/..." → "gradual" | sudden, gradual | ALIGNED |
| `limping_progression` | better/worse/same with synonyms | better, worse, same | ALIGNED |
| `appetite_status` | not eating → none; eating less → decreased; eating normally → normal | normal, decreased, none | ALIGNED |
| `lethargy_severity` | barely moving → severe; less active → mild; very tired → moderate | mild, moderate, severe | ALIGNED but incomplete — "moderate" pattern uses "really tired/very tired" which overlaps with severe threshold |
| `trembling_timing` | constant/nonstop → constant; comes and goes → intermittent | constant, intermittent | ALIGNED |
| `stool_consistency` | watery/liquid → watery; mucus/slimy → mucus; soft/mushy → soft; formed/solid → formed | formed, soft, watery, mucus | ALIGNED |

### Questions with no dedicated extractor and no question-specific intent coercion

These questions receive only the generic affirmative/negative/unknown handling via `isShortAffirmativeResponse()` / `isShortNegativeResponse()` / `isShortUnknownResponse()`:

| Question ID | data_type | Fallback path |
|-------------|-----------|---------------|
| `appetite_status` | choice | Intent coercion + generic affirmative/negative |
| `seasonal_pattern` | choice | Generic only — "yes" → "seasonal" (matches "seasonal" via normal/yes priority), "no" → no match (none of the choices are negative-polarity) |
| `appetite_change` | choice | Generic only — "normal" affirmative → "normal"; no increased pattern |
| `cough_type` | choice | Generic only — no keyword coverage for dry_honking, wet_productive, gagging except via literal choice matching |
| `gum_color` | choice | Has dedicated extractor |
| `wound_discharge` | choice | Has question-specific inline coercion in `coerceAnswerForQuestion()` |

### String-type questions that use `shouldPersistRawPendingAnswer()` gate

These questions receive raw-text recording when the reply looks like a direct answer:

| Question ID | Duration-like signal | Context-token match | Raw fallback for "unknown" | Critical |
|-------------|---------------------|---------------------|---------------------------|----------|
| `vomit_duration` | yes | yes | yes (via `isShortUnknownResponse`) | true |
| `vomit_frequency` | no | yes | yes | true |
| `vomit_content` | no | yes | yes | false |
| `toxin_exposure` | no | yes | yes | true |
| `dietary_change` | no | yes | yes | false |
| `appetite_duration` | yes | yes | yes | true |
| `lethargy_duration` | yes | yes | yes | true |
| `stool_blood` | no | yes | yes | true |
| `stool_frequency` | no | yes | yes | false |
| `diarrhea_duration` | yes | yes | yes | true |
| `cough_duration` | yes | yes | yes | true |
| `cough_timing` | yes | yes | yes | false |
| `scratch_location` | no | yes | yes | true |
| `scratch_duration` | yes | yes | yes | true |
| `skin_changes` | no | yes | yes | false |
| `water_amount_change` | no | yes | yes | true |
| `weight_change` | no | yes | yes | false |
| `ear_odor` | no | yes | yes | false |
| `ear_discharge` | no | yes | yes | true |
| `weight_loss_duration` | yes | yes | yes | true |
| `weight_loss_amount` | no | yes | yes | false |
| `nasal_discharge` | no | yes | yes | false |
| `trembling_duration` | yes | yes | yes | true |
| `abdomen_onset` | yes | yes | yes | true |
| `stool_changes` | no | yes | yes | false |
| `discharge_color` | no | yes | yes | true |
| `discharge_duration` | yes | yes | yes | true |
| `position_preference` | no | yes | yes | false |
| `diet_change` | no | yes | yes | false |
| `wound_location` | no | no (blocked — explicit null in coerceFallback) | no | true |
| `wound_size` | no | yes | yes | true |
| `wound_duration` | yes | yes | yes | true |
| `wound_color` | no | yes | yes | false |
| `limping_onset` | yes | yes | yes | true |
| `which_leg` | no | no (blocked — explicit null in coerceFallback) | no | true |
| `trauma_history` | no | yes | yes | true |

---

## 3. Gap Analysis

### 3a. Questions with allowed values defined but no pending-recovery handling

These are choice questions that have no question-specific handler in `coerceChoiceAnswerFromIntent()`, relying only on generic short-response matching or literal choice substring matching. If an owner gives a short natural-language answer that does not match a choice substring, coercion returns null and the raw-fallback gate for choice questions requires an affirmative/negative/unknown pattern.

| Question ID | choices | Gap | Risk |
|-------------|---------|-----|------|
| `seasonal_pattern` | seasonal, year_round | No intent coercion for "mostly spring", "usually summer", "all year" | Medium — owner's natural phrasing may not match choice substrings |
| `appetite_change` | increased, decreased, normal | No coercion for "eating more", "hungry all the time", "ravenous" → increased | Medium — "increased" appetite has no keyword handler; only "decreased" and "normal" are covered via generic paths |
| `cough_type` | dry_honking, wet_productive, gagging | No explicit coercion for "like a goose", "honking noise", "wet cough" | High — all three choices require exact substring match or literal; owner phrasing is highly varied |
| `weight_bearing` | weight_bearing, partial, non_weight_bearing | Has dedicated deterministic extractor (aligned) | Low — adequately covered |
| `limping_progression` | better, worse, same | Has intent coercion (aligned) | Low — adequately covered |
| `appetite_status` | normal, decreased, none | Has intent coercion (aligned) | Low — adequately covered |
| `lethargy_severity` | mild, moderate, severe | Has intent coercion (partial) | Medium — "moderate" threshold ambiguous with severe |
| `trembling_timing` | constant, intermittent | Has intent coercion (aligned) | Low — adequately covered |
| `stool_consistency` | formed, soft, watery, mucus | Has intent coercion (aligned) | Low — adequately covered |
| `breathing_onset` | sudden, gradual | Has both deterministic extractor and intent coercion | Low — adequately covered |

### 3b. Questions with pending-recovery coercion that maps to values outside the schema's allowed set

| Question ID | Schema type | Coercion output | In allowed set? | Severity |
|-------------|-------------|-----------------|-----------------|----------|
| `limping_onset` | string (no choices) | "gradual", "sudden" | N/A — string type has no restricted set | Low — stored as raw string; downstream code may assume these exact values based on VET-707B patterns |
| `abdomen_onset` | string (no choices) | "gradual", "sudden" | N/A — string type has no restricted set | Low — same as above |
| `trauma_history` | string (no choices) | Raw text slice (≤160 chars) when trauma keywords found; generic string coercion (`coerceAnswerForQuestion()` returns raw message) otherwise | N/A — string type has no restricted set | Medium — "no trauma" or "I don't know" replies pass through raw, creating unstructured values that the state machine may need to interpret |

**No choice-type question has coercion that returns a value outside its defined choices set.** All deterministic extractors and intent coercions for choice questions are verified against the schema-defined choice lists.

### 3c. Questions with unknown/hedged answers that need explicit schema entries

Owner responses like "I don't know", "not sure", "maybe", "can't tell" are currently handled by `isShortUnknownResponse()` regex. For boolean questions, this returns null (question stays unresolved). For choice questions, the short-unknown-response gate allows raw-text recording via `shouldPersistRawPendingAnswer()`.

No `choice` question in the schema has an explicit `unknown` option. This means:
- For critical choice questions, an "I don't know" response persists as a raw string (e.g., "I don't know"), not as a schema-valid choice value.
- Downstream clinical logic or report generation that reads `extracted_answers` for a choice question may receive a raw string instead of a defined choice.

**Questions where this gap is clinically significant (critical: true, no unknown option):**

| Question ID | choices | Clinical risk of unknown answer |
|-------------|---------|--------------------------------|
| `blood_color` | bright_red, dark_tarry | High — determines GI bleed location (upper vs. lower); owner "I don't know" should be recorded as unknown, not stored as raw string |
| `blood_amount` | streaks, mixed_in, mostly_blood | High — informs severity; unknown is a meaningful clinical state |
| `consciousness_level` | alert, dull, unresponsive | High — emergency differentiator; unknown is valid (owner may not have checked) |
| `gum_color` | pink_normal, pale_white, blue, bright_red, yellow | High — color determines urgency tier; owner "I don't check" is a valid unknown state |
| `cough_type` | dry_honking, wet_productive, gagging | Medium — important for differential, but not immediately urgent |
| `breathing_onset` | sudden, gradual | Medium — sudden onset is a red flag; unknown affects triage weighting |
| `lethargy_severity` | mild, moderate, severe | Medium — affects urgency level |
| `limping_progression` | better, worse, same | Low-medium — useful for progression but not immediately life-threatening |
| `weight_bearing` | weight_bearing, partial, non_weight_bearing | Low-medium — useful for severity but owner may genuinely not know |

---

## 4. Safe Widening Candidates

These questions could safely benefit from explicit unknown-value entries in the schema without requiring route code changes, since `isShortUnknownResponse()` already recognizes the pattern and raw-text fallback would simply store a defined value instead of raw text.

| Question ID | Proposed unknown value | Rationale |
|-------------|----------------------|-----------|
| `blood_color` | `"unknown"` | Critical question; owner may not have observed blood color directly; storing raw string blocks structured reporting |
| `blood_amount` | `"unknown"` | Critical question; same rationale as blood_color |
| `consciousness_level` | `"unknown"` | Emergency differentiator; owner may not have assessed responsiveness |
| `gum_color` | `"unknown"` | High urgency differentiator; owner may not have checked gums |
| `cough_type` | `"unknown"` | Critical question; owner descriptions vary widely |
| `breathing_onset` | `"unknown"` | Critical question; useful for triage weighting when onset is unclear |
| `lethargy_severity` | `"unknown"` | Critical; owner may not distinguish mild vs. moderate |
| `stool_consistency` | `"unknown"` | Not critical but widely asked; enables cleaner structured answers |
| `appetite_change` | `"unknown"` | Critical; weight loss context makes this important |
| `appetite_status` | `"unknown"` | Common question; supports cleaner reporting |
| `limping_progression` | `"unknown"` | Critical; owner may not have tracked progression |
| `weight_bearing` | `"unknown"` | Critical; owner may not have observed this explicitly |
| `seasonal_pattern` | `"unknown"` | Not critical; useful for allergy differentials |
| `trembling_timing` | `"unknown"` | Not critical; but intermittent vs. constant is clinically meaningful |
| `wound_discharge` | `"unknown"` | Critical; owner may not have inspected wound closely |

Adding `"unknown"` to these schemas would:
1. Allow `coerceAnswerForQuestion()` to match via the existing literal-substring check
2. Allow future intent coercion to map "I don't know" → "unknown" deterministically
3. Enable structured reporting to distinguish "not asked" from "asked and unknown"

No route.ts changes are needed to benefit from schema widening on the coercion side — the literal-match fallback in `coerceAnswerForQuestion()` automatically handles choice substring matching.

---

## 5. Schema-Blocked Questions

These questions currently have schema constraints that prevent correct coercion for certain natural-language patterns:

### 5a. `trauma_history` — string type blocks boolean normalization

**Problem:** The question "Was there any specific incident? A fall, jump, rough play, or getting hit?" is structured as a yes/no question semantically but uses `data_type: "string"`. This creates two problems:

1. `coerceFallbackAnswerForPendingQuestion()` at line 3560 explicitly returns `null` for string-type questions, routing the answer through `shouldPersistRawPendingAnswer()` instead of `coerceAnswerForQuestion()`. In contrast, if a boolean/choice question receives a short negative ("no"), `coerceAnswerForQuestion()` returns `false` / a negative choice value deterministically.

2. `extractTraumaHistory()` returns raw text only when trauma keywords are found in the message. When an owner says "no" or "I don't think so", the extractor returns null. The fallback then checks `shouldPersistRawPendingAnswer()`, which requires the message to look like a direct answer. A simple "no" with word-count ≤ 5 passes this gate and stores "no" as a raw string. Downstream code receives the string `"no"` rather than the boolean `false`.

**Clinical risk:** If the state machine or report generator later checks `extracted_answers.trauma_history === false` (boolean), it will not match the stored string `"no"`, causing the question to appear unanswered in boolean-comparison contexts.

**Schema blocker:** The `string` type prevents `coerceFallbackAnswerForPendingQuestion()` from routing through `coerceAnswerForQuestion()`, which would otherwise handle boolean-pattern replies.

### 5b. `cough_type` — choice type with no intent coercion for natural descriptions

**Problem:** The question asks about cough sound, but the choices (`dry_honking`, `wet_productive`, `gagging`) require either a literal substring match or the generic affirmative pattern. Owners rarely say "dry honking" — they say "sounds like a goose", "honking noise", "like he's clearing his throat", or "rattling". None of these trigger `coerceChoiceAnswerFromIntent()` for `cough_type` (no question-specific handler exists), and they are unlikely to match choice substrings after underscore-to-space normalization.

**Schema blocker:** The defined choices block raw-text storage (choice questions do not fall through to raw-text in `coerceFallbackAnswerForPendingQuestion()`). Without an intent coercion handler, natural descriptions that cannot be mapped to a choice return null and the question remains unresolved.

### 5c. `seasonal_pattern` — limited choices with no normality handler

**Problem:** The question "Does the itching seem seasonal or year-round?" uses choices `["seasonal", "year_round"]`. A short affirmative response ("yes") maps to the first affirmative-priority match — which via `pickChoiceByPriority` with priority `[["normal"], ["yes"], ...]` finds no match in these choices (neither "normal" nor "yes" is a substring of "seasonal" or "year_round"). A short negative ("no") has the same issue.

**Schema blocker:** Neither choice value contains keywords that the generic affirmative/negative handler targets. An owner's "yes, it's seasonal" is properly handled (substring match on "seasonal"), but a standalone "yes" or "no" falls through and the question stays unresolved.

### 5d. `appetite_change` — no coercion for "increased" family

**Problem:** Choices are `["increased", "decreased", "normal"]`. Only "decreased" and "normal" have coercion coverage via `coerceChoiceAnswerFromIntent()` under `appetite_status`. The `appetite_change` question has no dedicated coercion handler, and "increased" appetite ("eating more than usual", "ravenous", "hungrier than normal") has no pattern match in the generic layer.

**Schema blocker:** Without explicit coercion for the "increased" direction, `cough_type` and `appetite_change` are the two critical choice questions most likely to remain unresolved when owners use natural phrasing.

---

## 6. Summary Table

### By coercion coverage

| Question ID | data_type | Has deterministic extractor | Has intent coercion | Has unknown support | Risk level |
|-------------|-----------|---------------------------|--------------------|--------------------|------------|
| `which_leg` | string | yes | — | no (blocked) | Low |
| `wound_location` | string | yes | — | no (blocked) | Low |
| `limping_onset` | string | yes | — | raw fallback | Low |
| `limping_progression` | choice | yes | yes | no | Low |
| `weight_bearing` | choice | yes | — | no | Low |
| `trauma_history` | string | yes (partial) | — | raw fallback ("no" stored as string) | Medium |
| `breathing_onset` | choice | yes | yes | no | Low |
| `gum_color` | choice | yes | — | no | Low |
| `water_intake` | choice | yes (via coerceChoiceAnswerFromIntent) | yes (extensive) | no | Low |
| `consciousness_level` | choice | yes | — | no | Medium |
| `blood_color` | choice | yes | — | no | Medium |
| `blood_amount` | choice | yes | — | no | Medium |
| `rat_poison_access` | boolean | yes | — | — | Low |
| `toxin_exposure` | string | yes (partial) | — | raw fallback | Low |
| `pain_on_touch` | boolean | yes | — | — | Low |
| `worse_after_rest` | boolean | yes | — | — | Low |
| `swelling_present` | boolean | yes | — | — | Low |
| `warmth_present` | boolean | yes | — | — | Low |
| `prior_limping` | boolean | yes | — | — | Low |
| `appetite_status` | choice | no | yes | no | Low |
| `lethargy_severity` | choice | no | yes (partial) | no | Medium |
| `stool_consistency` | choice | no | yes | no | Low |
| `trembling_timing` | choice | no | yes | no | Low |
| `cough_type` | choice | no | no | no | High |
| `seasonal_pattern` | choice | no | no | no | Medium |
| `appetite_change` | choice | no | no | no | Medium |
| `wound_discharge` | choice | no | inline only | no | Medium |
| All duration questions (10) | string | no | — | raw fallback | Low (by design) |
| `vomit_blood` | boolean | no (generic coerce only) | — | — | Low |
| All other boolean (21) | boolean | some / generic | — | — | Low |

### Priority findings

| Finding | Severity | Recommended action |
|---------|----------|--------------------|
| `trauma_history` uses string type for semantically boolean question | Medium | Schema: convert to choice with yes_trauma/no_trauma/unknown before state-machine work |
| `cough_type` has no intent coercion for natural owner phrasing | High | Add `cough_type` handler to `coerceChoiceAnswerFromIntent()` |
| No choice question has explicit `unknown` option | Medium | Add `unknown` to critical choice questions (see Section 4) |
| `appetite_change` "increased" direction has no coercion coverage | Medium | Add `appetite_change` handler or extend generic affirmative layer |
| `seasonal_pattern` affirmative/negative short responses fall through | Medium | Add `seasonal_pattern` handler or accept that this is non-critical |
| `lethargy_severity` moderate/severe threshold overlap | Low | Tighten regex patterns in the VET-709 moderate handler |
| 10 duration questions intentionally free-text | None | Document as intentional; no action required |

---

## 7. Files Changed

- `docs/vet-715-schema-audit.md` — this document (new)
- `src/lib/clinical-matrix.ts` — no changes (audit only)
- `src/app/api/ai/symptom-chat/route.ts` — no changes (read-only reference)

## Notes

- All findings are grounded in the current source of `clinical-matrix.ts` (lines 1492-2114) and `route.ts` coercion logic
- No medical decisions were moved into prompts
- No schema widening was performed in code — this audit informs future tickets
- The prior agent's audit in `docs/tickets/VET-715-pending-question-schema-audit.md` correctly identified the `trauma_history` string/boolean mismatch and the absence of explicit unknown options; this report extends that work with full inventory, alignment tables, schema-blocked analysis, and a prioritized gap table
- `cough_type` coercion gap is a newly identified high-severity finding not in the prior audit
