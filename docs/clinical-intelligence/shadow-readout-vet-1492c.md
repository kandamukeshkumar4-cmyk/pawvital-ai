# VET-1492C — 48-72h Shadow Readout Analysis With Real Traffic

## Readout Summary

| Field | Value |
|-------|-------|
| **Time window** | 2026-05-15T03:04Z – 2026-05-15T03:09Z (~5 minutes elapsed) |
| **Required window** | 48-72 hours |
| **Window status** | NOT MET — 0h of 48h minimum |
| **Production deployment SHA** | `efb192e4be35183c31db62faa602e96d96071410` |
| **Production deployment ID** | `dpl_32tbqFFpVKt5n3YFT3W29d6BRkLL` |
| **Production alias** | `https://pawvital-ai.vercel.app` |
| **Deployment status** | Ready |
| **Deployment created** | 2026-05-15T03:06:59Z |
| **GitHub commit status** | success (both Vercel contexts green) |

## Prerequisite: PR #491

| Field | Value |
|-------|-------|
| **PR** | [#491](https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/pull/491) |
| **Title** | VET-1491: vet 1491c controlled shadow traffic window |
| **State** | MERGED |
| **Merge commit** | `efb192e4be35183c31db62faa602e96d96071410` |
| **Merged at** | 2026-05-15T03:04:39Z |
| **Files changed** | `docs/clinical-intelligence/controlled-shadow-traffic-window-vet-1491c.md` (docs only) |

## Production Flag Snapshot

| Flag | Expected | Verified |
|------|----------|----------|
| SECOND_OPINION_EXTRACTOR | shadow | shadow (confirmed VET-1491C) |
| GROK_FINAL_SAFETY | shadow | shadow (confirmed VET-1491C) |
| GROK_FINAL_REPORT | off | off (confirmed VET-1491C) |
| MODEL_ROUTER_VERSION | v1 | v1 (confirmed VET-1491C) |

Flag values were verified during the VET-1491C controlled traffic window (2026-05-15 ~01:48-02:11 UTC) and have not been changed since. No Vercel env changes were made between VET-1491C and this readout.

## Provider Secret Presence

| Secret | Present |
|--------|---------|
| NVIDIA_QWEN_API_KEY | YES (confirmed VET-1490C) |
| XAI_API_KEY | YES (added VET-1489C, confirmed VET-1490C) |
| GROK_API_KEY | NO (XAI_API_KEY serves this role) |

## Open PR State

Only Dependabot dependency PRs remain open:

| PR | Title |
|----|-------|
| #488 | chore(deps-dev): bump pytest from 8.3.5 to 9.0.3 |
| #487 | chore(deps): bump requests from 2.32.5 to 2.33.0 |
| #486 | chore(deps): bump python-multipart from 0.0.20 to 0.0.27 |
| #485 | chore(deps): bump pillow from 11.3.0 to 12.2.0 |
| #484 | chore(deps): bump transformers from 4.57.0 to 5.0.0rc3 |

No feature or infrastructure PRs are in flight.

## Telemetry Event Counts

### Sources Checked

| Source | Status | Notes |
|--------|--------|-------|
| Supabase `symptom_checks` table | 0 rows (all time) | Confirmed in VET-1490C; no organic traffic since |
| Upstash Redis shadow telemetry store | No production reads possible | Requires service-role access from runtime |
| Vercel runtime logs | Not queried | Zero sessions means no shadow log entries to inspect |
| VET-1491C controlled sessions | 5 sessions (API-direct) | Not persisted to Supabase (unauthenticated, expected) |

### Session Counts

| Metric | Count |
|--------|-------|
| Sessions observed (organic) | 0 |
| Sessions observed (controlled, VET-1491C) | 5 |
| Total symptom_checks rows (Supabase) | 0 |
| Sessions in readout window (0h) | 0 |

### Second-Opinion Shadow Events

| Event | Count |
|-------|-------|
| second_opinion_request | 0 |
| second_opinion_used | 0 |
| second_opinion_rejected | 0 |
| second_opinion_failed | 0 |
| second_opinion_budget_exhausted | 0 |

### Final Safety Verifier Events

| Event | Count |
|-------|-------|
| final_safety_verifier | 0 |
| grok_safety_used | 0 |
| grok_safety_failed | 0 |

### Suppression and Fallback Events

| Event | Count |
|-------|-------|
| repeat_loop_suppression | 0 (organic); 1 (VET-1491C controlled Session 2) |
| model fallback reasons | none |
| timeout/provider_error | 0 |
| budget_exceeded | 0 |

### Safety Events

| Event | Count |
|-------|-------|
| emergency_downgrade | 0 |
| unsafe_downgrade | 0 |
| owner-visible leakage | 0 |
| repeated-question regression | 0 |

## Analysis

### Why There Is No Telemetry

The readout window has not elapsed. PR #491 merged at 2026-05-15T03:04:39Z and approximately 5 minutes have passed, far short of the required 48-72h observation window.

More fundamentally, PawVital AI has received **zero organic production user traffic** across all time. The `symptom_checks` Supabase table contains zero rows. This was confirmed in VET-1490C (~20h prior) and the underlying conditions have not changed:

1. `PRIVATE_TESTER_INVITE_ONLY=1` restricts access to invited users only
2. `PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=0` blocks guest symptom-checker access
3. No testers have been onboarded or completed a symptom-check session

### VET-1491C Controlled Sessions

VET-1491C successfully ran 5 controlled synthetic sessions via direct API calls to production between 2026-05-15 ~01:48-02:11 UTC. These sessions validated:

- Duration reply extraction (Session 1)
- Unknown/ambiguous coercion with repeat-loop suppression (Session 2)
- Second-opinion candidate path with clarification (Session 3)
- Emergency red-flag detection (Session 4)
- Mild/routine dermatologic triage (Session 5)

These sessions confirmed the shadow infrastructure is functional but:
- They were unauthenticated API-direct calls, so they did not persist to the `symptom_checks` Supabase table
- They represent controlled synthetic traffic, not organic real user behavior
- The readout window since their completion is approximately 1 hour, not 48-72h

### Shadow Infrastructure Readiness

Despite zero organic data, the shadow infrastructure is verified as operationally ready based on prior ticket validations:

| Component | Status | Source |
|-----------|--------|--------|
| Shadow flag configuration | Correct | VET-1489C, VET-1490C, VET-1491C |
| Provider keys present | Yes (NVIDIA + xAI) | VET-1489C, VET-1490C |
| Second-opinion extractor tests | PASS 14/14 | VET-1490C, VET-1491C |
| Telemetry gate tests | PASS 8/8 | VET-1490C, VET-1491C |
| Model router + budget tests | PASS 8/8 | VET-1490C, VET-1491C |
| Route sentinel replay | PASS 30/30 | VET-1490C, VET-1491C |
| Release gate | PASS 226/226 | VET-1490C, VET-1491C |
| Build | PASS | VET-1491C |
| Owner-visible leakage | None found | VET-1490C, VET-1491C |

### What Promotion Requires

A meaningful promote/hold decision for SECOND_OPINION_EXTRACTOR and GROK_FINAL_SAFETY requires:

1. At least 48h elapsed since the shadow deployment under observation
2. Real organic production symptom-chat sessions (minimum 20-50 sessions)
3. Observable second-opinion shadow call telemetry (request/used/rejected/failed counts)
4. Observable Grok safety shadow call telemetry
5. Real latency measurements under production conditions
6. Real budget-cap enforcement events
7. Verification that shadow results do not drift from deterministic extractor behavior

**None of these are available.** The 48-72h window has not started in any meaningful sense because no organic traffic flows through the system.

## Promote/Hold Decision

### HOLD — insufficient data

**Decision rationale**: Two independent blocking conditions prevent a promotion decision:

1. **Time window not met**: The 48-72h observation window has not elapsed. Only ~5 minutes have passed since PR #491 merged and production deployed.

2. **Zero organic production traffic**: Even if 72 hours had elapsed, the app is in pre-launch private-tester mode with zero organic sessions. The `symptom_checks` table remains empty across all time. Without real traffic, shadow mode produces no observable telemetry to evaluate.

### What Is NOT Blocking

- Shadow flag configuration is correct
- Provider keys are present (NVIDIA_QWEN_API_KEY, XAI_API_KEY)
- All test suites pass (extractor, telemetry gate, router, sentinels, release gate, build)
- All safety benchmarks pass
- No code-level blockers exist
- VET-1491C controlled traffic confirmed basic operational health

### Promotion Decision Per Flag

| Flag | Decision | Reason |
|------|----------|--------|
| SECOND_OPINION_EXTRACTOR | HOLD — shadow | Zero organic traffic; no real shadow telemetry |
| GROK_FINAL_SAFETY | HOLD — shadow | Zero organic traffic; no real Grok verifier observations |
| GROK_FINAL_REPORT | HOLD — off | Prerequisite (GROK_FINAL_SAFETY promotion) not met |
| MODEL_ROUTER_VERSION | HOLD — v1 | No change warranted without traffic data |

## Required Next Steps

### Immediate (to unblock this readout)

1. **Generate real production traffic**: The single prerequisite is getting real user sessions flowing. Options:
   - **VET-1397** — Cohort 1 First 5 Tester Launch (GitHub issue #375): Onboard initial private testers and enable real symptom-check sessions
   - **Alternative**: Set `PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=1` temporarily to allow guest symptom-checker sessions from the team for controlled real-traffic generation

2. **Wait for 48-72h** of traffic after sessions begin flowing

3. **Re-run this readout** once the `symptom_checks` table has 20+ sessions with shadow telemetry attached

### Readout Continuation Plan

| Condition | Action |
|-----------|--------|
| After tester onboarding begins | Schedule VET-1492C-retry readout for T+48h |
| If 20+ sessions with shadow telemetry exist at T+48h | Proceed to promote/hold decision |
| If fewer than 20 sessions at T+48h | Extend to T+72h, then decide |
| If zero sessions at T+72h | Escalate tester onboarding as critical blocker |

## Readout Summary Block

```text
time window:               2026-05-15T03:04Z – 2026-05-15T03:09Z (~5 min)
production deployment SHA: efb192e4be35183c31db62faa602e96d96071410
sessions observed:         0 organic / 5 controlled (VET-1491C, not persisted)
second_opinion_request:    0
second_opinion_used:       0
second_opinion_rejected:   0
second_opinion_failed:     0
second_opinion_budget_exhausted: 0
final_safety_verifier:     0
repeat_loop_suppression:   0 organic / 1 controlled
model fallback reasons:    none
timeout/provider_error:    0
owner-visible leakage:     0
emergency downgrade:       0
unsafe downgrade:          0
repeated-question regression: 0
```

## Notes

- Docs/report only. No runtime files touched.
- No Vercel env changes.
- No Supabase schema changes.
- No model flag promotion.
- No public launch.
- No secret values exposed.
- The zero-traffic finding is consistent with VET-1490C and reflects the app's pre-launch private-tester state.
- This readout establishes the baseline record for the post-PR #491 shadow observation period.
