# VET-722: Unknown Option Proposal For Safe Choice Families

## Status
- `complete`

## Owner
- `clinicallogicreviewer`

## Goal

Decide which existing `choice` follow-up questions in `FOLLOW_UP_QUESTIONS` are safe candidates for an explicit `unknown` option.

This ticket is a decision document only. It does not change runtime behavior, schema values, or clinical logic.

## Source Of Truth Reviewed

- `src/lib/clinical-matrix.ts`
- `docs/vet-715-schema-audit.md`

## Decision Rule

- **Safe for explicit `unknown`**: the question is a descriptive qualifier or historical pattern, and storing `unknown` preserves honest owner uncertainty without hiding a direct urgency discriminator.
- **Unsafe for explicit `unknown`**: the question contains a direct urgency discriminator or a direct observable branch that should stay open until clarified.
- **Needs product/clinical decision**: owner uncertainty is plausible, but storing `unknown` would still close a clinically meaningful branch. If this bucket is widened later, `unknown` must mean "asked but unresolved," not "resolved and clinically equivalent to the existing choices."

## Inventory Reviewed

The current schema contains 16 `choice` follow-up questions:

- `limping_progression`
- `weight_bearing`
- `appetite_status`
- `water_intake`
- `lethargy_severity`
- `stool_consistency`
- `cough_type`
- `breathing_onset`
- `gum_color`
- `seasonal_pattern`
- `appetite_change`
- `trembling_timing`
- `consciousness_level`
- `blood_color`
- `blood_amount`
- `wound_discharge`

## Recommendation Summary

- **Safe for explicit `unknown`**: `limping_progression`, `appetite_status`, `stool_consistency`, `seasonal_pattern`, `trembling_timing`
- **Unsafe for explicit `unknown`**: `weight_bearing`, `water_intake`, `breathing_onset`, `gum_color`, `consciousness_level`, `blood_amount`
- **Needs product/clinical decision**: `lethargy_severity`, `cough_type`, `appetite_change`, `blood_color`, `wound_discharge`

This narrows the broader widening ideas noted in VET-715. The safe bucket should be limited to families where `unknown` records a real information gap without masking a direct red-flag split.

## Safe For Explicit `unknown`

| Question ID | Symptom family in matrix | Current choices | Critical | Classification | Why this is safe |
| --- | --- | --- | --- | --- | --- |
| `limping_progression` | `limping` | `better`, `worse`, `same` | `true` | Safe | This question captures trend after onset, not an immediate red-flag observation. The `limping` family red flags are `non_weight_bearing`, `visible_fracture`, and `sudden_paralysis`, not progression itself. |
| `appetite_status` | `vomiting`, `lethargy` | `normal`, `decreased`, `none` | `false` | Safe | This is a non-critical appetite qualifier used in vomiting and lethargy workups. `unknown` can honestly capture cases where the owner has not directly observed a meal without turning that into `normal`, `decreased`, or `none`. |
| `stool_consistency` | `diarrhea` | `formed`, `soft`, `watery`, `mucus` | `false` | Safe | This is a descriptive stool-quality question. In the matrix, the diarrhea red flags are large-volume blood states, not stool-consistency categories. |
| `seasonal_pattern` | `excessive_scratching` | `seasonal`, `year_round` | `false` | Safe | This is a pattern qualifier for allergy-style differentials, not an urgency discriminator. `unknown` preserves uncertainty without masking a red-flag state. |
| `trembling_timing` | `trembling` | `constant`, `intermittent` | `false` | Safe | This is a non-critical pattern question. The `trembling` family red flags are `seizure_activity`, `toxin_confirmed`, and `collapse`, not the timing split itself. |

## Unsafe For Explicit `unknown`

