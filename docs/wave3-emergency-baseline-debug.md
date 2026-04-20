# Wave 3 Emergency Baseline Debug

- Generated at: 2026-04-20T20:39:48.904Z
- Suite ID: wave3-freeze
- Manifest hash: 3082027e2e6752178849a8a92306186d24d242fd7050fe0f9300a82891089c7f
- Total failures: 69

## Burn-Down Snapshot

- Compared against: 2026-04-20T20:31:29.193Z
- Total failures: 69 (-15)
- Residual blockers: 69 (-15)
- Critical release blockers: 6 (-16)
- High non-blocking failures: 12 (0)
- Medium follow-up/readiness failures: 18 (0)
- Residual blocker changes: new 0, resolved 15, regressed 0, improved 1, unchanged 68
- Root-cause bucket changes: regressed 0, improved 3, unchanged 0

## Root Cause Delta

| Root cause bucket | Status | Prev | Curr | Delta | Critical | High | Medium | New cases | Resolved cases |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| question orchestration overriding emergency | improved | 11 | 0 | -11 | -11 | 0 | 0 | none | emergency-limping-cry-pain, followup-gum-color-unknown-escalates, oncology-emergency-nosebleed-collapse, oncology-emergency-obstructive-neck-mass, repro-emergency-foul-discharge-fever, repro-emergency-male-paraphimosis, repro-emergency-retained-puppy-collapse, toxin-emergency-antifreeze, toxin-emergency-lily-chew, toxin-emergency-sago-palm, toxin-emergency-tremorgenic-mycotoxin |
| complaint normalization miss | improved | 48 | 48 | 0 | -1 | 0 | +1 | none | none |
| deterministic emergency composite not triggered | improved | 25 | 21 | -4 | -4 | 0 | 0 | none | followup-breathing-onset-unknown-escalates, followup-breathing-pattern-unknown, followup-consciousness-unknown-escalates, followup-seizure-duration-unknown |

## Residual Blocker Delta

| Case ID | Status | Severity | Freq delta | Previous bucket | Current bucket | Notes |
| --- | --- | --- | ---: | --- | --- | --- |
| emergency-postpartum-eclampsia | unchanged | CRITICAL | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-protozoal-acute-babesia | unchanged | CRITICAL | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-urinary-blockage | unchanged | CRITICAL | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-vomit-blood-collapse | unchanged | CRITICAL | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-vomiting-green | unchanged | CRITICAL | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-wound-deep-avulsion | unchanged | CRITICAL | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-limping-cry-pain | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| followup-breathing-onset-unknown-escalates | resolved | CRITICAL | -1 | deterministic emergency composite not triggered | resolved | none |
| followup-breathing-pattern-unknown | resolved | CRITICAL | -1 | deterministic emergency composite not triggered | resolved | none |
| followup-consciousness-unknown-escalates | resolved | CRITICAL | -1 | deterministic emergency composite not triggered | resolved | none |
| followup-gum-color-unknown-escalates | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| followup-seizure-duration-unknown | resolved | CRITICAL | -1 | deterministic emergency composite not triggered | resolved | none |
| oncology-emergency-nosebleed-collapse | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| oncology-emergency-obstructive-neck-mass | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| repro-emergency-foul-discharge-fever | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| repro-emergency-male-paraphimosis | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| repro-emergency-retained-puppy-collapse | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| toxin-emergency-antifreeze | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| toxin-emergency-lily-chew | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| toxin-emergency-sago-palm | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| toxin-emergency-tremorgenic-mycotoxin | resolved | CRITICAL | -1 | question orchestration overriding emergency | resolved | none |
| question-trauma-fall-yard | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-behavior-hiding | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-chronic-limp-sudden-worse | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-dental-bleeding-gum | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-drinking-excessive | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-face-swelling-worsening | unchanged | HIGH | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| sameday-hair-loss-spreading | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-limping-non-weight-bearing | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-regurgitation-frequent | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-urinary-blood | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-vomiting-multiple-times | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| sameday-weight-loss-rapid | unchanged | HIGH | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-burn-chemical | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-pale-gums-collapse | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-post-vaccine-face-swelling | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-postpartum-heavy-bleeding | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| emergency-rat-poison-bleeding | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| followup-appetite-change-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-diarrhea-frequency-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-diarrhea-onset-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-discharge-color-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-energy-level-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-itch-location-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-limping-progression-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-lump-size-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-seasonal-pattern-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-stool-consistency-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-swelling-present-no | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-temperature-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-trauma-history-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-urine-color-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-vomit-color-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-water-intake-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-weight-bearing-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-wound-depth-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| question-behavior-change | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-constipation | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-contradictory-vomiting | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-coughing-breathing-combined | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-dental-problem | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-drinking-more | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-ear-scratching | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-eye-discharge | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-face-swelling-mild | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| question-generalized-stiffness | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-hair-loss | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-low-literacy-belly-big | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-low-literacy-eye-bad | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-low-literacy-leg-hurt | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-nasal-discharge | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-postoperative-concern | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-regurgitation | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-senior-decline | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-slang-the-runs | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-slang-throwing-up-bricks | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-small-blood-in-stool | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-swelling-lump | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-urination-problem | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-vaccine-reaction-mild | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-vague-lump-found | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-weight-loss | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| toxin-question-ibuprofen-maybe | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| emergency-pyometra-style | improved | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | summary changed |

