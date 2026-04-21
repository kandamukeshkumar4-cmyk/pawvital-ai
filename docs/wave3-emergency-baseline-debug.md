# Wave 3 Emergency Baseline Debug

- Generated at: 2026-04-21T07:47:26.371Z
- Suite ID: wave3-freeze
- Manifest hash: 3c30f83500279f77a44d3f7da50a51854a786a24abfa580686835d939fb98edf
- Total failures: 51

## Burn-Down Snapshot

- Compared against: 2026-04-21T07:31:41.623Z
- Total failures: 51 (+29)
- Residual blockers: 51 (+29)
- Critical release blockers: 0 (0)
- High non-blocking failures: 12 (+10)
- Medium follow-up/readiness failures: 13 (0)
- Residual blocker changes: new 30, resolved 1, regressed 0, improved 0, unchanged 21
- Root-cause bucket changes: regressed 1, improved 1, unchanged 0

## Root Cause Delta

| Root cause bucket | Status | Prev | Curr | Delta | Critical | High | Medium | New cases | Resolved cases |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| complaint normalization miss | regressed | 4 | 35 | +31 | 0 | +11 | +20 | question-behavior-change, question-constipation, question-dental-problem, question-drinking-more, question-ear-scratching, question-eye-discharge, question-generalized-stiffness, question-hair-loss, question-low-literacy-belly-big, question-low-literacy-eye-bad, question-low-literacy-leg-hurt, question-nasal-discharge, question-regurgitation, question-senior-decline, question-slang-the-runs, question-small-blood-in-stool, question-swelling-lump, question-trauma-fall-yard, question-urination-problem, question-vaccine-reaction-mild, question-weight-loss, sameday-behavior-hiding, sameday-chronic-limp-sudden-worse, sameday-dental-bleeding-gum, sameday-drinking-excessive, sameday-hair-loss-spreading, sameday-limping-non-weight-bearing, sameday-regurgitation-frequent, sameday-urinary-blood, sameday-vomiting-multiple-times, sameday-weight-loss-rapid | none |
| deterministic emergency composite not triggered | improved | 18 | 16 | -2 | 0 | -1 | -1 | none | question-senior-arthritis-worsening, sameday-dental-bleeding-gum |

## Residual Blocker Delta

| Case ID | Status | Severity | Freq delta | Previous bucket | Current bucket | Notes |
| --- | --- | --- | ---: | --- | --- | --- |
| question-trauma-fall-yard | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-behavior-hiding | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-chronic-limp-sudden-worse | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-drinking-excessive | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-hair-loss-spreading | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-limping-non-weight-bearing | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-regurgitation-frequent | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-urinary-blood | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-vomiting-multiple-times | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-weight-loss-rapid | new | HIGH | +1 | none | complaint normalization miss | none |
| sameday-dental-bleeding-gum | unchanged | HIGH | 0 | deterministic emergency composite not triggered | complaint normalization miss | rebucketed, summary changed |
| sameday-face-swelling-worsening | unchanged | HIGH | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| question-behavior-change | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-constipation | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-dental-problem | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-drinking-more | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-ear-scratching | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-eye-discharge | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-generalized-stiffness | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-hair-loss | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-low-literacy-belly-big | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-low-literacy-eye-bad | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-low-literacy-leg-hurt | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-nasal-discharge | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-regurgitation | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-senior-decline | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-slang-the-runs | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-small-blood-in-stool | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-swelling-lump | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-urination-problem | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-vaccine-reaction-mild | new | MEDIUM | +1 | none | complaint normalization miss | none |
| question-weight-loss | new | MEDIUM | +1 | none | complaint normalization miss | none |
| followup-diarrhea-frequency-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-diarrhea-onset-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-discharge-color-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-energy-level-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-itch-location-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-limping-progression-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-seasonal-pattern-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-swelling-present-no | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-temperature-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-trauma-history-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-urine-color-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-vomit-color-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| followup-wound-depth-unknown | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| question-coughing-breathing-combined | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-face-swelling-mild | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| question-postoperative-concern | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-slang-throwing-up-bricks | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| question-vague-lump-found | unchanged | MEDIUM | 0 | complaint normalization miss | complaint normalization miss | none |
| toxin-question-ibuprofen-maybe | unchanged | MEDIUM | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| question-senior-arthritis-worsening | resolved | MEDIUM | -1 | deterministic emergency composite not triggered | resolved | none |

