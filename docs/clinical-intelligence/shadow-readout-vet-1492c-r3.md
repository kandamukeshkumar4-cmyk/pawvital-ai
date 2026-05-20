# VET-1492C-R3 - Formal Shadow Readout: Post-VET-1518C Fix Verification

## Executive Summary

**Decision: HOLD - do not promote model flags.**

VET-1518C fixed the shadowReadout stripping bug. The fix is confirmed working in production:
`sessionPresenceCount` moved from `0` to `1` and `observationCount` moved from `0` to `3`.

However, shadow comparisons remain at `0` because `GROK_FINAL_SAFETY` shadow calls fail
closed without `XAI_API_KEY` in production (2 `providerErrorCount`), and sidecar services
(RunPod) have no provisioned pods and no recorded observations. The sidecar-level
promotion gate requires 288 healthy samples per 5-minute window over 24 hours - this
is not achievable with the current traffic volume.

This R3 readout closes the VET-1518C feedback loop and establishes the next concrete
blockers for eventual model promotion.

## Production Deployment State

| Field | Value |
| --- | --- |
| Production alias | `https://pawvital-ai.vercel.app` |
| Vercel deployment | `dpl_5A3SbspmDHxsmon1nAT4UFUu8cok` |
| Target | `production` |
| Status | `Ready` |
| Source PR | PR #505 (VET-1518C) |
| Merge commit | `ab5f834371ed79e7342c3306370443809c04676d` |

## Data Window

| Source | Result |
| --- | --- |
| Issue `#495` latest scheduler comment | `ready_for_formal_readout` |
| Scheduler run (pre-session) | `26189135387` |
| Scheduler run (post-session) | `26189994666` |
| Post-session scheduler `generated_at` | `2026-05-20T21:06:44.884Z` |
| Direct endpoint `generated_at` | `2026-05-20T21:32:36.683Z` |
| Readout endpoint | `https://pawvital-ai.vercel.app/api/ai/shadow-rollout` |
| Window hours | `24` |
| Tester session | Schema Test Dog (Labrador Retriever, 4y) -- limping, gradual onset 2 days |
| Session outcome | Same-day veterinary care recommended -- High Concern |
| History row visible | yes |

## Tester Session

One credentialed production session was completed after the VET-1518C deployment:

- **Pet:** Schema Test Dog, Labrador Retriever, 4y, 55 lbs
- **Symptom:** Gradual-onset front-left-leg limping, 2 days, partial weight-bearing
- **Urgency result:** Same-day veterinary visit (High Concern, Confidence 45%)
- **History row:** Confirmed visible in `/history`
- **Report mode:** Full diagnostic with urgency guidance and red-flag escalation signs

## Scheduler Output (Post-Session Run)

| Field | Value |
| --- | --- |
| status | `ready_for_formal_readout` |
| decision | `RUN FORMAL VET-1492C RERUN` |
| ok | `true` |
| overall_status | `insufficient_data` |
| report_count | `2` |
| parsed_report_count | `2` |
| malformed_report_count | `0` |
| observation_count | `3` |
| shadow_comparison_count | `0` |
| warning | `null` |

## Direct Endpoint Output

Full endpoint response (`/api/ai/shadow-rollout`) at `2026-05-20T21:32:36.683Z`:

### Baseline

| Field | Value |
| --- | --- |
| `reportCount` | `2` |
| `parsedReportCount` | `2` |
| `malformedReportCount` | `0` |
| `reportPresenceCount` | `2` |
| `sessionPresenceCount` | `1` |
| `observationCount` | `3` |
| `shadowComparisonCount` | `0` |
| `timeoutCount` | `0` |
| `fallbackCount` | `0` |
| `providerErrorCount` | `2` |
| `budgetExceededCount` | `0` |

### Summary

| Field | Value |
| --- | --- |
| `overallStatus` | `insufficient_data` |
| `shadowModeDataPresent` | `false` |

### Service Metrics (All 5 Sidecar Services)

| Service | observations | shadow_observations | comparisons | errors | timeouts | status |
| --- | --- | --- | --- | --- | --- | --- |
| vision-preprocess-service | 0 | 0 | 0 | 0 | 0 | `insufficient_data` |
| text-retrieval-service | 0 | 0 | 0 | 0 | 0 | `insufficient_data` |
| image-retrieval-service | 0 | 0 | 0 | 0 | 0 | `insufficient_data` |
| multimodal-consult-service | 0 | 0 | 0 | 0 | 0 | `insufficient_data` |
| async-review-service | 0 | 0 | 0 | 0 | 0 | `insufficient_data` |

Each service blocker: requires 2 minimum observations and 288 healthy-window samples
over 24h (5-minute intervals). Current: 0 for all services.

## Delta from R2

| Metric | R2 (pre-VET-1518C) | R3 (post-VET-1518C) | Change |
| --- | --- | --- | --- |
| `reportCount` | 1 | 2 | +1 |
| `sessionPresenceCount` | 0 | **1** | **+1 (fix confirmed)** |
| `observationCount` | 0 | **3** | **+3 (fix confirmed)** |
| `shadowComparisonCount` | 0 | 0 | none |
| `providerErrorCount` | N/A (not measured) | 2 | new signal |
| Service-level observations | all 0 | all 0 | none |

## Interpretation

### VET-1518C Fix Confirmed

`sessionPresenceCount: 1` and `observationCount: 3` confirm that the new tester session
row retained `system_observability.shadowReadout` after the tester-feedback ledger update.
The R2 root cause (tester-ledger rewrite stripping the aggregate) is resolved.

### Why `shadowComparisonCount` Remains 0