## Critical Release Blockers

- Count: 6 (-16)
- Previous baseline: 22

| Case ID | Severity | Root cause bucket | Summary |
| --- | --- | --- | --- |
| emergency-postpartum-eclampsia | CRITICAL | complaint normalization miss | Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth |
| emergency-protozoal-acute-babesia | CRITICAL | complaint normalization miss | Failed checks: responseType, readyForReport, knownSymptomsInclude:lethargy |
| emergency-urinary-blockage | CRITICAL | complaint normalization miss | Failed checks: responseType, readyForReport, knownSymptomsInclude:urination_problem |
| emergency-vomit-blood-collapse | CRITICAL | complaint normalization miss | Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting |
| emergency-vomiting-green | CRITICAL | complaint normalization miss | Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting |
| emergency-wound-deep-avulsion | CRITICAL | complaint normalization miss | Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue |

## High Non-Blocking Failures

- Count: 12 (0)
- Previous baseline: 12

| Case ID | Severity | Root cause bucket | Summary |
| --- | --- | --- | --- |
| question-trauma-fall-yard | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:trauma |
| sameday-behavior-hiding | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:behavior_change |
| sameday-chronic-limp-sudden-worse | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:limping |
| sameday-dental-bleeding-gum | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:dental_problem |
| sameday-drinking-excessive | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:drinking_more |
| sameday-face-swelling-worsening | HIGH | deterministic emergency composite not triggered | Failed checks: responseType, readyForReport |
| sameday-hair-loss-spreading | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:hair_loss |
| sameday-limping-non-weight-bearing | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:limping |
| sameday-regurgitation-frequent | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:regurgitation |
| sameday-urinary-blood | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:urination_problem |
| sameday-vomiting-multiple-times | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:vomiting |
| sameday-weight-loss-rapid | HIGH | complaint normalization miss | Failed checks: knownSymptomsInclude:weight_loss |

## Medium Follow-Up and Readiness Failures

- Count: 18 (0)
- Previous baseline: 18

| Case ID | Severity | Root cause bucket | Summary |
| --- | --- | --- | --- |
| followup-appetite-change-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:appetite_change, extractedAnswersMatch:appetite_change |
| followup-diarrhea-frequency-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:diarrhea_frequency, extractedAnswersMatch:diarrhea_frequency |
| followup-diarrhea-onset-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:diarrhea_onset, extractedAnswersMatch:diarrhea_onset |
| followup-discharge-color-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: extractedAnswersMatch:discharge_color |
| followup-energy-level-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:energy_level, extractedAnswersMatch:energy_level |
| followup-itch-location-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:itch_location, extractedAnswersMatch:itch_location |
| followup-limping-progression-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: extractedAnswersMatch:limping_progression |
| followup-lump-size-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: extractedAnswersMatch:lump_size |
| followup-seasonal-pattern-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: extractedAnswersMatch:seasonal_pattern |
| followup-stool-consistency-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:stool_consistency, extractedAnswersMatch:stool_consistency |
| followup-swelling-present-no | MEDIUM | deterministic emergency composite not triggered | Failed checks: responseType, readyForReport, extractedAnswersMatch:swelling_present |
| followup-temperature-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:has_fever, extractedAnswersMatch:has_fever |
| followup-trauma-history-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: responseType, readyForReport |
| followup-urine-color-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:urine_color, extractedAnswersMatch:urine_color |
| followup-vomit-color-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:vomit_color, extractedAnswersMatch:vomit_color |
| followup-water-intake-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:water_intake, extractedAnswersMatch:water_intake |
| followup-weight-bearing-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:weight_bearing, extractedAnswersMatch:weight_bearing |
| followup-wound-depth-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:wound_depth, extractedAnswersMatch:wound_depth |