## Critical Release Blockers

- Count: 0 (0)
- Previous baseline: 0

_None_

## High Non-Blocking Failures

- Count: 12 (+10)
- Previous baseline: 2

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

- Count: 13 (0)
- Previous baseline: 13

| Case ID | Severity | Root cause bucket | Summary |
| --- | --- | --- | --- |
| followup-diarrhea-frequency-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:diarrhea_frequency, extractedAnswersMatch:diarrhea_frequency |
| followup-diarrhea-onset-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:diarrhea_onset, extractedAnswersMatch:diarrhea_onset |
| followup-discharge-color-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: extractedAnswersMatch:discharge_color |
| followup-energy-level-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:energy_level, extractedAnswersMatch:energy_level |
| followup-itch-location-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:itch_location, extractedAnswersMatch:itch_location |
| followup-limping-progression-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: extractedAnswersMatch:limping_progression |
| followup-seasonal-pattern-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: extractedAnswersMatch:seasonal_pattern |
| followup-swelling-present-no | MEDIUM | deterministic emergency composite not triggered | Failed checks: responseType, readyForReport, extractedAnswersMatch:swelling_present |
| followup-temperature-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:has_fever, extractedAnswersMatch:has_fever |
| followup-trauma-history-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: responseType, readyForReport |
| followup-urine-color-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:urine_color, extractedAnswersMatch:urine_color |
| followup-vomit-color-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:vomit_color, extractedAnswersMatch:vomit_color |
| followup-wound-depth-unknown | MEDIUM | deterministic emergency composite not triggered | Failed checks: answeredQuestionsInclude:wound_depth, extractedAnswersMatch:wound_depth |

## Top Failure Entries

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
- followup-diarrhea-frequency-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:diarrhea_frequency, extractedAnswersMatch:diarrhea_frequency)
- followup-diarrhea-onset-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:diarrhea_onset, extractedAnswersMatch:diarrhea_onset)
- followup-discharge-color-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: extractedAnswersMatch:discharge_color)
- followup-energy-level-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:energy_level, extractedAnswersMatch:energy_level)
- followup-itch-location-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:itch_location, extractedAnswersMatch:itch_location)
- followup-limping-progression-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: extractedAnswersMatch:limping_progression)
- followup-seasonal-pattern-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: extractedAnswersMatch:seasonal_pattern)
- followup-swelling-present-no: MEDIUM ready -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport, extractedAnswersMatch:swelling_present)

## Current Root Cause Summary

| Root cause bucket | Total | Critical | High | Medium |
| --- | ---: | ---: | ---: | ---: |
| complaint normalization miss | 35 | 0 | 11 | 24 |
| deterministic emergency composite not triggered | 16 | 0 | 1 | 15 |

## Root Cause Bucket Counts

| Bucket | Failures |
| --- | ---: |
| complaint normalization miss | 35 |
| deterministic emergency composite not triggered | 16 |

## By Complaint Family

| Bucket | Failures |
| --- | ---: |
| behavior_change | 2 |
| blood_in_stool | 1 |
| constipation | 1 |
| coughing_breathing_combined | 1 |
| dental_problem | 2 |
| diarrhea | 3 |
| drinking_more | 3 |
| ear_scratching | 1 |
| excessive_scratching | 2 |
| eye_discharge | 1 |
| generalized_stiffness | 1 |
| hair_loss | 2 |
| lethargy | 1 |
| limping | 6 |
| medication_reaction | 1 |
| nasal_discharge | 2 |
| post_vaccination_reaction | 1 |
| postoperative_concern | 1 |
| regurgitation | 2 |
| senior_decline | 1 |
| swelling_lump | 2 |
| swollen_abdomen | 1 |
| trauma | 1 |
| urination_problem | 3 |
| vision_loss | 1 |
| vomiting | 3 |
| weight_loss | 2 |
| wound_skin_issue | 3 |

## By Risk Tier

| Bucket | Failures |
| --- | ---: |
| tier_2_same_day | 12 |
| tier_3_48h_monitor | 39 |

## By Actual Response Type

| Bucket | Failures |
| --- | ---: |
| emergency | 2 |
| out_of_scope | 2 |
| question | 45 |
| ready | 2 |
