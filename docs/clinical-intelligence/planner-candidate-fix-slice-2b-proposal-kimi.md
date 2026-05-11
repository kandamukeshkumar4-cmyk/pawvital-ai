# Planner Candidate Fix Slice 2B Proposal Pack (VET-1464K)

## Scope

Proposal pack only.

This ticket adds only:

- `docs/clinical-intelligence/planner-candidate-fix-slice-2b-proposal-kimi.md`
- `tests/clinical-intelligence/planner-candidate-fix-slice-2b-proposal-pack.test.ts`

No runtime files touched.

It does not change planner behavior, adapter behavior, question cards,
complaint modules, fixtures, routing, UI, env, infra, or workflows.

## Purpose

VET-1462C already moved the safest generic-avoidance cases into accepted
symptom-specific follow-ups, and VET-1463Q locked that slice boundary.

This follow-up pack covers only the remaining non-repeated rows that still need
separate planning after Slice 2A and fixture normalization:

- `2` higher-risk planner-candidate rows still sitting on
  `emergency_global_screen`
- `2` Slice 2A residual rows that now pick accepted non-generic questions but
  still fail for red-flag coverage
- `1` fixture-only row normalized to `report_only_quality_gap`
  (`gi_vomiting_diarrhea_03_water_comes_back_up`)

The goal is to keep the remaining phase-priority, residual, and
mixed-symptom follow-ups split before any broader implementation ticket is
opened.

## Post-Slice-2A Boundary

- remaining slice-2B rows: `4`
- remaining higher-risk planner rows: `2`
- residual after Slice 2A: `2`
- excluded repeated-context rows: `2`
- fixture-only rows normalized: `1` (`gi_vomiting_diarrhea_03_water_comes_back_up`)
- standalone planner scoring rows after Slice 2A: `0`
- new adapter/trigger rows after Slice 2A: `0`

Rows already cleared by Slice 2A and therefore not included here:

- `skin_itching_allergy_02_paws_belly_itching`
- `edge_trauma_small_scrape_vs_steady_bleed`

Fixture-only row normalized out of this pack:

- `gi_vomiting_diarrhea_03_water_comes_back_up` (moved to `report_only_quality_gap`)

Repeated-context rows that stay outside this pack:

- `edge_trauma_repeat_bleeding_avoidance`
- `edge_skin_repeat_location_avoidance`

## Lane Split

- `phase_priority`
  `edge_limping_not_sure_pain_or_weakness`
- `mixed_symptom_planner_scoring`
  `edge_multi_diarrhea_limping_cut`
- `accepted_non_generic_question_but_red_flag_gap`
  `limping_mobility_pain_02_sudden_after_jump`
  `limping_mobility_pain_03_limping_with_wound_confuser`

There are no remaining standalone single-lane planner-scoring rows in this
pack. The only scoring-shaped follow-up left is the high-risk mixed-symptom
case, and it stays separate from lower-risk scoring work.

There are no new adapter/trigger rows in this pack. The two prior
`adapter_trigger` rows now stay here only as Slice 2A residuals because they
already moved to accepted non-generic questions.

There are no remaining fixture-only rows in this pack. The only fixture-only
candidate (`gi_vomiting_diarrhea_03_water_comes_back_up`) was normalized to
`report_only_quality_gap` by VET-1469C.

## Edge-Case Coverage and Telemetry Hygiene

This proposal pack intentionally covers every remaining non-repeated Slice 2B
candidate row after Slice 2A and fixture normalization:

- module phase priority between limping and weakness:
  `edge_limping_not_sure_pain_or_weakness`
- high-risk mixed-symptom scoring:
  `edge_multi_diarrhea_limping_cut`
- residual red-flag coverage after accepted non-generic Slice 2A moves:
  `limping_mobility_pain_02_sudden_after_jump`
  `limping_mobility_pain_03_limping_with_wound_confuser`

The fixture-only GI hydration row was normalized out of this pack:

- `gi_vomiting_diarrhea_03_water_comes_back_up` → `report_only_quality_gap`

The only excluded planner-candidate rows are the two repeated-context cases
already assigned to a separate avoidance lane:

- `edge_trauma_repeat_bleeding_avoidance`
- `edge_skin_repeat_location_avoidance`

The pack contains no runtime telemetry, owner telemetry, production user data,
secrets, environment values, deployment identifiers, or raw application logs.
The only evidence included is fixture case IDs, expected question IDs, selected
module IDs, failure-class labels, and aggregate eval counters needed to lock
the proposal boundary.

