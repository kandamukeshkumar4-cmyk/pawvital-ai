# VET-715: Pending-Question Schema Audit

**Date:** 2026-04-03
**Agent:** clinicallogicreviewer
**Branch:** qwen/vet-715-pending-question-schema-audit-v1

## Audit Scope

- File: `src/lib/clinical-matrix.ts` — FOLLOW_UP_QUESTIONS (lines 1492-2114)
- Focus: trauma, duration, presence/absence, and unknown-style questions

---

## FINDING 1: Trauma Questions

### `trauma_history` (line 1535-1542)

- **Type:** `string`
- **Question text:** "Was there any specific incident? A fall, jump, rough play, or getting hit?"
- **Issue:** Schema asks yes/no questions but uses `data_type: string` rather than `choice`
- **Impact:** Per VET-707B/VET-709, string-type questions use raw-text fallback only when the reply "looks like a direct answer" — but this question is structurally a boolean/unknown pattern. Without explicit choice values, the coercion family cannot reliably normalize "I don't know" or "maybe" responses.
- **Coercion family:** UNSAFE — relies on heuristic regex matching for unknown/no-trauma responses
- **Recommendation:** Convert to `choice` with values like `["yes_trauma", "no_trauma", "unknown"]` or add explicit unknown handling before state-machine work begins.

---

## FINDING 2: Duration Questions

All duration questions use `data_type: "string"`:

| Question ID | Line | Extraction Hint |
|-------------|------|-----------------|
| `vomit_duration` | 1577 | "duration of vomiting in hours or days" |
| `appetite_duration` | 1631 | "duration of appetite loss" |
| `lethargy_duration` | 1646 | "duration of lethargy" |
| `diarrhea_duration` | 1687 | "duration of diarrhea" |
| `cough_duration` | 1705 | "duration of cough" |
| `scratch_duration` | 1762 | "duration of scratching" |
| `weight_loss_duration` | 1875 | "timeframe of weight loss" |
| `trembling_duration` | 1904 | "duration of trembling" |
| `abdomen_onset` | 1934 | "onset of abdominal distension" |
| `discharge_duration` | 1986 | "duration of eye discharge" |
| `wound_duration` | 2079 | "duration and progression of the wound" |

- **Coercion family:** INTENTIONAL FREE-TEXT — no coercion fallback; accepts raw owner duration descriptions for clinical review
- **Recommendation:** Document as intentional. No coercion changes needed for this family.

---

## FINDING 3: Presence/Absence Questions — Type Inconsistencies

### Correctly typed as `boolean`:

`pain_on_touch`, `vomit_blood`, `head_shaking`, `head_tilt`, `balance_issues`, `flea_prevention`, `temperature_feel`, `abdomen_pain`, `unproductive_retching`, `treats_accepted`, `squinting`, `eye_redness`, `vision_changes`, `rat_poison_access`, `ear_swelling`, `wound_odor`, `wound_licking`

**Coercion family:** SAFE — boolean coercion is deterministic (true/false/unknown via regex)

### Questions typed as `string` that should arguably be `choice`:

- `skin_changes` (line 1768): "Are there any visible skin changes?" — no value enumeration
- `weight_change` (line 1814): "Has your dog gained or lost weight recently?" — no value enumeration
- `diet_change` (line 2055): "Any recent changes to diet or new foods introduced?" — no value enumeration

**Coercion family:** HEURISTIC — extraction hints provide guidance but no structured fallback

### `blood_color` and `blood_amount` — correctly typed as `choice` but lack `unknown` option:

- `blood_color` (line 2015): choices `["bright_red", "dark_tarry"]`
- `blood_amount` (line 2023): choices `["streaks", "mixed_in", "mostly_blood"]`

**Coercion family:** PARTIALLY SAFE — owner "don't know" response has no enumerated fallback; defaults to raw-text

### Other `choice` questions missing `unknown` option:

`limping_progression`, `weight_bearing`, `appetite_status`, `lethargy_severity`, `stool_consistency`, `cough_type`, `breathing_onset`, `gum_color`, `seasonal_pattern`, `appetite_change`, `trembling_timing`, `consciousness_level`, `wound_discharge`

**Coercion family:** MIXED — deterministic for known choices, heuristic for "unknown" owner responses

---

## FINDING 4: Unknown-Style Questions

**Gap:** No explicit `unknown` option exists in any `choice`-type question schema.

**Impact:** When an owner responds "I don't know" to a choice question, the coercion layer must recognize this via regex on normalized text. This works for boolean questions where "unknown" maps implicitly, but for choice questions the recovery path defaults to raw-text fallback.

**Coercion family:** HEURISTIC — relies on regex matching for "idk", "not sure", "don't know"

**Recommendation:** For each `critical: true` choice question, consider whether `unknown` should be an explicit choice value to make the recovery family deterministic rather than heuristic.

---

## Summary: Safe vs. Unsafe Coercion Families

| Category | Coercion Family | Status |
|----------|----------------|--------|
| Boolean questions | Deterministic (true/false/unknown) | **SAFE** |
| Duration questions | Intentional free-text | **SAFE** (by design) |
| Trauma (`trauma_history`) | Heuristic regex | **UNSAFE** — needs explicit choice values |
| Presence/absence (string type) | Heuristic extraction hints | **MARGINAL** — extraction hints provide guidance |
| Choice questions with unknown owner response | Heuristic regex fallback | **MARGINAL** — works but not deterministic |
| `blood_color`, `blood_amount` | Heuristic for unknown | **MARGINAL** — structured choices but no unknown option |

---

## Files Changed

- `src/lib/clinical-matrix.ts` — no changes (audit only)
- `docs/tickets/VET-715-pending-question-schema-audit.md` — new file (this document)

## Notes

- This is a schema audit and decision documentation ticket — no route behavior changes
- Clinical matrix remains the source of truth
- Findings inform future state-machine behavior ticket development
- Decisions.md (Obsidian vault) also updated with corrected findings
