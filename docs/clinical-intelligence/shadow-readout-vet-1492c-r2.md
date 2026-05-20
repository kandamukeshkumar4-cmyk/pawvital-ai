# VET-1492C-R2 - Formal Shadow Readout After Persistence Recovery

## Executive Summary

**Decision: HOLD - do not promote model flags.**

The persistence blocker that prevented production `symptom_checks` rows is fixed. A real credentialed tester session saved a terminal emergency report, History displayed the saved row, the direct production readout endpoint returned HTTP `200`, and the scheduler moved issue `#495` from `healthy_empty_readout` to `ready_for_formal_readout`.

This is still a minimal-data readout, not a statistically sufficient 48-72h production readout:

- `reportCount`: `1`
- `parsedReportCount`: `1`
- `malformedReportCount`: `0`
- `observationCount`: `0`
- `shadowComparisonCount`: `0`
- `warning`: `null`

The single persisted report proves the production report/history path is working. It does not prove second-opinion or Grok shadow success because no shadow observations or shadow comparisons exist.

A specific follow-up blocker was found during this readout: the saved `symptom_checks.ai_response` row is owner-safe and parsed by the readout endpoint, but the latest row no longer contains the expected `system_observability.shadowReadout` aggregate after the tester-feedback ledger update. The direct endpoint can count the report, but it cannot derive session or shadow-observation readiness from that row.

## Production Deployment State

| Field | Value |
| --- | --- |
| Production alias | `https://pawvital-ai.vercel.app` |
| Vercel deployment | `dpl_3C6ysNpujs8fLPPGT9M5Y8ZTW9J2` |
| Deployment URL | `https://pawvital-mgniqb4lq-kandasubbarao4-5462s-projects.vercel.app` |
| Target | `production` |
| Status | `Ready` |
| Created | `2026-05-20T19:19:19Z` |
| Current `origin/master` / scheduler checkout SHA | `1e643d2d076652666d5d973f640bf31aaa45fc7e` |
| Source PRs | VET-1517C `#502`, follow-up `#503` |

`vercel inspect` confirmed the production deployment and aliases. The Vercel CLI output did not expose git metadata for the deployment, so the production source SHA is tied to the current `origin/master` and the scheduler run checkout SHA, both at merge commit `1e643d2d076652666d5d973f640bf31aaa45fc7e`.

## Data Window

| Source | Result |
| --- | --- |
| Issue `#495` latest scheduler comment | `ready_for_formal_readout` |
| Scheduler run | `26185354742` |
| Scheduler generated_at | `2026-05-20T19:34:50.705Z` |
| Direct production endpoint generated_at | `2026-05-20T19:41:14.743Z` |
| Readout endpoint | `https://pawvital-ai.vercel.app/api/ai/shadow-rollout` |
| Window hours | `24` |
| Completed production report rows | `1` |

The production data window contains one saved tester report. Treat this as a persistence-recovery proof and a minimal readout, not a statistically sufficient traffic window.

## Scheduler Output

Latest issue `#495` scheduler output:

| Field | Value |
| --- | --- |
| status | `ready_for_formal_readout` |
| decision | `RUN FORMAL VET-1492C RERUN` |
| ok | `true` |
| overall_status | `insufficient_data` |
| report_count | `1` |
| parsed_report_count | `1` |
| malformed_report_count | `0` |
| observation_count | `0` |
| shadow_comparison_count | `0` |
| warning | `null` |

Direct production endpoint output matched the same decision shape and returned zero service observations/comparisons for every configured service.

Additional direct endpoint fields:

| Field | Value |
| --- | --- |
| `reportPresenceCount` | `1` |
| `sessionPresenceCount` | `0` |
| `timeoutCount` | `0` |
| `fallbackCount` | `0` |
| `providerErrorCount` | `0` |
| `budgetExceededCount` | `0` |

## Persisted Row Shape

Latest direct DB check of `public.symptom_checks`:

| Field | Value |
| --- | --- |
| Row suffix | `3356538a` |
| Created | `2026-05-20T19:33:44.296Z` |
| Severity | `emergency` |
| Recommendation | `emergency_vet` |
| Symptoms | `difficulty_breathing, seizure_collapse` |
| Report title | `Emergency Signs Need Veterinary Care` |
| Report mode | `terminal_cannot_assess` |
| `system_observability` present | `false` |
| `system_observability.shadowReadout` present | `false` |
| Embedded session present in saved report | `false` |

