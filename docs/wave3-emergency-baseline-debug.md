# Wave 3 Emergency Baseline Debug

- Generated at: 2026-04-20T14:41:55.060Z
- Suite ID: wave3-freeze
- Manifest hash: 3082027e2e6752178849a8a92306186d24d242fd7050fe0f9300a82891089c7f
- Total failures: 84

## Burn-Down Snapshot

- Compared against: no prior comparable run
- Total failures: 84 (n/a)
- Residual blockers: 84 (n/a)
- Residual blocker changes: new 0, resolved 0, regressed 0, improved 0, unchanged 0
- Root-cause bucket changes: regressed 0, improved 0, unchanged 0

## Root Cause Delta

_No prior comparable ledger artifact was available._

## Residual Blocker Delta

_No prior comparable blocker artifact was available._

## Top Failure Entries

- emergency-limping-cry-pain: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- emergency-postpartum-eclampsia: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth)
- emergency-protozoal-acute-babesia: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:lethargy)
- emergency-pyometra-style: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:vaginal_discharge)
- emergency-urinary-blockage: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:urination_problem)
- emergency-vomit-blood-collapse: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-vomiting-green: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-wound-deep-avulsion: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue)
- followup-breathing-onset-unknown-escalates: CRITICAL cannot_assess -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- followup-breathing-pattern-unknown: CRITICAL cannot_assess -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- followup-consciousness-unknown-escalates: CRITICAL cannot_assess -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- followup-gum-color-unknown-escalates: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- followup-seizure-duration-unknown: CRITICAL cannot_assess -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- oncology-emergency-nosebleed-collapse: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- oncology-emergency-obstructive-neck-mass: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- repro-emergency-foul-discharge-fever: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- repro-emergency-male-paraphimosis: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- repro-emergency-retained-puppy-collapse: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- toxin-emergency-antifreeze: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)
- toxin-emergency-lily-chew: CRITICAL question -> question orchestration overriding emergency (Failed checks: responseType, readyForReport)

## Current Root Cause Summary

| Root cause bucket | Total | Critical | High | Medium |
| --- | ---: | ---: | ---: | ---: |
| question orchestration overriding emergency | 11 | 11 | 0 | 0 |
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
| eye_discharge | 1 |
| generalized_stiffness | 1 |
| hair_loss | 2 |
| lethargy | 3 |
| limping | 8 |
| medication_reaction | 6 |
| nasal_discharge | 3 |
| post_vaccination_reaction | 2 |
| postoperative_concern | 1 |
| pregnancy_birth | 3 |
| regurgitation | 2 |
| seizure_collapse | 3 |
| senior_decline | 1 |
| swelling_lump | 4 |
| swollen_abdomen | 1 |
| testicular_prostate | 1 |
| trauma | 1 |
| trembling | 1 |
| urination_problem | 4 |
| vaginal_discharge | 2 |
| vision_loss | 1 |
| vomiting | 8 |
| weight_loss | 3 |
| wound_skin_issue | 5 |

## By Risk Tier

| Bucket | Failures |
| --- | ---: |
| tier_1_emergency | 27 |
| tier_2_same_day | 12 |
| tier_3_48h_monitor | 45 |

## By Actual Response Type

| Bucket | Failures |
| --- | ---: |
| cannot_assess | 4 |
| emergency | 7 |
| out_of_scope | 2 |
| question | 69 |
| ready | 2 |
