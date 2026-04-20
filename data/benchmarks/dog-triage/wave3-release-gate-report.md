# Wave 3 Release Gate Report

- Result: FAIL
- Suite ID: wave3-freeze
- Suite version: wave3-freeze-v2
- Manifest hash: 3082027e2e6752178849a8a92306186d24d242fd7050fe0f9300a82891089c7f
- Canonical manifest generated at: 2026-04-17T16:44:31.613Z
- Total frozen cases: 226
- Scorecard case count: 226
- Emergency recall: 55.3%
- Unsafe downgrade rate: 15.04%
- Extra case IDs: none
- Missing case IDs: none

## Failures

- Emergency recall 55.3% is below the 98.0% gate.
- Unsafe downgrade rate 15.04% exceeds the 1.00% gate.
- 39 blocking failure(s) still hit rare-but-critical or must-not-miss cases.

## Warnings

_None_

## Blocking High-Risk Failures

- emergency-diabetic-crisis: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-dog-bite-wound: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-electrical-shock: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-glaucoma-eye: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-hard-labor-no-puppy: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-hypoglycemia-toy-breed: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-imma-mediated-thrombocytopenia: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-limping-cry-pain: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-open-fracture: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-postpartum-eclampsia: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth)
- emergency-protozoal-acute-babesia: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:lethargy)
- emergency-pyometra-style: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:vaginal_discharge)
- emergency-repeated-nonproductive-heaving: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-toxin-xylitol: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-trembling-cold-weak: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-unresponsive-after-tremors: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport)
- emergency-urinary-blockage: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:urination_problem)
- emergency-vomit-blood-collapse: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-vomiting-green: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-wound-deep-avulsion: CRITICAL unsafe_downgrade (Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue)

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
