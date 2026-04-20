# Wave 3 Release Gate Report

- Result: FAIL
- Suite ID: wave3-freeze
- Suite version: wave3-freeze-v2
- Manifest hash: 3082027e2e6752178849a8a92306186d24d242fd7050fe0f9300a82891089c7f
- Canonical manifest generated at: 2026-04-17T16:44:31.613Z
- Total frozen cases: 226
- Scorecard case count: 226
- Emergency recall: 92.1%
- Unsafe downgrade rate: 2.65%
- Extra case IDs: none
- Missing case IDs: none

## Failures

- Emergency recall 92.1% is below the 98.0% gate.
- Unsafe downgrade rate 2.65% exceeds the 1.00% gate.
- 12 blocking failure(s) still hit rare-but-critical or must-not-miss cases.

## Warnings

_None_

## Failure Bands

- Critical release blockers: 6 (emergency-postpartum-eclampsia, emergency-protozoal-acute-babesia, emergency-urinary-blockage, emergency-vomit-blood-collapse, emergency-vomiting-green, emergency-wound-deep-avulsion)
- High non-blocking failures: 12 (question-trauma-fall-yard, sameday-behavior-hiding, sameday-chronic-limp-sudden-worse, sameday-dental-bleeding-gum, sameday-drinking-excessive, sameday-face-swelling-worsening, sameday-hair-loss-spreading, sameday-limping-non-weight-bearing, sameday-regurgitation-frequent, sameday-urinary-blood)
- Medium follow-up/readiness failures: 18 (followup-appetite-change-unknown, followup-diarrhea-frequency-unknown, followup-diarrhea-onset-unknown, followup-discharge-color-unknown, followup-energy-level-unknown, followup-itch-location-unknown, followup-limping-progression-unknown, followup-lump-size-unknown, followup-seasonal-pattern-unknown, followup-stool-consistency-unknown)

## Blocking High-Risk Failures

- emergency-postpartum-eclampsia: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth)
- emergency-protozoal-acute-babesia: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:lethargy)
- emergency-urinary-blockage: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:urination_problem)
- emergency-vomit-blood-collapse: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-vomiting-green: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-wound-deep-avulsion: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue)
- emergency-burn-chemical: MEDIUM expectation_mismatch (Failed checks: knownSymptomsInclude:wound_skin_issue)
- emergency-pale-gums-collapse: MEDIUM expectation_mismatch (Failed checks: knownSymptomsInclude:lethargy)
- emergency-post-vaccine-face-swelling: MEDIUM expectation_mismatch (Failed checks: knownSymptomsInclude:post_vaccination_reaction)
- emergency-postpartum-heavy-bleeding: MEDIUM expectation_mismatch (Failed checks: knownSymptomsInclude:pregnancy_birth)
- emergency-pyometra-style: MEDIUM expectation_mismatch (Failed checks: knownSymptomsInclude:vaginal_discharge)
- emergency-rat-poison-bleeding: MEDIUM expectation_mismatch (Failed checks: knownSymptomsInclude:medication_reaction)

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
