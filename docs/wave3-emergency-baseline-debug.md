# Wave 3 Emergency Baseline Debug

- Generated at: 2026-04-17T22:28:51.396Z
- Source scorecard: `data/benchmarks/dog-triage/live-scorecard.json`
- Source suite: `data/benchmarks/dog-triage/wave3-freeze`
- Scorecard generated at: 2026-04-17T22:28:44.559Z
- Base URL captured in source scorecard: https://pawvital-ai.vercel.app
- Scope: tier 1 emergency cases expected to return `emergency`

## Snapshot

- Unique emergency failure cases: 76
- Emergency failure occurrences: 76
- Actual response types observed: question
- Ordered blocker groups: 39

## Root-Cause Buckets

| Bucket | Unique cases | Occurrences | Top complaint families |
| --- | --- | --- | --- |
| `complaint_normalization_miss` | 37 | 37 | dental_problem, diarrhea, difficulty_breathing |
| `question_orchestration_overrode_emergency` | 22 | 22 | difficulty_breathing, eye_discharge, lethargy |
| `missing_red_flag_linkage` | 11 | 11 | difficulty_breathing, lethargy, nasal_discharge |
| `deterministic_emergency_composite_not_triggered` | 5 | 5 | difficulty_breathing, pregnancy_birth, vomiting |
| `missing_owner_language_mapping` | 1 | 1 | excessive_scratching |
| `harness_route_contract_mismatch` | 0 | 0 | _none_ |
| `report_readiness_contract_mismatch` | 0 | 0 | _none_ |

## Ordered Residual Blockers

| Rank | Bucket | Complaint family | Actual | Unique cases | Example cases |
| --- | --- | --- | --- | --- | --- |
| 1 | `complaint_normalization_miss` | `difficulty_breathing` | question | 5 | emergency-blue-gums-breathing, emergency-breathing-labored, emergency-choking-foreign-body, emergency-difficulty-breathing-kennel, emergency-resting-open-mouth-breathing |
| 2 | `complaint_normalization_miss` | `pregnancy_birth` | question | 5 | emergency-dystocia, emergency-hard-labor-no-puppy, emergency-labor-green-discharge, emergency-postpartum-eclampsia, emergency-postpartum-heavy-bleeding |
| 3 | `missing_red_flag_linkage` | `seizure_collapse` | question | 5 | cardiac-emergency-collapse-after-excitement, cardiac-emergency-collapse-blue-gums, followup-consciousness-unknown-escalates, followup-seizure-duration-unknown, oncology-emergency-bleeding-splenic-rupture-style |
| 4 | `complaint_normalization_miss` | `seizure_collapse` | question | 4 | emergency-cluster-seizures, emergency-postictal-no-recovery, emergency-prolonged-seizure, emergency-seizure-first-time |
| 5 | `question_orchestration_overrode_emergency` | `difficulty_breathing` | question | 4 | followup-breathing-onset-unknown-escalates, followup-breathing-pattern-unknown, followup-gum-color-unknown-escalates, oncology-emergency-obstructive-neck-mass |
| 6 | `question_orchestration_overrode_emergency` | `vomiting` | question | 4 | emergency-toxin-xylitol, toxin-emergency-grapes-weakness, toxin-emergency-lily-chew, toxin-emergency-sago-palm |
| 7 | `complaint_normalization_miss` | `swollen_abdomen` | question | 3 | emergency-bloat-after-meal, emergency-bloat-gasdilation, emergency-gdv-retching |
| 8 | `complaint_normalization_miss` | `urination_problem` | question | 3 | emergency-urinary-blockage, emergency-urinary-blockage-distress, emergency-urinary-female-blockage |
| 9 | `complaint_normalization_miss` | `wound_skin_issue` | question | 3 | emergency-deep-bleeding-wound, emergency-dog-bite-wound, emergency-wound-deep-avulsion |
| 10 | `question_orchestration_overrode_emergency` | `medication_reaction` | question | 3 | emergency-rat-poison-bleeding, toxin-emergency-antifreeze, toxin-emergency-tremorgenic-mycotoxin |

## Critical Case Callouts

- `cardiac-emergency-collapse-after-excitement` -> `missing_red_flag_linkage` (seizure_collapse) — Collapse after excitement should short-circuit through the collapse red-flag path before question orchestration continues.
- `cardiac-emergency-collapse-blue-gums` -> `missing_red_flag_linkage` (seizure_collapse) — Blue or gray gums plus collapse are direct emergency cues and should never stay in question flow.
- `cardiac-emergency-rapid-breathing-pale` -> `deterministic_emergency_composite_not_triggered` (difficulty_breathing) — Rapid breathing plus pallor and weakness matches a shock-style emergency composite that did not trigger.
- `cardiac-emergency-resting-breathing-distress` -> `missing_red_flag_linkage` (difficulty_breathing) — Resting respiratory distress in a cardiac presentation should link directly to a respiratory emergency outcome.
- `emergency-acute-paralysis` -> `missing_red_flag_linkage` (trauma) — Sudden hind-limb paralysis is a neurologic red flag that still fell through to a question response.
- `emergency-addisonian-crisis` -> `deterministic_emergency_composite_not_triggered` (vomiting) — Intermittent vomiting plus collapse should match an Addisonian-crisis emergency composite.
- `emergency-allergic-reaction-hives` -> `missing_owner_language_mapping` (excessive_scratching) — Owner wording around hives and a puffing face was routed like an itching complaint instead of a severe-allergy emergency.
- `emergency-anaphylaxis` -> `deterministic_emergency_composite_not_triggered` (difficulty_breathing) — Facial swelling plus breathing trouble should trigger the anaphylaxis composite immediately.
