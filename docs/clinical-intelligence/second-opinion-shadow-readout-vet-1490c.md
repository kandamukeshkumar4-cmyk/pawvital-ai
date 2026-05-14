# VET-1490C Second-Opinion Shadow Readout Analysis

## Production State

- **Production commit**: `bc27a5151b837f8905646d02bb7c28a9a8c4b639`
- **Production deployment ID**: `dpl_APqnCLhdvbyBzke9JToghT1hVSAx`
- **Production alias**: `pawvital-ai.vercel.app`
- **Deployment status**: Ready
- **GitHub commit status**: success

## Readout Window

- **Start**: 2026-05-13T22:30:00-04:00 (VET-1488C shadow config deploy)
- **End**: 2026-05-14T18:30:00-04:00 (this analysis)
- **Elapsed**: ~20 hours
- **Required**: 48-72 hours
- **Window status**: INSUFFICIENT — less than 48h elapsed

## Telemetry Source

- **Primary**: Supabase `symptom_checks` table via service-role query
- **Secondary**: Upstash Redis shadow-telemetry-store (max 2000 snapshots)
- **Tertiary**: Vercel runtime logs
- **Query method**: Direct Supabase REST API with service-role key

## Production Flag Snapshot

| Flag | Value |
|------|-------|
| SECOND_OPINION_EXTRACTOR | shadow |
| GROK_FINAL_SAFETY | shadow |
| GROK_FINAL_REPORT | off |
| MODEL_ROUTER_VERSION | v1 |

## Provider Secret Presence

| Secret | Present |
|--------|---------|
| NVIDIA_QWEN_API_KEY | YES |
| XAI_API_KEY | YES (added during VET-1489C) |
| GROK_API_KEY | NO |

Both shadow modes (second-opinion and Grok safety) have their required provider keys.

## Telemetry Event Counts

| Metric | Count |
|--------|-------|
| Total symptom_checks ever | 0 |
| Sessions since shadow deploy | 0 |
| Sessions in last 7 days | 0 |
| Sessions in last 30 days | 0 |

### Second-Opinion Shadow Events

| Event | Count |
|-------|-------|
| second_opinion_request | 0 |
| second_opinion_used | 0 |
| second_opinion_rejected | 0 |
| second_opinion_failed | 0 |
| second_opinion_budget_exhausted | 0 |

### Fallback and Error Events

| Event | Count |
|-------|-------|
| budget_exceeded | 0 |
| timeout | 0 |
| malformed_json | 0 |
| provider_error | 0 |
| qid_mismatch | 0 |
| low_confidence | 0 |
| unsafe_value | 0 |

### Safety Events

| Event | Count |
|-------|-------|
| emergency_downgrade | 0 |
| unsafe_downgrade | 0 |
| repeat_loop_suppression | 0 |
| critical_unknown_escalation | 0 |
| owner_visible_leakage | 0 |

## Latency Summary

No latency data available — zero production sessions.

## Safety Findings

No safety findings — zero production sessions. No positive or negative safety signal.

## Owner-Visible Leakage Findings

No leakage findings — zero production sessions.

Local test suite (telemetry gate 8/8, route sentinels 30/30) confirms that the shadow infrastructure does not leak internal telemetry into owner-facing payloads under synthetic traffic.

## Benchmark Results

| Gate | Result | Details |
|------|--------|---------|
| Second-opinion extractor | PASS | 14/14 |
| Telemetry gate | PASS | 8/8 |
| Model router + budget | PASS | 8/8 |
| Symptom-chat route suite | PASS | 511/511 across 11 suites |
| Route sentinels | PASS | 30/30 |
| Release gate | PASS | 226 frozen cases, 0 failures |
| Build | PASS | Clean production build |
| Dangerous benchmark | SKIP | Requires live RunPod (no pod provisioned) |

## Analysis

### Why there is no telemetry

The PawVital AI symptom checker has not received any real production user traffic. The `symptom_checks` Supabase table contains zero rows across all time. This is consistent with the app being in a pre-launch / private-tester state where:

1. `PRIVATE_TESTER_INVITE_ONLY=1` restricts access to invited users only
2. `PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=0` blocks guest symptom-checker access
3. No testers have completed a symptom-check session since deployment

### Shadow infrastructure readiness

Despite zero production data, the shadow infrastructure is verified as ready:

- Second-opinion extractor tests pass (14/14) including shadow mode behavior
- Budget caps are enforced (model-budget tests pass)
- Telemetry events stay internal-only (telemetry gate 8/8)
- No owner-visible payload leakage (route sentinels 30/30)
- All 511 route-level tests pass confirming shadow mode does not alter clinical behavior
- Provider keys are present for both shadow modes

### What promotion requires

A meaningful promote/hold decision for SECOND_OPINION_EXTRACTOR requires:

1. Real production symptom-chat sessions (at minimum 20-50 sessions)
2. Observable second-opinion shadow call telemetry (request/used/rejected/failed counts)
3. Real latency measurements under production conditions
4. Real budget-cap enforcement events
5. Verification that shadow results do not drift from deterministic extractor behavior
6. At least 48h of continuous shadow operation

None of these are available with zero production traffic.

## Promote/Hold Decision

### HOLD

Cannot promote SECOND_OPINION_EXTRACTOR from shadow to on.

### Hold reasons

1. **Zero production traffic**: The `symptom_checks` table has zero rows. No real symptom-chat sessions have occurred in production.
2. **No shadow telemetry**: Without production sessions, no second-opinion shadow calls were made. There is no real-world data to evaluate extraction quality, latency, or safety behavior.
3. **Readout window incomplete**: Only ~20h elapsed of the required 48-72h window, but this is moot since zero sessions were observed.
4. **Private tester gate active**: `PRIVATE_TESTER_INVITE_ONLY=1` and `PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=0` prevent real traffic.

### What is NOT blocking promotion

- Shadow flag configuration is correct
- Provider keys are present (NVIDIA_QWEN_API_KEY, XAI_API_KEY)
- All test suites pass
- All safety benchmarks pass
- Build is clean
- No code-level blockers exist

## Required Next Steps

To unblock the readout:

1. **Generate real production traffic**: Either enable guest symptom-checker access (`PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=1`) or onboard the first cohort of private testers (see VET-1397)
2. **Wait for 48-72h** of real traffic after testers begin using the symptom checker
3. **Re-run this readout analysis** once sufficient sessions exist in the `symptom_checks` table
4. **Then decide** promote or hold based on real shadow telemetry data

## Next Ticket Recommendation

- **VET-1397** — Cohort 1 First 5 Tester Launch and 48-Hour Monitoring (GitHub issue #375)
  - This is the prerequisite for generating real production traffic
  - Once testers are onboarded and sessions are flowing, re-run VET-1490C readout analysis

- **Alternative**: If synthetic/manual testing is acceptable for initial promotion:
  - Run 10-20 manual symptom-check sessions against production
  - Query telemetry afterward
  - Make promote/hold decision on that smaller dataset

## Notes

- Readout only. No live model promotion.
- No runtime clinical behavior change.
- No Grok final report.
- No secret values exposed.
- XAI_API_KEY was added to production during VET-1489C session.
- The zero-traffic finding is not a bug — it reflects the app's pre-launch state.
