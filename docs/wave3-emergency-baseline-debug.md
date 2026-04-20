# Wave 3 Emergency Baseline Debug

- Generated at: 2026-04-17T19:51:05.629Z
- Suite ID: wave3-freeze
- Manifest hash: 3082027e2e6752178849a8a92306186d24d242fd7050fe0f9300a82891089c7f
- Total failures: 105

## Top Failure Entries

- emergency-breathing-labored: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing)
- emergency-burn-chemical: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-choking-foreign-body: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing)
- emergency-diabetic-crisis: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-difficulty-breathing-kennel: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-dog-bite-wound: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-electrical-shock: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-glaucoma-eye: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-hard-labor-no-puppy: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-heatstroke: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-hemorrhagic-diarrhea-shock: CRITICAL question -> missing red flag linkage (Failed checks: responseType, readyForReport)
- emergency-hit-by-car: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-hypoglycemia-toy-breed: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-imma-mediated-thrombocytopenia: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-limping-cry-pain: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-open-fracture: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-oral-bleeding-cant-swallow: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:dental_problem)
- emergency-parvo-style-puppy: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-postpartum-eclampsia: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth)
- emergency-protozoal-acute-babesia: CRITICAL question -> missing red flag linkage (Failed checks: responseType, readyForReport)

## By Root Cause Bucket

| Bucket | Failures |
| --- | ---: |
| complaint normalization miss | 49 |
| deterministic emergency composite not triggered | 25 |
| missing red flag linkage | 2 |
| question orchestration overriding emergency | 29 |

## By Complaint Family

| Bucket | Failures |
| --- | ---: |
| behavior_change | 2 |
| blood_in_stool | 1 |
| constipation | 1 |
| coughing_breathing_combined | 1 |
| dental_problem | 3 |
| diarrhea | 5 |
| difficulty_breathing | 8 |
| drinking_more | 4 |
| ear_scratching | 1 |
| excessive_scratching | 2 |
| eye_discharge | 2 |
| generalized_stiffness | 1 |
| hair_loss | 2 |
| heat_intolerance | 1 |
| lethargy | 5 |
| limping | 10 |
| medication_reaction | 7 |
| nasal_discharge | 3 |
| post_vaccination_reaction | 2 |
| postoperative_concern | 1 |
| pregnancy_birth | 5 |
| regurgitation | 2 |
| seizure_collapse | 3 |
| senior_decline | 1 |
| swelling_lump | 4 |
| swollen_abdomen | 1 |
| testicular_prostate | 1 |
| trauma | 3 |
| trembling | 4 |
| urination_problem | 4 |
| vaginal_discharge | 2 |
| vision_loss | 1 |
| vomiting | 10 |
| vomiting_diarrhea_combined | 1 |
| weight_loss | 3 |
| wound_skin_issue | 6 |

## By Risk Tier

| Bucket | Failures |
| --- | ---: |
| tier_1_emergency | 48 |
| tier_2_same_day | 12 |
| tier_3_48h_monitor | 45 |

## By Actual Response Type

| Bucket | Failures |
| --- | ---: |
| cannot_assess | 4 |
| emergency | 5 |
| out_of_scope | 2 |
| question | 92 |
| ready | 2 |
