# Wave 3 Emergency Baseline Debug

- Generated at: 2026-04-21T07:31:41.623Z
- Suite ID: wave3-freeze
- Manifest hash: 3c30f83500279f77a44d3f7da50a51854a786a24abfa580686835d939fb98edf
- Total failures: 22

## Burn-Down Snapshot

- Compared against: 2026-04-20T22:12:19.478Z
- Total failures: 22 (-29)
- Residual blockers: 22 (-29)
- Critical release blockers: 0 (0)
- High non-blocking failures: 2 (-10)
- Medium follow-up/readiness failures: 13 (0)
- Residual blocker changes: new 1, resolved 30, regressed 0, improved 0, unchanged 21
- Root-cause bucket changes: regressed 1, improved 1, unchanged 0

## Root Cause Delta

| Root cause bucket | Status | Prev | Curr | Delta | Critical | High | Medium | New cases | Resolved cases |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| deterministic emergency composite not triggered | regressed | 16 | 18 | +2 | 0 | +1 | +1 | question-senior-arthritis-worsening, sameday-dental-bleeding-gum | none |
| complaint normalization miss | improved | 35 | 4 | -31 | 0 | -11 | -20 | none | question-behavior-change, question-constipation, question-dental-problem, question-drinking-more, question-ear-scratching, question-eye-discharge, question-generalized-stiffness, question-hair-loss, question-low-literacy-belly-big, question-low-literacy-eye-bad, question-low-literacy-leg-hurt, question-nasal-discharge, question-regurgitation, question-senior-decline, question-slang-the-runs, question-small-blood-in-stool, question-swelling-lump, question-trauma-fall-yard, question-urination-problem, question-vaccine-reaction-mild, question-weight-loss, sameday-behavior-hiding, sameday-chronic-limp-sudden-worse, sameday-dental-bleeding-gum, sameday-drinking-excessive, sameday-hair-loss-spreading, sameday-limping-non-weight-bearing, sameday-regurgitation-frequent, sameday-urinary-blood, sameday-vomiting-multiple-times, sameday-weight-loss-rapid |

## Residual Blocker Delta

| Case ID | Status | Severity | Freq delta | Previous bucket | Current bucket | Notes |
| --- | --- | --- | ---: | --- | --- | --- |
| sameday-dental-bleeding-gum | unchanged | HIGH | 0 | complaint normalization miss | deterministic emergency composite not triggered | rebucketed, summary changed |
| sameday-face-swelling-worsening | unchanged | HIGH | 0 | deterministic emergency composite not triggered | deterministic emergency composite not triggered | none |
| question-trauma-fall-yard | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-behavior-hiding | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-chronic-limp-sudden-worse | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-drinking-excessive | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-hair-loss-spreading | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-limping-non-weight-bearing | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-regurgitation-frequent | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-urinary-blood | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-vomiting-multiple-times | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| sameday-weight-loss-rapid | resolved | HIGH | -1 | complaint normalization miss | resolved | none |
| question-senior-arthritis-worsening | new | MEDIUM | +1 | none | deterministic emergency composite not triggered | none |
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
| question-behavior-change | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-constipation | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-dental-problem | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-drinking-more | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-ear-scratching | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-eye-discharge | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-generalized-stiffness | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-hair-loss | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-low-literacy-belly-big | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-low-literacy-eye-bad | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-low-literacy-leg-hurt | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-nasal-discharge | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-regurgitation | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-senior-decline | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-slang-the-runs | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-small-blood-in-stool | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-swelling-lump | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-urination-problem | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-vaccine-reaction-mild | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |
| question-weight-loss | resolved | MEDIUM | -1 | complaint normalization miss | resolved | none |

## Critical Release Blockers

- Count: 0 (0)
- Previous baseline: 0

_None_

## High Non-Blocking Failures

- Count: 2 (-10)
- Previous baseline: 12

| Case ID | Severity | Root cause bucket | Summary |
| --- | --- | --- | --- |
| sameday-dental-bleeding-gum | HIGH | deterministic emergency composite not triggered | Failed checks: responseType, readyForReport |
| sameday-face-swelling-worsening | HIGH | deterministic emergency composite not triggered | Failed checks: responseType, readyForReport |

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

- sameday-dental-bleeding-gum: HIGH emergency -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- sameday-face-swelling-worsening: HIGH emergency -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- followup-diarrhea-frequency-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:diarrhea_frequency, extractedAnswersMatch:diarrhea_frequency)
- followup-diarrhea-onset-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:diarrhea_onset, extractedAnswersMatch:diarrhea_onset)
- followup-discharge-color-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: extractedAnswersMatch:discharge_color)
- followup-energy-level-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:energy_level, extractedAnswersMatch:energy_level)
- followup-itch-location-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:itch_location, extractedAnswersMatch:itch_location)
- followup-limping-progression-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: extractedAnswersMatch:limping_progression)
- followup-seasonal-pattern-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: extractedAnswersMatch:seasonal_pattern)
- followup-swelling-present-no: MEDIUM ready -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport, extractedAnswersMatch:swelling_present)
- followup-temperature-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:has_fever, extractedAnswersMatch:has_fever)
- followup-trauma-history-unknown: MEDIUM ready -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- followup-urine-color-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:urine_color, extractedAnswersMatch:urine_color)
- followup-vomit-color-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:vomit_color, extractedAnswersMatch:vomit_color)
- followup-wound-depth-unknown: MEDIUM question -> deterministic emergency composite not triggered (Failed checks: answeredQuestionsInclude:wound_depth, extractedAnswersMatch:wound_depth)
- question-coughing-breathing-combined: MEDIUM question -> complaint normalization miss (Failed checks: knownSymptomsInclude:coughing_breathing_combined)
- question-face-swelling-mild: MEDIUM emergency -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- question-postoperative-concern: MEDIUM out_of_scope -> complaint normalization miss (Failed checks: responseType, knownSymptomsInclude:postoperative_concern)
- question-senior-arthritis-worsening: MEDIUM emergency -> deterministic emergency composite not triggered (Failed checks: responseType, readyForReport)
- question-slang-throwing-up-bricks: MEDIUM question -> complaint normalization miss (Failed checks: knownSymptomsInclude:vomiting)

## Current Root Cause Summary

| Root cause bucket | Total | Critical | High | Medium |
| --- | ---: | ---: | ---: | ---: |
| deterministic emergency composite not triggered | 18 | 0 | 2 | 16 |
| complaint normalization miss | 4 | 0 | 0 | 4 |

## Root Cause Bucket Counts

| Bucket | Failures |
| --- | ---: |
| complaint normalization miss | 4 |
| deterministic emergency composite not triggered | 18 |

## By Complaint Family

| Bucket | Failures |
| --- | ---: |
| coughing_breathing_combined | 1 |
| dental_problem | 1 |
| diarrhea | 2 |
| drinking_more | 1 |
| excessive_scratching | 2 |
| generalized_stiffness | 1 |
| lethargy | 1 |
| limping | 3 |
| medication_reaction | 1 |
| nasal_discharge | 1 |
| postoperative_concern | 1 |
| swelling_lump | 1 |
| urination_problem | 1 |
| vomiting | 2 |
| wound_skin_issue | 3 |

## By Risk Tier

| Bucket | Failures |
| --- | ---: |
| tier_2_same_day | 2 |
| tier_3_48h_monitor | 20 |

## By Actual Response Type

| Bucket | Failures |
| --- | ---: |
| emergency | 4 |
| out_of_scope | 2 |
| question | 14 |
| ready | 2 |