## Top Failure Entries

- emergency-postpartum-eclampsia: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth)
- emergency-protozoal-acute-babesia: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:lethargy)
- emergency-urinary-blockage: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:urination_problem)
- emergency-vomit-blood-collapse: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-vomiting-green: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting)
- emergency-wound-deep-avulsion: CRITICAL question -> complaint normalization miss (Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue)
- question-trauma-fall-yard: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:trauma)
- sameday-behavior-hiding: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:behavior_change)
- sameday-chronic-limp-sudden-worse: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:limping)
- sameday-dental-bleeding-gum: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:dental_problem)
- sameday-drinking-excessive: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:drinking_more)
- sameday-face-swelling-worsening: HIGH emergency -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- sameday-hair-loss-spreading: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:hair_loss)
- sameday-limping-non-weight-bearing: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:limping)
- sameday-regurgitation-frequent: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:regurgitation)
- sameday-urinary-blood: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:urination_problem)
- sameday-vomiting-multiple-times: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:vomiting)
- sameday-weight-loss-rapid: HIGH question -> complaint normalization miss (Failed checks: knownSymptomsInclude:weight_loss)
- emergency-burn-chemical: MEDIUM emergency -> complaint normalization miss (Failed checks: knownSymptomsInclude:wound_skin_issue)
- emergency-pale-gums-collapse: MEDIUM emergency -> complaint normalization miss (Failed checks: knownSymptomsInclude:lethargy)

## Current Root Cause Summary

| Root cause bucket | Total | Critical | High | Medium |
| --- | ---: | ---: | ---: | ---: |
| complaint normalization miss | 48 | 6 | 11 | 31 |
| deterministic emergency composite not triggered | 21 | 0 | 1 | 20 |

## Root Cause Bucket Counts

| Bucket | Failures |
| --- | ---: |
| complaint normalization miss | 48 |
| deterministic emergency composite not triggered | 21 |

## By Complaint Family

| Bucket | Failures |
| --- | ---: |
| behavior_change | 2 |
| blood_in_stool | 1 |
| constipation | 1 |
| coughing_breathing_combined | 1 |
| dental_problem | 2 |
| diarrhea | 4 |
| drinking_more | 4 |
| ear_scratching | 1 |
| excessive_scratching | 2 |
| eye_discharge | 1 |
| generalized_stiffness | 1 |
| hair_loss | 2 |
| lethargy | 3 |
| limping | 7 |
| medication_reaction | 2 |
| nasal_discharge | 2 |
| post_vaccination_reaction | 2 |
| postoperative_concern | 1 |
| pregnancy_birth | 2 |
| regurgitation | 2 |
| senior_decline | 1 |
| swelling_lump | 3 |
| swollen_abdomen | 1 |
| trauma | 1 |
| trembling | 1 |
| urination_problem | 4 |
| vaginal_discharge | 1 |
| vision_loss | 1 |
| vomiting | 6 |
| weight_loss | 3 |
| wound_skin_issue | 5 |

## By Risk Tier

| Bucket | Failures |
| --- | ---: |
| tier_1_emergency | 12 |
| tier_2_same_day | 12 |
| tier_3_48h_monitor | 45 |

## By Actual Response Type

| Bucket | Failures |
| --- | ---: |
| emergency | 8 |
| out_of_scope | 2 |
| question | 57 |
| ready | 2 |