| Question ID | Symptom family in matrix | Current choices | Critical | Classification | Why this is unsafe |
| --- | --- | --- | --- | --- | --- |
| `weight_bearing` | `limping` | `weight_bearing`, `partial`, `non_weight_bearing` | `true` | Unsafe | This choice set contains the direct red-flag branch `non_weight_bearing`, and the `limping` family explicitly treats `non_weight_bearing` as a red flag. A stored `unknown` would close a question that should stay open until clarified. |
| `water_intake` | `not_eating`, `weight_loss` | `normal`, `more_than_usual`, `less_than_usual`, `not_drinking` | `true` | Unsafe | This choice set contains `not_drinking`, and the `not_eating` pathway already treats absent water intake as a red-flag direction (`no_water_24h`). `unknown` risks hiding the most urgent branch in the family. |
| `breathing_onset` | `difficulty_breathing` | `sudden`, `gradual` | `true` | Unsafe | The `difficulty_breathing` family red flags include `breathing_onset_sudden`. Because `sudden` is itself a red-flag discriminator, `unknown` should not be treated as a completed stored answer. |
| `gum_color` | `difficulty_breathing` | `pink_normal`, `pale_white`, `blue`, `bright_red`, `yellow` | `true` | Unsafe | This question contains direct emergency-facing observations, especially `blue` and `pale_white`. The `difficulty_breathing` family already treats `blue_gums` as a red flag. |
| `consciousness_level` | `trembling` | `alert`, `dull`, `unresponsive` | `true` | Unsafe | This is a direct neurologic responsiveness split, and the surrounding family already treats `unresponsive` / collapse-type states as red-flag territory. `unknown` should not close this question. |
| `blood_amount` | `blood_in_stool` | `streaks`, `mixed_in`, `mostly_blood` | `true` | Unsafe | This question is the direct severity split for GI bleeding volume. The `blood_in_stool` family already uses large-volume bleeding as a red-flag concept, so `unknown` should remain a clarification path. |

## Needs Product/Clinical Decision

| Question ID | Symptom family in matrix | Current choices | Critical | Classification | Why this needs a policy call |
| --- | --- | --- | --- | --- | --- |
| `lethargy_severity` | `lethargy` | `mild`, `moderate`, `severe` | `true` | Needs decision | This is a clinically meaningful severity split, but none of the current choices is itself the family red flag. If widened later, `unknown` must not behave like a resolved severity answer or suppress follow-up. |
| `cough_type` | `coughing` | `dry_honking`, `wet_productive`, `gagging` | `true` | Needs decision | This is clinically useful for respiratory differentials, but not a direct matrix red flag. Owner uncertainty is plausible because the current choices ask the owner to map a sound into narrow labels. |
| `appetite_change` | `drinking_more`, `weight_loss` | `increased`, `decreased`, `normal` | `true` | Needs decision | This choice set is important for endocrine and weight-loss direction, but it is not itself a direct red-flag family split. If `unknown` is accepted later, it should mean the differential branch remains unresolved. |
| `blood_color` | `blood_in_stool` | `bright_red`, `dark_tarry` | `true` | Needs decision | This choice set changes clinical interpretation of GI bleeding source, but the matrix red flags for this family are large blood volume, rat poison exposure, and pale gums. That makes `unknown` risky, but not automatically unsafe in the same way as `blood_amount`. |
| `wound_discharge` | `wound_skin_issue` | `none`, `clear_fluid`, `pus`, `blood`, `mixed` | `true` | Needs decision | This is a clinically meaningful wound-characterization question, but the matrix red flags for the wound family are deep bleeding, bone visibility, and rapid spread. If `unknown` is ever accepted here, it should represent "not adequately inspected" rather than a normal resolved discharge type. |

## Clarification-Only Recommendation

The following families should remain clarification paths, not stored `unknown` answers:

- `weight_bearing`
- `water_intake`
- `breathing_onset`
- `gum_color`
- `consciousness_level`
- `blood_amount`

For the decision bucket, the default should also remain clarification-only unless a later product/clinical decision explicitly changes the meaning of an answered `unknown` state:

- `lethargy_severity`
- `cough_type`
- `appetite_change`
- `blood_color`
- `wound_discharge`

## Follow-Up Boundary

If a later ticket widens schemas, the safe first wave should be limited to the five families in the safe bucket:

- `limping_progression`
- `appetite_status`
- `stool_consistency`
- `seasonal_pattern`
- `trembling_timing`

All other families need either clarification-only handling or a separate product/clinical decision before schema widening.