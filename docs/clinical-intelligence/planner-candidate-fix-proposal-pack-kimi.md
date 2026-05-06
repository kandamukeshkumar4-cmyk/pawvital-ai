# Planner Candidate Fix Proposal Pack (VET-1458K)

## Scope

Proposal pack only.

This ticket adds only:

- `docs/clinical-intelligence/planner-candidate-fix-proposal-pack-kimi.md`
- `tests/clinical-intelligence/planner-candidate-fix-proposal-pack.test.ts`

No runtime files touched.

It does not change planner code, adapter code, question cards, complaint
modules, fixtures, routing, UI, env, infra, or workflows.

## Purpose

The shadow-eval failure annotation pack currently marks `9` rows as
`planner_improvement_candidate`. Those rows still need implementation-ready
follow-up proposals, but they should not all be routed into planner-owned work
by default.

This pack separates:

- planner-owned follow-up lanes
- fixture follow-up lanes
- adapter follow-up lanes
- question-card metadata follow-up lanes

The goal is to keep future implementation tickets narrow and to avoid mixing a
true planner selection problem with a fixture or adapter correction.

## Proposal Split

- Planner-owned proposals: `5`
- Non-planner follow-up proposals: `4`
- `scoring_weight_adjustment`: `3`
- `module_phase_priority_adjustment`: `2`
- `question_card_metadata_adjustment`: `1`
- `fixture_expectation_adjustment`: `1`
- `adapter_trigger_adjustment`: `2`

Planner-owned proposals in this pack use only:

- `scoring_weight_adjustment`
- `module_phase_priority_adjustment`

Non-planner follow-up proposals in this pack use only:

- `question_card_metadata_adjustment`
- `fixture_expectation_adjustment`
- `adapter_trigger_adjustment`

## Planner-Owned Proposal Lanes

| Case ID | Proposed fix type | Why this stays planner-owned |
| --- | --- | --- |
| `skin_itching_allergy_02_paws_belly_itching` | `module_phase_priority_adjustment` | The skin module already matches and the accepted targets are routine skin follow-ups, so the next correction is the planner phase order rather than fixture or adapter drift. |
| `edge_trauma_small_scrape_vs_steady_bleed` | `scoring_weight_adjustment` | The accepted trauma questions already cover the live wording; the current miss is that targeted bleeding and wound prompts are not outranking the global fallback. |
| `edge_trauma_repeat_bleeding_avoidance` | `scoring_weight_adjustment` | The repeated setup is already present, so the next change is to planner weighting around remaining wound and limping prompts rather than to the fixture surface. |
| `edge_limping_not_sure_pain_or_weakness` | `module_phase_priority_adjustment` | The accepted targets already span the allowed limping and weakness lanes; the planner needs a better ambiguity-resolution phase before it reaches the generic fallback. |
| `edge_multi_diarrhea_limping_cut` | `scoring_weight_adjustment` | The accepted targets already cover the mixed GI, limping, and wound picture, so the next change is to the relative weight of those concrete follow-ups. |

## Non-Planner Follow-Up Lanes

| Case ID | Proposed fix type | Why this should not start as a planner rewrite |
| --- | --- | --- |
| `gi_vomiting_diarrhea_03_water_comes_back_up` | `fixture_expectation_adjustment` | The adapter-selection guard already classifies this row as a fixture-text mismatch, so the next follow-up should reconcile the accepted expectation before planner scoring is changed. |
| `limping_mobility_pain_02_sudden_after_jump` | `adapter_trigger_adjustment` | The adapter-selection guard already marks this row as a missing trigger-surface case because the limping module matches and the owner wording already carries the weight-bearing clue. |
| `limping_mobility_pain_03_limping_with_wound_confuser` | `adapter_trigger_adjustment` | The adapter-selection guard already routes this row to trigger-surface follow-up rather than a planner score change. |
| `edge_skin_repeat_location_avoidance` | `question_card_metadata_adjustment` | The repeat setup already says location was answered. The remaining gap is whether the specific follow-up card surfaces strongly enough after that answered context. |

## Structured Proposal Data