Shadow comparisons require both the primary model call and the shadow model call to
succeed and return results that can be compared. Two distinct blockers prevent this:

1. **`GROK_FINAL_SAFETY` (shadow mode) -- fails closed**. `XAI_API_KEY` / `GROK_API_KEY`
   is not set in the Vercel production environment. Every Grok shadow call fails at the
   provider layer. The `providerErrorCount: 2` is consistent with 2 Grok shadow call
   attempts (one per shadow-mode service per session). No comparison is produced when the
   shadow provider returns an error.

2. **`SECOND_OPINION_EXTRACTOR` (shadow mode)** -- uses the Claude API which is available.
   The 3 observations likely include second-opinion extractor shadow invocations. However,
   `shadowComparisonCount: 0` suggests either the comparison logic is not recording a result
   or both legs of the comparison did not complete cleanly within the session.

### Why Sidecar Service Metrics Are All 0

The 5 sidecar services (vision, text, image, multimodal, async-review) are RunPod-based.
No RunPod pods are provisioned (`narrow_model_pack: no pod provisioned`). These services
cannot record observations without an active pod. The sidecar-level promotion gate requires
288 healthy samples over 24 hours -- not achievable without a live pod.

### `shadowModeDataPresent: false`

The summary-level flag `shadowModeDataPresent` is driven by the sidecar service layer.
Even with `observationCount: 3` in the baseline, no sidecar-level shadow-mode observations
exist, so the summary gate remains false. This is correct behavior.

## Owner-Visible Safety

| Check | Result |
| --- | --- |
| Internal telemetry markers in History UI | none found |
| `system_observability` key visible in owner report | none found |
| `shadowReadout` key visible in owner report | none found |
| Provider payload markers visible | none found |
| Secret key names visible | none found |

VET-725 payload-safety guard confirmed active.

## Readiness Separation

| Readiness area | Status | Evidence |
| --- | --- | --- |
| Persistence readiness | **Ready** | 2 rows persisted; History confirmed |
| shadowReadout preservation | **Ready** | `sessionPresenceCount: 1`, `observationCount: 3` |
| Shadow comparison readiness | **Not ready** | `shadowComparisonCount: 0`; Grok fails closed |
| Sidecar service readiness | **Not ready** | All 5 services at 0; no RunPod pods |
| Promotion readiness | **Not ready** | No comparison evidence; insufficient traffic |

## Promotion Decision

| Gate | Decision | Reason |
| --- | --- | --- |
| `SECOND_OPINION_EXTRACTOR` | HOLD | 3 observations recorded, 0 comparisons completed; comparison path needs investigation |
| `GROK_FINAL_SAFETY` | HOLD | Fails closed -- `XAI_API_KEY` not in production |
| `GROK_FINAL_REPORT` | HOLD / remain off | No evidence; 0 traffic for this path |
| Overall model promotion | **NOT READY** | No shadow comparisons; insufficient traffic volume |

## Remaining Blockers (Ordered by Priority)

| # | Blocker | Impact | Ticket |
| --- | --- | --- | --- |
| 1 | `GROK_FINAL_SAFETY` fails closed -- `XAI_API_KEY` not in Vercel prod | Grok shadow cannot produce comparisons | Ops: add key or disable Grok shadow |
| 2 | `SECOND_OPINION_EXTRACTOR` shadow -- 3 observations but 0 comparisons | Comparison recording path may have a bug | VET-1520C investigation candidate |
| 3 | No RunPod pods provisioned | Sidecar services cannot contribute any observations | Ops: provision narrow-model-pack pod |
| 4 | 2-session traffic window is statistically insufficient | Cannot claim distribution-level safety signal | Extended tester window (5+ sessions) |

## Recommended Next Tickets

1. **VET-1520C** -- Investigate why `SECOND_OPINION_EXTRACTOR` shadow produces 3 observations
   but 0 comparisons. Check whether the comparison recording logic requires a successful
   Grok call to produce any comparison, or whether it can compare second-opinion results
   independently.

2. **Ops: `XAI_API_KEY`** -- Add Grok API key to Vercel production environment to enable
   `GROK_FINAL_SAFETY` shadow comparisons. This is an ops action, not a code ticket.
   Until this key is added, Grok shadow will always fail closed and `providerErrorCount`
   will accumulate with each session.

3. **Extended tester window** -- Aim for 5+ completed sessions from distinct credentialed
   accounts before the next formal readout. The current 2-session window is not sufficient
   for a meaningful shadow evaluation.

4. **VET-1492C-R4** -- Run formal shadow readout after VET-1520C investigation resolves
   and the `XAI_API_KEY` ops action completes. Gate the R4 readout on
   `shadowComparisonCount > 0` before any promotion discussion begins.

## Notes

- Docs/report only. No runtime files changed.
- No model flag promotion.
- No Vercel environment changes.
- No Supabase schema changes.
- No public launch.
- No synthetic traffic counted as organic.
- No secret values recorded.

## Appendix: Sanitized Scheduler Decision Block (Post-Session Run)

```json
{
  "status": "ready_for_formal_readout",
  "decision": "RUN FORMAL VET-1492C RERUN",
  "due": true,
  "reportCount": 2,
  "warning": null
}
```

## Appendix: Sanitized Baseline Block

```json
{
  "ok": true,
  "overall_status": "insufficient_data",
  "report_count": 2,
  "parsed_report_count": 2,
  "malformed_report_count": 0,
  "report_presence_count": 2,
  "session_presence_count": 1,
  "observation_count": 3,
  "shadow_comparison_count": 0,
  "timeout_count": 0,
  "fallback_count": 0,
  "provider_error_count": 2,
  "budget_exceeded_count": 0,
  "warning": null
}
```
