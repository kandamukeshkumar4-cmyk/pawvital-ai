# VET-1449Q Shadow Eval Red-Flag Coverage Audit Guard

## Scope

Validation-only audit.

This ticket adds only:

- `tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts`
- `docs/clinical-intelligence/shadow-eval-red-flag-coverage-audit-qwen.md`

No runtime files touched.

It does not change planner behavior, adapter behavior, question cards, complaint modules, fixtures, routing, UI, env, infra, or workflows.

## Purpose

VET-1447C already identified the top under-screened red flags in the current shadow planner scenario eval. This audit guard narrows that report into a validation-only answer for the next reviewer:

- is a red-flag miss caused by missing acceptable expectations
- is it caused by missing registered question-card coverage
- is it caused by adapter or planner selection
- or is it still a report-only gap even though the current selected question remains acceptable

The guard is intentionally read-only. It classifies the current failures without changing runtime behavior.

## Audit Categories

- `fixture_expectation_gap`
  The acceptable expectation set is too narrow for the current safety-aligned selection.

- `registered_question_card_gap`
  No registry-backed acceptable question in the case covers the red flag at all.

- `adapter_selection_gap`
  A registry-backed acceptable question does cover the red flag, but the selected question is outside the acceptable set and misses it.

- `acceptable_report_only_gap`
  The selected question is still acceptable for the case, but the current report-only evaluation still records a missing red flag.

## Current Guard Findings

No safety blockers are introduced within the audited red-flag cases.

Emergency alignment remains 100% in the current eval.

Current scenario-eval confirmation:

- `emergencyScreenAlignmentCount = 23`
- `emergencyScreenAlignmentRelevantCases = 23`
- `emergencyScreenAlignmentRate = 1`
- audited red-flag safety blockers: `0`

## Top Red-Flag Audit

| Red flag | Current count | Dominant classification | Current interpretation |
| --- | ---: | --- | --- |
| `persistent_vomiting` | 8 | `acceptable_report_only_gap` | Most misses happen on cases where `emergency_global_screen` is still acceptable, so this is mainly a report-only coverage miss rather than a missing-card or fixture problem. |
| `acute_weakness` | 5 | `acceptable_report_only_gap` | The acceptable sets already contain weakness-screening cards, but the current selected question still leaves the flag uncovered in otherwise acceptable comparisons. |
| `heatstroke_signs` | 4 | `acceptable_report_only_gap` | The broader report includes one `fixture_expectation_gap`, but the dominant current cause is still acceptable report-only coverage on emergency-aligned cases. |
| `gastric_dilatation_volvulus` | 3 | `acceptable_report_only_gap` | Bloat-specific acceptable cards exist, yet the current acceptable emergency selection still leaves the flag missing in the report. |
| `large_blood_volume` | 1 | `acceptable_report_only_gap` | The remaining large-blood-volume miss is still a report-only trauma gap rather than a missing-card or fixture blocker. |
| `non_weight_bearing` | 2 | `acceptable_report_only_gap` | The remaining non-weight-bearing misses now stay inside acceptable limping follow-ups, so the hotspot is no longer dominated by off-topic adapter selection. |
| `suspected_toxin` | 3 | `acceptable_report_only_gap` | Toxin acceptable sets already include `toxin_exposure_check`; the current misses are from acceptable report-only selection, not missing registry coverage. |
| `urinary_obstruction` | 3 | `acceptable_report_only_gap` | Urinary acceptable sets already include `urinary_blockage_check`, so the current misses are report-only rather than a question-card gap. |

## Category Count Detail

The audit guard locks the current per-flag breakdown:

- `persistent_vomiting`
  - `fixture_expectation_gap`: 0
  - `registered_question_card_gap`: 0
  - `adapter_selection_gap`: 1
  - `acceptable_report_only_gap`: 7

- `acute_weakness`
  - `fixture_expectation_gap`: 0
  - `registered_question_card_gap`: 0
  - `adapter_selection_gap`: 0
  - `acceptable_report_only_gap`: 5

- `heatstroke_signs`
  - `fixture_expectation_gap`: 1
  - `registered_question_card_gap`: 0
  - `adapter_selection_gap`: 0
  - `acceptable_report_only_gap`: 3

- `gastric_dilatation_volvulus`
  - `fixture_expectation_gap`: 0
  - `registered_question_card_gap`: 0
  - `adapter_selection_gap`: 0
  - `acceptable_report_only_gap`: 3

- `large_blood_volume`
  - `fixture_expectation_gap`: 0
  - `registered_question_card_gap`: 0
  - `adapter_selection_gap`: 0
  - `acceptable_report_only_gap`: 1

- `non_weight_bearing`
  - `fixture_expectation_gap`: 0
  - `registered_question_card_gap`: 0
  - `adapter_selection_gap`: 0
  - `acceptable_report_only_gap`: 2

- `suspected_toxin`
  - `fixture_expectation_gap`: 0
  - `registered_question_card_gap`: 0
  - `adapter_selection_gap`: 0
  - `acceptable_report_only_gap`: 3

- `urinary_obstruction`
  - `fixture_expectation_gap`: 0
  - `registered_question_card_gap`: 0
  - `adapter_selection_gap`: 0
  - `acceptable_report_only_gap`: 3

## What This Means

- None of the eight audited top red flags currently require a `registered_question_card_gap` follow-up.
- `non_weight_bearing` is no longer primarily an `adapter_selection_gap` in the current scenario pack.
- `heatstroke_signs` still shows one real `fixture_expectation_gap`, but its dominant current pattern is still `acceptable_report_only_gap`.
- The rest of the audited top red flags are dominated by `acceptable_report_only_gap`, which means the current scenario eval can stay explicitly report-only while follow-up tickets remain narrow.

## Guardrail

This audit does not authorize runtime cutover, planner rewrites, or question-card edits.

It only confirms that, for the current VET-1447C top red-flag list:

- the audited red-flag cases introduce no safety blocker
- emergency alignment remains intact
- the dominant remaining causes are mostly report-only, including the current `non_weight_bearing` rows
