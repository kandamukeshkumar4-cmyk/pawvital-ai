# Wave 3 Emergency Baseline Debug

- Generated at: 2026-04-20T13:56:26.572Z
- Suite ID: wave3-freeze
- Manifest hash: 3082027e2e6752178849a8a92306186d24d242fd7050fe0f9300a82891089c7f
- Total failures: 96

## Burn-Down Snapshot

- Compared against: no prior comparable run
- Total failures: 96 (n/a)
- Residual blockers: 96 (n/a)
- Residual blocker changes: new 0, resolved 0, regressed 0, improved 0, unchanged 0
- Root-cause bucket changes: regressed 0, improved 0, unchanged 0

## Root Cause Delta

_No prior comparable ledger artifact was available._

## Residual Blocker Delta

_No prior comparable blocker artifact was available._

## Top Failure Entries

- emergency-diabetic-crisis: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-dog-bite-wound: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-electrical-shock: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-glaucoma-eye: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-hard-labor-no-puppy: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-hypoglycemia-toy-breed: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-imma-mediated-thrombocytopenia: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-limping-cry-pain: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-open-fracture: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-postpartum-eclampsia: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth)
- emergency-protozoal-acute-babesia: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:lethargy)
- emergency-pyometra-style: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:vaginal_discharge)
- emergency-repeated-nonproductive-heaving: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-toxin-xylitol: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-trembling-cold-weak: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-unresponsive-after-tremors: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-urinary-blockage: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:urination_problem)
- emergency-vomit-blood-collapse: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-vomiting-green: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-wound-deep-avulsion: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue)

## Current Root Cause Summary

| Root cause bucket | Total | Critical | High | Medium |
| --- | ---: | ---: | ---: | ---: |
| question orchestration overriding emergency | 23 | 23 | 0 | 0 |
| complaint normalization miss | 48 | 7 | 11 | 30 |
| deterministic emergency composite not triggered | 25 | 4 | 1 | 20 |

## By Complaint Family

| Bucket | Failures |
| --- | ---: |
| behavior_change | 2 |
| blood_in_stool | 1 |
| constipation | 1 |
| coughing_breathing_combined | 1 |
| dental_problem | 2 |
| diarrhea | 4 |
| difficulty_breathing | 4 |
| drinking_more | 4 |
| ear_scratching | 1 |
| excessive_scratching | 2 |
| eye_discharge | 2 |
| generalized_stiffness | 1 |
| hair_loss | 2 |
| lethargy | 5 |
| limping | 9 |
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
| trauma | 2 |
| trembling | 4 |
| urination_problem | 4 |
| vaginal_discharge | 2 |
| vision_loss | 1 |
| vomiting | 10 |
| weight_loss | 3 |
| wound_skin_issue | 6 |

## By Risk Tier

| Bucket | Failures |
| --- | ---: |
| tier_1_emergency | 39 |
| tier_2_same_day | 12 |
| tier_3_48h_monitor | 45 |

## By Actual Response Type

| Bucket | Failures |
| --- | ---: |
| cannot_assess | 4 |
| emergency | 7 |
| out_of_scope | 2 |
| question | 81 |
| ready | 2 |
