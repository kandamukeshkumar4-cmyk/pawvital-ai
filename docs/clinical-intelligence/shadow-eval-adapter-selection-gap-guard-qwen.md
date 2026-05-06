# Shadow Eval Adapter-Selection Gap Guard (VET-1454Q)

## Scope

Validation-only guard.

This ticket adds only:

- `tests/clinical-intelligence/shadow-eval-adapter-selection-gap-guard.test.ts`
- `docs/clinical-intelligence/shadow-eval-adapter-selection-gap-guard-qwen.md`

No runtime files touched.

It does not change adapter implementation, planner scoring, scenario-eval logic,
question cards, complaint modules, fixtures, routing, UI, env, infra, or
workflow behavior.

## Purpose

VET-1449Q already isolated a narrow adapter-selection hotspot inside the
report-only shadow planner eval. This guard locks the exact audited cases so a
future fix can target the real mismatch without changing planner behavior in
this ticket.

The audited question for each case is not "did the module match?" The audited
question is "which review owner should handle the current mismatch once runtime
work is allowed?"

## Guard Rules

- Record the reviewed red-flag hotspot per case.
- Record the expected module and actual module selected by the live eval.
- Record the owner phrase trigger that makes the mismatch concrete.
- Record the recommended fix owner for the next ticket.
- Keep the current result report-only. This ticket does not authorize adapter
  or planner changes.

## Audited Cases

| Case ID | Audited red flag | Expected module | Actual module | Actual selected question | Owner phrase trigger | Classification | Recommended fix owner | Reviewed interpretation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gi_vomiting_diarrhea_03_water_comes_back_up` | `persistent_vomiting` | `gi_vomiting_diarrhea` | `gi_vomiting_diarrhea` | `emergency_global_screen` | `comes back up soon after` | `fixture_text_mismatch` | `expected_outcome_fixture` | The module and family already match. The reviewed trigger language lines up directly with the water-retention question, so the current persistent-vomiting labeling is best treated as a fixture-text mismatch rather than a family-remap gap. |
| `limping_mobility_pain_02_sudden_after_jump` | `non_weight_bearing` | `limping_mobility_pain` | `limping_mobility_pain` | `emergency_global_screen` | `toe-touching` | `missing_module_trigger` | `adapter_trigger_surface` | The limping module already matches and the owner wording already contains the weight-bearing discriminator. The next fix should target adapter-side trigger or selection behavior, not fixture drift. |
| `limping_mobility_pain_03_limping_with_wound_confuser` | `non_weight_bearing` | `limping_mobility_pain` | `limping_mobility_pain` | `emergency_global_screen` | `small cut between the toes` | `missing_module_trigger` | `adapter_trigger_surface` | The case is multi-symptom, but the live eval still keeps the limping module. The current miss is the question-selection trigger surface, not a complaint-family remap and not a question-card coverage hole. |

## Classification Totals

- `missing_module_trigger`: 2
- `fixture_text_mismatch`: 1
- `adapter_family_mapping_gap`: 0
- `acceptable_ambiguity`: 0

## What The Guard Confirms

No safety blockers are confirmed for these audited cases.

No question-card gaps are confirmed for these audited cases.

The current audited rows are all still quality-only, report-only failures:

- each row keeps the expected complaint module
- each row currently over-selects `emergency_global_screen`
- each row keeps the future fix narrow instead of implying a planner rewrite

## What The Guard Rejects

- This is not evidence of a current safety-routing break.
- This is not evidence of a question-card registry gap for the audited rows.
- This is not evidence of an `adapter_family_mapping_gap`; the expected and
  actual modules already match in all three audited cases.
- This is not a license to change fixtures in this ticket. The guard only
  records that one reviewed case is best treated as `fixture_text_mismatch` for
  a future follow-up owner.

## Next-Ticket Boundary

Any future code or fixture fix should stay narrow:

- `expected_outcome_fixture` owns the one reviewed
  `fixture_text_mismatch` row
- `adapter_trigger_surface` owns the two reviewed
  `missing_module_trigger` rows

That follow-up must be separate from this validation-only guard.

## Notes

- Validation-only guard.
- No runtime files touched.
