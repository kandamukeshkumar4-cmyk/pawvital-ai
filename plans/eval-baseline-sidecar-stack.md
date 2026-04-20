# VET-1206 Live Eval Baseline

- Generated at: 2026-04-17T19:50:48.363Z
- Suite: wave3-freeze
- Suite version: wave3-freeze-v2
- Manifest hash: 3082027e2e6752178849a8a92306186d24d242fd7050fe0f9300a82891089c7f
- Suite generated at: 2026-04-17T16:44:31.613Z
- Base URL: http://localhost:3001
- Filters: none
- Result: FAIL

## Primary Metrics

- Cases: 226
- Canonical suite cases: 226
- Expectation pass rate: 53.5%
- Mean expectation score: 71.0%
- Emergency recall: 40.8% (76 cases)
- Unsafe downgrade rate: 19.91%
- Blocking failures: 45
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
| emergency | 76 | 28 | 48 | 44.2% |
| question | 150 | 93 | 57 | 84.6% |

## By Risk Tier

| Bucket | Cases | Passed | Failed | Mean score |
| --- | ---: | ---: | ---: | ---: |
| tier_1_emergency | 76 | 28 | 48 | 44.2% |
| tier_2_same_day | 26 | 14 | 12 | 82.0% |
| tier_3_48h_monitor | 124 | 79 | 45 | 85.2% |

## P0 Blockers for VET-1207

- 45 critical blocker(s) require VET-1207 follow-up before the sidecar stack can be considered clinically safe.
- [CRITICAL] emergency-breathing-labored — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing
- [CRITICAL] emergency-burn-chemical — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-choking-foreign-body — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing
- [CRITICAL] emergency-diabetic-crisis — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-difficulty-breathing-kennel — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-dog-bite-wound — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-electrical-shock — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-glaucoma-eye — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-hard-labor-no-puppy — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-heatstroke — unsafe_downgrade: Failed checks: responseType, readyForReport

## Top Failures

- [CRITICAL] emergency-breathing-labored — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing
- [CRITICAL] emergency-burn-chemical — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-choking-foreign-body — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing
- [CRITICAL] emergency-diabetic-crisis — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-difficulty-breathing-kennel — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-dog-bite-wound — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-electrical-shock — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-glaucoma-eye — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-hard-labor-no-puppy — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-heatstroke — unsafe_downgrade: Failed checks: responseType, readyForReport