## Remaining Higher-Risk Planner Rows

| Case ID | Lane | Current planned question | Selected complaint module | Regression risk |
| --- | --- | --- | --- | --- |
| `edge_limping_not_sure_pain_or_weakness` | `phase_priority` | `emergency_global_screen` | `collapse_weakness` | `high` |
| `edge_multi_diarrhea_limping_cut` | `mixed_symptom_planner_scoring` | `emergency_global_screen` | `gi_vomiting_diarrhea` | `high` |

## Residual Slice 2A Rows

| Case ID | Prior Slice 2A owner | Current planned question | Residual status | Missing required red flags |
| --- | --- | --- | --- | --- |
| `limping_mobility_pain_02_sudden_after_jump` | `adapter_trigger` | `limping_weight_bearing` | `accepted_non_generic_question_but_red_flag_gap` | `post_trauma_lameness` |
| `limping_mobility_pain_03_limping_with_wound_confuser` | `adapter_trigger` | `bleeding_volume_check` | `accepted_non_generic_question_but_red_flag_gap` | `post_trauma_lameness`, `non_weight_bearing` |

## Structured Proposal Data

```json
{
  "remainingPlannerCandidateRows": [
    {
      "caseId": "edge_limping_not_sure_pain_or_weakness",
      "recommendedFixLane": "phase_priority",
      "regressionRisk": "high",
      "selectedComplaintModule": "collapse_weakness",
      "currentPlannedQuestionId": "emergency_global_screen",
      "acceptableTargetQuestionIds": [
        "limping_weight_bearing",
        "collapse_weakness_check",
        "limping_trauma_onset",
        "gum_color_check"
      ],
      "blockingFailureClasses": [
        "generic_metric_setup_gap",
        "red_flag_coverage_gap",
        "fixture_ambiguity"
      ],
      "minimalFutureScope": [
        "src/lib/clinical-intelligence/next-question-planner.ts",
        "src/lib/clinical-intelligence/complaint-modules/limping.ts",
        "src/lib/clinical-intelligence/complaint-modules/collapse-weakness.ts"
      ],
      "followUpBoundary": "Keep this in a phase-priority ambiguity lane between limping and weakness cards; do not bundle it with broad mixed-symptom scoring."
    },
    {
      "caseId": "edge_multi_diarrhea_limping_cut",
      "recommendedFixLane": "mixed_symptom_planner_scoring",
      "regressionRisk": "high",
      "selectedComplaintModule": "gi_vomiting_diarrhea",
      "currentPlannedQuestionId": "emergency_global_screen",
      "acceptableTargetQuestionIds": [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "wound_characterization_check",
        "bleeding_volume_check",
        "gi_blood_check"
      ],
      "blockingFailureClasses": [
        "generic_metric_setup_gap",
        "red_flag_coverage_gap",
        "fixture_ambiguity"
      ],
      "minimalFutureScope": [
        "src/lib/clinical-intelligence/next-question-planner.ts"
      ],
      "followUpBoundary": "Keep this as the only high-risk mixed-symptom scoring lane; do not merge it with single-lane scoring or trigger follow-ups."
    }
  ],
  "residualSlice2ARows": [
    {
      "caseId": "limping_mobility_pain_02_sudden_after_jump",
      "priorSlice2AFixOwner": "adapter_trigger",
      "regressionRisk": "medium",
      "selectedComplaintModule": "limping_mobility_pain",
      "currentPlannedQuestionId": "limping_weight_bearing",
      "currentSelectedBecause": "highest_information_gain",
      "acceptableTargetQuestionIds": [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "trauma_mechanism_check"
      ],
      "missingRequiredRedFlags": [
        "post_trauma_lameness"
      ],
      "residualStatus": "accepted_non_generic_question_but_red_flag_gap",
      "residualBoundary": "Keep this out of a new generic-avoidance planner slice; the remaining work is red-flag coverage on an already accepted limping lane."
    },
    {
      "caseId": "limping_mobility_pain_03_limping_with_wound_confuser",
      "priorSlice2AFixOwner": "adapter_trigger",
      "regressionRisk": "medium",
      "selectedComplaintModule": "limping_mobility_pain",
      "currentPlannedQuestionId": "bleeding_volume_check",
      "currentSelectedBecause": "emergency_screen",
      "acceptableTargetQuestionIds": [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "wound_characterization_check",
        "bleeding_volume_check"
      ],
      "missingRequiredRedFlags": [
        "post_trauma_lameness",
        "non_weight_bearing"
      ],
      "residualStatus": "accepted_non_generic_question_but_red_flag_gap",
      "residualBoundary": "Keep this out of a new generic-avoidance planner slice; the remaining work is red-flag coverage after the accepted wound-or-limping move."
    }
  ],
  "laneSummary": {
    "remainingPlannerCandidateCaseIds": [
      "edge_limping_not_sure_pain_or_weakness",
      "edge_multi_diarrhea_limping_cut"
    ],
    "residualSlice2ACaseIds": [
      "limping_mobility_pain_02_sudden_after_jump",
      "limping_mobility_pain_03_limping_with_wound_confuser"
    ],
    "excludedRepeatedContextCaseIds": [
      "edge_trauma_repeat_bleeding_avoidance",
      "edge_skin_repeat_location_avoidance"
    ],
    "passedSlice2ACaseIds": [
      "skin_itching_allergy_02_paws_belly_itching",
      "edge_trauma_small_scrape_vs_steady_bleed"
    ],
    "fixtureOnlyCaseIds": [],
    "plannerScoringCaseIds": [],
    "phasePriorityCaseIds": [
      "edge_limping_not_sure_pain_or_weakness"
    ],
    "mixedSymptomRiskCaseIds": [
      "edge_multi_diarrhea_limping_cut"
    ],
    "adapterTriggerCaseIds": []
  },
  "edgeCaseCoverage": {
    "coverageSummary": "Covers all four remaining non-repeated post-Slice-2A planner candidates after fixture normalization and excludes only the two repeated-context rows assigned to a separate avoidance lane.",
    "edgeCaseBuckets": [
      {
        "bucket": "module_phase_priority",
        "caseIds": [
          "edge_limping_not_sure_pain_or_weakness"
        ],
        "edgeCaseRisk": "high",
        "asserts": [
          "limping versus collapse weakness ambiguity",
          "current emergency_global_screen selection",
          "phase-priority future scope"
        ]
      },
      {
        "bucket": "high_risk_mixed_symptom",
        "caseIds": [
          "edge_multi_diarrhea_limping_cut"
        ],
        "edgeCaseRisk": "high",
        "asserts": [
          "mixed GI, limping, wound, and bleeding signals",
          "current emergency_global_screen selection",
          "planner-scoring future scope kept separate"
        ]
      },
      {
        "bucket": "residual_after_slice_2a",
        "caseIds": [
          "limping_mobility_pain_02_sudden_after_jump",
          "limping_mobility_pain_03_limping_with_wound_confuser"
        ],
        "edgeCaseRisk": "medium",
        "asserts": [
          "accepted non-generic question already selected",
          "generic avoidance already satisfied",
          "remaining red-flag coverage gap only"
        ]
      }
    ],
    "excludedAsSeparateWork": [
      "edge_trauma_repeat_bleeding_avoidance",
      "edge_skin_repeat_location_avoidance"
    ]
  },
  "telemetryHygiene": {
    "containsRuntimeTelemetry": false,
    "containsOwnerTelemetry": false,
    "containsProductionUserData": false,
    "containsSecretsOrEnvValues": false,
    "containsDeploymentIdentifiers": false,
    "allowedEvidence": [
      "fixture case IDs",
      "expected question IDs",
      "selected module IDs",
      "failure-class labels",
      "aggregate eval counters"
    ]
  },
  "globalGuardrails": {
    "plannerImprovementCandidateCount": 6,
    "remainingSlice2BCaseCount": 4,
    "remainingHigherRiskPlannerCandidateCount": 2,
    "residualAfterSlice2ACount": 2,
    "excludedRepeatedContextCandidateCount": 2,
    "genericQuestionEligibleCases": 10,
    "genericQuestionAvoidanceCount": 4,
    "repeatedQuestionEligibleCases": 6,
    "repeatedQuestionAvoidanceCount": 6,
    "repeatedQuestionAvoidanceRate": 1,
    "emergencyScreenAlignmentCount": 40,
    "emergencyScreenAlignmentRelevantCases": 40,
    "emergencyScreenAlignmentRate": 1,
    "rawFailedCaseCount": 54,
    "normalizedFailedCaseCount": 53
  },
  "requiredValidationCommands": [
    "npm test -- --runTestsByPath tests/clinical-intelligence/planner-candidate-fix-slice-2b-proposal-pack.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
    "node scripts/eval-shadow-planner-scenarios.ts --json",
    "npm run build"
  ]
}
```

## Notes

- Proposal pack only.
- No runtime files touched.
