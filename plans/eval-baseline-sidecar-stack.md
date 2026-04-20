# VET-1206 Live Eval Baseline

- Generated at: 2026-04-20T13:55:51.618Z
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
- Expectation pass rate: 57.5%
- Mean expectation score: 75.0%
- Emergency recall: 55.3% (76 cases)
- Unsafe downgrade rate: 15.04%
- Blocking failures: 34
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
| emergency | 76 | 37 | 39 | 56.0% |
| question | 150 | 93 | 57 | 84.6% |

## By Risk Tier

| Bucket | Cases | Passed | Failed | Mean score |
| --- | ---: | ---: | ---: | ---: |
| tier_1_emergency | 76 | 37 | 39 | 56.0% |
| tier_2_same_day | 26 | 14 | 12 | 82.0% |
| tier_3_48h_monitor | 124 | 79 | 45 | 85.2% |

## P0 Blockers for VET-1207

- 34 critical blocker(s) require VET-1207 follow-up before the sidecar stack can be considered clinically safe.
- [CRITICAL] emergency-diabetic-crisis — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-dog-bite-wound — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-electrical-shock — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-glaucoma-eye — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-hard-labor-no-puppy — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-hypoglycemia-toy-breed — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-imma-mediated-thrombocytopenia — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-limping-cry-pain — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-open-fracture — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-postpartum-eclampsia — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth

## Top Failures

- [CRITICAL] emergency-diabetic-crisis — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-dog-bite-wound — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-electrical-shock — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-glaucoma-eye — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-hard-labor-no-puppy — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-hypoglycemia-toy-breed — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-imma-mediated-thrombocytopenia — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-limping-cry-pain — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-open-fracture — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-postpartum-eclampsia — unsafe_downgrade: Failed checks: responseType, readyForReport, knownSymptomsInclude:pregnancy_birth

