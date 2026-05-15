# VET-1492C - 48-72h Shadow Readout Analysis With Real Traffic

## Verdict

**EARLY BASELINE - insufficient 48h production window**

**Decision:** HOLD - insufficient data and telemetry source unavailable.

This readout was run before the required 48h point of **2026-05-17T03:06:00Z**. The production deployment for `efb192e4be35183c31db62faa602e96d96071410` completed around **2026-05-15T03:06:59Z**, so this is not a true 48-72h readout.

The readout also cannot be treated as a clean zero-traffic result because the production shadow telemetry endpoint reported a persisted-telemetry read failure:

- Supabase telemetry read failed with `Invalid API key`.
- Upstash shadow telemetry fallback failed with `fetch failed`.
- Direct local Supabase service-role read of `symptom_checks` returned `401`.

No secret values were printed or recorded.

## Required Checks

| Check | Result |
| --- | --- |
| `git fetch origin master --prune` | PASS |
| `git status --short --branch` | PASS with pre-existing unrelated modifications in benchmark/debug files |
| `git rev-parse HEAD` | `e78d922cf72dd40c797068497bfdb64962ebb397` on the existing VET-1492C branch |
| `git rev-parse origin/master` | `efb192e4be35183c31db62faa602e96d96071410` |
| `gh api repos/kandamukeshkumar4-cmyk/pawvital-ai/commits/master/status` | `success`, 2 Vercel contexts green |
| `vercel inspect https://pawvital-ai.vercel.app --scope kandasubbarao4-5462s-projects` | Ready production deployment |

## Window Analyzed

- **Window analyzed:** EARLY BASELINE - deployment start `2026-05-15T03:06:59Z`; analysis executed before `2026-05-17T03:06:00Z`
- **48h point:** `2026-05-17T03:06:00Z`
- **72h point:** `2026-05-18T03:06:00Z`
- **Production SHA:** `efb192e4be35183c31db62faa602e96d96071410`
- **Production deployment:** `dpl_32tbqFFpVKt5n3YFT3W29d6BRkLL`
- **Production URL:** `https://pawvital-ai.vercel.app`
- **Deployment status:** Ready
- **GitHub master statuses:** success

## Telemetry Source

- **Primary attempted source:** production `/api/ai/shadow-rollout` persisted baseline
- **Secondary attempted source:** direct Supabase REST read of `symptom_checks` with local service credentials
- **Result:** telemetry source unavailable for a trustworthy real-traffic readout

Production shadow-rollout baseline returned:

| Field | Value |
| --- | --- |
| generatedAt | `2026-05-15T03:14:18.247Z` |
| windowHours | `24` |
| reportCount | `0` |
| parsedReportCount | `0` |
| malformedReportCount | `0` |
| observationCount | `0` |
| shadowComparisonCount | `0` |
| warning | Supabase telemetry read failed; Upstash fallback failed |

Direct Supabase verification returned `401`, so `sessions observed` cannot be independently trusted from persisted storage in this run.

## Required Readout Fields

| Field | Value |
| --- | --- |
| window analyzed | EARLY BASELINE - insufficient 48h production window |
| production SHA | `efb192e4be35183c31db62faa602e96d96071410` |
| production deployment | `dpl_32tbqFFpVKt5n3YFT3W29d6BRkLL` |
| sessions observed | Unknown from persistence; production baseline report count returned `0` only after telemetry read/fallback failures |
| second_opinion_request | `0` observed |
| second_opinion_used | `0` observed |
| second_opinion_rejected | `0` observed |
| second_opinion_failed | `0` observed |
| second_opinion_budget_exhausted | `0` observed |
| final_safety_verifier | `0` observed |
| repeat_loop_suppression | `0` observed in real-traffic telemetry; VET-1491C controlled session observed `1` but is excluded from real-traffic readout |
| model fallback reasons | None observed; telemetry unavailable |
| timeout/provider_error | `0` observed; telemetry unavailable |
| owner-visible leakage | `0` observed; telemetry unavailable |
| emergency downgrade | `0` observed; telemetry unavailable |
| unsafe downgrade | `0` observed; telemetry unavailable |
| repeated-question regression | `0` observed; telemetry unavailable |

## Service Metrics

The production baseline returned zero observations for all shadow services:

| Service | Observations | Shadow observations | Comparisons | Timeout rate | Error rate | Fallback rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| vision-preprocess-service | 0 | 0 | 0 | 0 | 0 | 0 |
| text-retrieval-service | 0 | 0 | 0 | 0 | 0 | 0 |
| image-retrieval-service | 0 | 0 | 0 | 0 | 0 | 0 |
| multimodal-consult-service | 0 | 0 | 0 | 0 | 0 | 0 |
| async-review-service | 0 | 0 | 0 | 0 | 0 | 0 |

Because the telemetry source failed, these zeroes are evidence of unavailable telemetry, not proof that no real users or no shadow calls occurred.

## Safety Readout

| Safety item | Result |
| --- | --- |
| emergency downgrade | None observed; insufficient telemetry |
| unsafe downgrade | None observed; insufficient telemetry |
| owner-visible leakage | None observed; insufficient telemetry |
| repeated-question regression | None observed; insufficient telemetry |
| timeout/provider_error | None observed; insufficient telemetry |
| budget_exceeded | None observed; insufficient telemetry |

No safety regression can be confirmed from this readout. No promotion decision should rely on this data.

## Decision

| Gate | Decision | Reason |
| --- | --- | --- |
| SECOND_OPINION_EXTRACTOR | HOLD | Required 48h window has not elapsed; real persisted telemetry is unavailable |
| GROK_FINAL_SAFETY | HOLD | Required 48h window has not elapsed; no trusted final safety telemetry |
| GROK_FINAL_REPORT | HOLD/OFF | Remains off; no report promotion data |
| overall readiness | NOT READY | Early baseline plus telemetry-source failure prevents a real readout |

## Next

**Create fix ticket / hold readout.**

Recommended next ticket:

**VET-1493C - Repair Production Shadow Telemetry Readout Source**

Scope:

- Verify production Supabase service-role configuration used by `/api/ai/shadow-rollout`.
- Verify Upstash shadow telemetry fallback configuration and network reachability.
- Re-run a read-only production baseline without printing secrets.
- Do not change model flags, promote shadow modes, alter schema, or generate synthetic traffic unless explicitly labeled.

After the telemetry source is healthy and the clock passes **2026-05-17T03:06:00Z**, re-run VET-1492C for the real 48h readout. If traffic volume is still too low, the decision should remain `HOLD - insufficient data`.

## Notes

- Docs/report only.
- No runtime files touched.
- No Vercel env changes.
- No Supabase schema changes.
- No model flag promotion.
- No public launch.
- No synthetic traffic generated in this run.
- No secret values exposed.
- Pre-existing unrelated worktree modifications were left untouched:
  - `data/benchmarks/dog-triage/wave3-emergency-root-cause-ledger.json`
  - `data/benchmarks/dog-triage/wave3-residual-blockers.json`
  - `docs/wave3-emergency-baseline-debug.md`