The row is sanitized for owner-visible use. The only internal-looking key match was `tester_feedback_case.questions_asked[*].prompt`, which is the stored tester-feedback question label, not a provider prompt or model payload.

However, the row does not contain the persisted shadow readout aggregate expected for promotion evidence. This explains why `reportPresenceCount` is `1` while `sessionPresenceCount`, `observationCount`, and `shadowComparisonCount` remain `0`.

The observed code path is consistent with the tester-feedback ledger save rewriting `symptom_checks.ai_response` from the owner report payload after the initial report save. That follow-up write preserves owner report content and feedback metadata, but does not preserve the readout aggregate in the row checked here.

## Owner-Visible Safety

Credentialed History verification used the existing saved tester row only. It did not generate a new symptom-check report.

| Check | Result |
| --- | --- |
| History row visible | yes |
| Saved full report opened | yes |
| Internal telemetry markers visible | none found |
| Secret names visible | none found |
| Provider payload markers visible | none found |
| Raw service/shadow comparison markers visible | none found |

Forbidden owner-visible markers checked included `system_observability`, `shadowReadout`, `serviceCalls`, `recentServiceCalls`, `shadowComparisons`, `recentShadowComparisons`, `providerPayload`, `provider_payload`, `HF_SIDECAR_API_KEY`, `ASYNC_REVIEW_WEBHOOK_SECRET`, `xai`, and `grok`.

## Safety Result From Completed Session

| Safety item | Result |
| --- | --- |
| False emergency regression | No false-emergency case was exercised in this single session. The tester input contained true emergency signs, including collapse and blue gums. Existing false-emergency regression coverage remains separate from this production readout. |
| Terminal emergency persistence | Fixed for the tested production path. The terminal emergency summary saved a `symptom_checks` row. |
| Report persistence | Fixed for report/history readiness. Direct DB count moved from `0` to `1`; History displayed the saved report. |
| Emergency downgrade | None observed. The saved row is `severity=emergency` and `recommendation=emergency_vet`. |
| Owner-visible leakage | None observed in the History/report UI check. |

## Readiness Separation

| Readiness area | Status | Evidence |
| --- | --- | --- |
| Persistence readiness | Ready | Real tester row persisted to `symptom_checks`; direct DB count is `1`. |
| Report history readiness | Ready | History displays the saved emergency report. |
| Shadow observation readiness | Not ready | `observationCount=0`, `shadowComparisonCount=0`, and saved row lacks `system_observability.shadowReadout`. |
| Promotion readiness | Not ready | Minimal traffic plus zero observations/comparisons provide no model-shadow promotion evidence. |

## Promotion Decision

| Gate | Decision | Reason |
| --- | --- | --- |
| `SECOND_OPINION_EXTRACTOR` | HOLD | No second-opinion observations or comparisons were persisted. |
| `GROK_FINAL_SAFETY` | HOLD | No final-safety shadow observations/comparisons were persisted. |
| `GROK_FINAL_REPORT` | HOLD / remain off | No final-report shadow evidence exists, and report traffic volume is only one session. |
| Overall model promotion | NOT READY | The readout proves persistence recovery only; it does not prove shadow model readiness. |

## Traffic Window Decision

Another traffic window is required, but another window alone is not sufficient unless the persisted shadow aggregate is preserved in `symptom_checks.ai_response`.

Recommended sequence:

1. Keep all model flags in their current shadow/off posture.
2. Fix the report-save follow-up that strips `system_observability.shadowReadout` from persisted reports, most likely by preserving the aggregate across the tester-feedback ledger update.
3. Run another real invited-tester traffic window.
4. Re-run the scheduler and require non-zero `observationCount` and/or `shadowComparisonCount` before any promotion discussion.

## Notes

- Docs/report only for this ticket.
- No runtime files changed.
- No model flag promotion.
- No Vercel environment changes.
- No Supabase schema changes.
- No public launch.
- No synthetic traffic counted as organic.
- No secret values recorded.
