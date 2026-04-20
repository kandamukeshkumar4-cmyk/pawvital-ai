# VET-1206 Live Eval Baseline

- Generated at: 2026-04-20T20:39:35.107Z
- Suite: wave3-freeze
- Suite version: wave3-freeze-v2
- Manifest hash: 3082027e2e6752178849a8a92306186d24d242fd7050fe0f9300a82891089c7f
- Suite generated at: 2026-04-17T16:44:31.613Z
- Base URL: http://localhost:3008
- Filters: none
- Result: FAIL

## Primary Metrics

- Cases: 226
- Canonical suite cases: 226
- Expectation pass rate: 69.5%
- Mean expectation score: 86.4%
- Emergency recall: 92.1% (76 cases)
- Unsafe downgrade rate: 2.65%
- Blocking failures: 6
- Extra case IDs: none
- Missing case IDs: none

## Sidecar Preflight

- Ready: no
- Configured services: 0/5
- Healthy services: 0/5
- Warming services: 0
- Stub services: 0

- preflight skipped by operator

## By Response Type

| Bucket | Cases | Passed | Failed | Mean score |
| --- | ---: | ---: | ---: | ---: |
| emergency | 76 | 64 | 12 | 89.8% |
| question | 150 | 93 | 57 | 84.6% |

## By Risk Tier

| Bucket | Cases | Passed | Failed | Mean score |
| --- | ---: | ---: | ---: | ---: |
| tier_1_emergency | 76 | 64 | 12 | 89.8% |
| tier_2_same_day | 26 | 14 | 12 | 82.0% |
| tier_3_48h_monitor | 124 | 79 | 45 | 85.2% |

## P0 Blockers for VET-1207

- 6 critical blocker(s) require VET-1207 follow-up before the sidecar stack can be considered clinically safe.
- [CRITICAL] emergency-postpartum-eclampsia — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth
- [CRITICAL] emergency-protozoal-acute-babesia — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:lethargy
- [CRITICAL] emergency-urinary-blockage — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:urination_problem
- [CRITICAL] emergency-vomit-blood-collapse — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting
- [CRITICAL] emergency-vomiting-green — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting
- [CRITICAL] emergency-wound-deep-avulsion — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue

## Top Failures

- [CRITICAL] emergency-postpartum-eclampsia — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth
- [CRITICAL] emergency-protozoal-acute-babesia — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:lethargy
- [CRITICAL] emergency-urinary-blockage — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:urination_problem
- [CRITICAL] emergency-vomit-blood-collapse — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting
- [CRITICAL] emergency-vomiting-green — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:vomiting
- [CRITICAL] emergency-wound-deep-avulsion — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:wound_skin_issue
- [HIGH] question-trauma-fall-yard — expectation_mismatch: Failed checks: knownSymptomsInclude:trauma
- [HIGH] sameday-behavior-hiding — expectation_mismatch: Failed checks: knownSymptomsInclude:behavior_change
- [HIGH] sameday-chronic-limp-sudden-worse — expectation_mismatch: Failed checks: knownSymptomsInclude:limping
- [HIGH] sameday-dental-bleeding-gum — expectation_mismatch: Failed checks: knownSymptomsInclude:dental_problem

