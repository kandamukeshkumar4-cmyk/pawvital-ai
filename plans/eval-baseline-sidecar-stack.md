# VET-1206 Live Eval Baseline

- Generated at: 2026-04-17T17:09:26.998Z
- Suite: wave3-freeze-merged
- Base URL: https://pawvital-ai.vercel.app
- Filters: none
- Result: FAIL

## Primary Metrics

- Cases: 307
- Expectation pass rate: 22.1%
- Mean expectation score: 38.8%
- Emergency recall: 0.0% (157 cases)
- Unsafe downgrade rate: 51.14%
- Blocking failures: 157

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
| emergency | 157 | 0 | 157 | 0.0% |
| question | 150 | 68 | 82 | 79.4% |

## By Risk Tier

| Bucket | Cases | Passed | Failed | Mean score |
| --- | ---: | ---: | ---: | ---: |
| tier_1_emergency | 157 | 0 | 157 | 0.0% |
| tier_2_same_day | 26 | 8 | 18 | 76.9% |
| tier_3_48h_monitor | 124 | 60 | 64 | 80.0% |

## P0 Blockers for VET-1207

- 157 critical blocker(s) require VET-1207 follow-up before the sidecar stack can be considered clinically safe.
- [CRITICAL] cardiac-emergency-collapse-after-excitement — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-collapse-after-excitement — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-collapse-blue-gums — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-collapse-blue-gums — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-rapid-breathing-pale — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-rapid-breathing-pale — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-resting-breathing-distress — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-resting-breathing-distress — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-acute-paralysis — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-acute-paralysis — unsafe_downgrade: Failed checks: responseType, readyForReport

## Top Failures

- [CRITICAL] cardiac-emergency-collapse-after-excitement — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-collapse-after-excitement — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-collapse-blue-gums — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-collapse-blue-gums — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-rapid-breathing-pale — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-rapid-breathing-pale — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-resting-breathing-distress — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] cardiac-emergency-resting-breathing-distress — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-acute-paralysis — unsafe_downgrade: Failed checks: responseType, readyForReport
- [CRITICAL] emergency-acute-paralysis — unsafe_downgrade: Failed checks: responseType, readyForReport