```json
[
  {
    "caseId": "gi_vomiting_diarrhea_03_water_comes_back_up",
    "ownerTextSummary": "Water comes back up after drinking, with loose stool still present.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "gi_keep_water_down_check",
      "gi_vomiting_frequency",
      "gi_blood_check"
    ],
    "whyCurrentQuestionIsWeak": "The current question stays generic even though the accepted GI targets already cover the water-retention concern more directly. The existing adapter-selection guard also routes this row into an expectation-mismatch lane before a planner-selection defect.",
    "proposedFixType": "fixture_expectation_adjustment",
    "riskLevel": "low",
    "requiredFutureValidation": "Rerun the adapter-selection gap guard, the failure-annotation pack, and the scenario eval to confirm this row leaves the planner-candidate lane without changing emergency alignment."
  },
  {
    "caseId": "skin_itching_allergy_02_paws_belly_itching",
    "ownerTextSummary": "Persistent paw licking and belly scratching with red skin.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "skin_location_distribution",
      "skin_changes_check",
      "skin_exposure_check"
    ],
    "whyCurrentQuestionIsWeak": "The generic emergency screen skips the ordinary skin-localization phase even though the case does not require an emergency-first question and the accepted targets already define a narrower next step.",
    "proposedFixType": "module_phase_priority_adjustment",
    "riskLevel": "medium",
    "requiredFutureValidation": "Rerun the scenario eval and failure-annotation pack, then confirm that a skin-localization question is selected before any generic emergency fallback."
  },
  {
    "caseId": "limping_mobility_pain_02_sudden_after_jump",
    "ownerTextSummary": "Toe-touching limp after a jump off furniture.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "trauma_mechanism_check"
    ],
    "whyCurrentQuestionIsWeak": "The accepted limping and trauma questions already line up with the owner wording, and the adapter-selection guard classifies this row as a missing trigger-surface case rather than a planner-scoring miss.",
    "proposedFixType": "adapter_trigger_adjustment",
    "riskLevel": "medium",
    "requiredFutureValidation": "Rerun the adapter-selection gap guard, the scenario eval, and the failure-annotation pack to confirm the limping trigger surface activates one of the accepted target questions without reducing emergency alignment."
  },
  {
    "caseId": "limping_mobility_pain_03_limping_with_wound_confuser",
    "ownerTextSummary": "Limping after brush exposure with a small cut between the toes.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check"
    ],
    "whyCurrentQuestionIsWeak": "The accepted follow-up set is already explicit, and the current adapter-selection guard routes this row to trigger-surface follow-up instead of planner weighting.",
    "proposedFixType": "adapter_trigger_adjustment",
    "riskLevel": "medium",
    "requiredFutureValidation": "Rerun the adapter-selection gap guard, the scenario eval, and the failure-annotation pack to confirm the mixed limping and wound trigger surface produces one of the accepted target questions."
  },
  {
    "caseId": "edge_trauma_small_scrape_vs_steady_bleed",
    "ownerTextSummary": "A small scrape escalates into a steady line of blood.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "bleeding_volume_check",
      "wound_characterization_check",
      "laceration_depth_check",
      "trauma_mechanism_check"
    ],
    "whyCurrentQuestionIsWeak": "The generic emergency screen does not help choose among the already accepted bleeding and wound prompts. The steady-bleed signal needs to outrank the blanket fallback.",
    "proposedFixType": "scoring_weight_adjustment",
    "riskLevel": "medium",
    "requiredFutureValidation": "Rerun the scenario eval, the failure-annotation pack, and the red-flag coverage audit to confirm that a trauma-specific target question wins while required bleeding coverage stays complete."
  },
  {
    "caseId": "edge_trauma_repeat_bleeding_avoidance",
    "ownerTextSummary": "An open paw-pad cut and limping remain after bleeding volume was already answered.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "wound_characterization_check",
      "laceration_depth_check",
      "limping_weight_bearing",
      "limping_trauma_onset"
    ],
    "whyCurrentQuestionIsWeak": "The planner falls back to the generic emergency screen instead of using the existing answered-bleeding context to prefer the remaining wound or limping prompts.",
    "proposedFixType": "scoring_weight_adjustment",
    "riskLevel": "medium",
    "requiredFutureValidation": "Rerun the repeated-question edge replay, the scenario eval, and the failure-annotation pack to confirm a non-repeated wound or limping target question outranks the generic fallback."
  },
  {
    "caseId": "edge_skin_repeat_location_avoidance",
    "ownerTextSummary": "Paws-and-belly distribution was already answered, but scratching continues.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "skin_emergency_allergy_screen"
    ],
    "whyCurrentQuestionIsWeak": "Once location is already known, the only accepted next question is the more specific skin-emergency screen. The current fallback suggests that card metadata is not surfacing that follow-up strongly enough after answered context.",
    "proposedFixType": "question_card_metadata_adjustment",
    "riskLevel": "medium",
    "requiredFutureValidation": "Rerun the repeated-question edge replay, the scenario eval, and the failure-annotation pack to confirm skin_emergency_allergy_screen is selected after skin_location_distribution is already answered."
  },
  {
    "caseId": "edge_limping_not_sure_pain_or_weakness",
    "ownerTextSummary": "It is unclear whether the dog is limping from leg pain or weak all over.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "collapse_weakness_check",
      "limping_trauma_onset",
      "gum_color_check"
    ],
    "whyCurrentQuestionIsWeak": "The accepted targets already span the two allowed module lanes. The current question skips that ambiguity-resolution phase and jumps straight to the generic emergency fallback.",
    "proposedFixType": "module_phase_priority_adjustment",
    "riskLevel": "high",
    "requiredFutureValidation": "Rerun the scenario eval, the red-flag coverage audit, and the failure-annotation pack to confirm the first question stays inside the accepted limping or weakness phase without lowering emergency alignment."
  },
  {
    "caseId": "edge_multi_diarrhea_limping_cut",
    "ownerTextSummary": "Loose stool, limping, and a toe cut all appear together.",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check",
      "gi_blood_check"
    ],
    "whyCurrentQuestionIsWeak": "The case has multiple targeted first-question options across accepted modules, but the generic emergency screen bypasses all of them. The mixed-symptom weights need to let one concrete follow-up outrank the global fallback.",
    "proposedFixType": "scoring_weight_adjustment",
    "riskLevel": "high",
    "requiredFutureValidation": "Rerun the scenario eval, the red-flag coverage audit, and the failure-annotation pack to confirm a targeted follow-up wins while all accepted module lanes remain valid."
  }
]
```

## Notes

- Proposal pack only.
- No runtime files touched.
