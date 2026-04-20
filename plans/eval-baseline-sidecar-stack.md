# VET-1206 Live Eval Baseline

- Generated at: 2026-04-20T22:12:11.025Z
- Suite: wave3-freeze
- Suite version: wave3-freeze-v2
- Manifest hash: 3c30f83500279f77a44d3f7da50a51854a786a24abfa580686835d939fb98edf
- Suite generated at: 2026-04-20T22:08:43.695Z
- Base URL: http://127.0.0.1:3011
- Filters: none
- Result: PASS

## Primary Metrics

- Cases: 226
- Canonical suite cases: 226
- Expectation pass rate: 77.4%
- Mean expectation score: 90.9%
- Emergency recall: 100.0% (76 cases)
- Unsafe downgrade rate: 0.00%
- Blocking failures: 0
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
| emergency | 76 | 76 | 0 | 100.0% |
| question | 150 | 99 | 51 | 86.3% |

## By Risk Tier

| Bucket | Cases | Passed | Failed | Mean score |
| --- | ---: | ---: | ---: | ---: |
| tier_1_emergency | 76 | 76 | 0 | 100.0% |
| tier_2_same_day | 26 | 14 | 12 | 82.0% |
| tier_3_48h_monitor | 124 | 85 | 39 | 87.2% |

## P0 Blockers for VET-1207

- none

## Top Failures

- [HIGH] question-trauma-fall-yard — expectation_mismatch: Failed checks: knownSymptomsInclude:trauma
- [HIGH] sameday-behavior-hiding — expectation_mismatch: Failed checks: knownSymptomsInclude:behavior_change
- [HIGH] sameday-chronic-limp-sudden-worse — expectation_mismatch: Failed checks: knownSymptomsInclude:limping
- [HIGH] sameday-dental-bleeding-gum — expectation_mismatch: Failed checks: knownSymptomsInclude:dental_problem
- [HIGH] sameday-drinking-excessive — expectation_mismatch: Failed checks: knownSymptomsInclude:drinking_more
- [HIGH] sameday-face-swelling-worsening — expectation_mismatch: Failed checks: responseType, readyForReport
- [HIGH] sameday-hair-loss-spreading — expectation_mismatch: Failed checks: knownSymptomsInclude:hair_loss
- [HIGH] sameday-limping-non-weight-bearing — expectation_mismatch: Failed checks: knownSymptomsInclude:limping
- [HIGH] sameday-regurgitation-frequent — expectation_mismatch: Failed checks: knownSymptomsInclude:regurgitation
- [HIGH] sameday-urinary-blood — expectation_mismatch: Failed checks: knownSymptomsInclude:urination_problem

