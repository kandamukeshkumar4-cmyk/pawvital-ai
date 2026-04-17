# Wave 3 Release Gate Report

- Generated at: 2026-04-17T22:28:53.691Z
- Result: FAIL
- Suite ID: dog-triage-wave3-freeze
- Manifest hash: b2675532644dd12fd074c09b2cfffdfd937451360773e728ec6763d30f61dd82
- Total frozen cases: 226
- Scorecard case count: 226
- Scorecard generatedAt: 2026-04-17T22:28:44.559Z
- Scorecard observed suiteId: dog-triage-wave3-freeze
- Emergency recall: 0.0%
- Unsafe downgrade rate: 33.63%

## Suite Identity

- Extra case IDs: none
- Missing case IDs: none
- Duplicate case IDs: none

- Suite identity aligned with the canonical Wave 3 manifest.

## Failures

- Emergency recall 0.0% is below the 98.0% gate.
- Unsafe downgrade rate 33.63% exceeds the 1.00% gate.
- 76 blocking failure(s) still hit rare-but-critical or must-not-miss cases.

## Warnings

_None_

## Blocking High-Risk Failures

- cardiac-emergency-collapse-after-excitement: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- cardiac-emergency-collapse-blue-gums: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- cardiac-emergency-rapid-breathing-pale: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- cardiac-emergency-resting-breathing-distress: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-acute-paralysis: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-addisonian-crisis: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-allergic-reaction-hives: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-anaphylaxis: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-bloat-after-meal: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:swollen_abdomen)
- emergency-bloat-gasdilation: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:swollen_abdomen)
- emergency-blue-gums-breathing: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing)
- emergency-breathing-labored: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing)
- emergency-burn-chemical: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-choking-foreign-body: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing)
- emergency-cluster-seizures: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:seizure_collapse)
- emergency-deep-bleeding-wound: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue)
- emergency-diabetic-crisis: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-difficulty-breathing-kennel: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing)
- emergency-dog-bite-wound: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue)
- emergency-dystocia: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth)

## Missing High-Stakes Rule IDs

_None_

## Expired Tier A/B Entries

_None_

## Complaint Family Scorecard

| Bucket | Cases |
| --- | ---: |
| abnormal_gait | 1 |
| aggression | 1 |
| behavior_change | 10 |
| blood_in_stool | 3 |
| constipation | 1 |
| coughing | 7 |
| coughing_breathing_combined | 6 |
| dental_problem | 6 |
| diarrhea | 9 |
| difficulty_breathing | 12 |
| drinking_more | 6 |
| ear_scratching | 4 |
| excessive_scratching | 10 |
| exercise_induced_lameness | 2 |
| eye_discharge | 3 |
| fecal_incontinence | 3 |
| generalized_stiffness | 2 |
| hair_loss | 3 |
| hearing_loss | 1 |
| heat_intolerance | 1 |
| inappropriate_urination | 2 |
| lethargy | 13 |
| limping | 14 |
| medication_reaction | 13 |
| multi_system_decline | 1 |
| nasal_discharge | 3 |
| not_eating | 2 |
| oral_mass | 5 |
| pacing_restlessness | 1 |
| post_vaccination_reaction | 3 |
| postoperative_concern | 1 |
| pregnancy_birth | 11 |
| recurrent_ear | 1 |
| recurrent_skin | 6 |
| regurgitation | 2 |
| seizure_collapse | 11 |
| senior_decline | 6 |
| skin_odor_greasy | 3 |
| swelling_lump | 8 |
| swollen_abdomen | 10 |
| testicular_prostate | 3 |
| trauma | 5 |
| trembling | 8 |
| urination_problem | 6 |
| vaginal_discharge | 6 |
| vision_loss | 2 |
| vomiting | 19 |
| vomiting_diarrhea_combined | 2 |
| weight_loss | 6 |
| wound_skin_issue | 11 |

## Risk Tier Scorecard

| Bucket | Cases |
| --- | ---: |
| tier_1_emergency | 76 |
| tier_2_same_day | 26 |
| tier_3_48h_monitor | 124 |

## Modality Scorecard

| Bucket | Cases |
| --- | ---: |
| breathing_effort | 7 |
| gait_analysis | 6 |
| gums_color | 6 |
| skin_lesion | 6 |
| stool_analysis | 6 |
| vomit_analysis | 6 |

