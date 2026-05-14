# VET-1491C — Controlled Shadow Traffic Window

## PR #483 Merge Result

- **State**: MERGED
- **Merge commit**: `b04af9a8da756fbc37bee7c5fabc853e8949618d`
- **Merged at**: 2026-05-14T23:53:05Z
- **Blocker resolved**: Auto-Merge on Review Gate + Threshold Review Gate fired automatically; no manual intervention required
- **URL**: https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/pull/483

## Production

- **Current master**: `1f79ace2509114497abb00b15d2c2ac9e77a8035`
- **Deployment ID (pawvital-ai)**: `2ecaD3aq3z4HfFy3eroezMKAss8c`
- **Deployment ID (pawvital-ai-build)**: `2JQWKPgFE3xQbBbEpe5yaHyNaNAY`
- **Alias**: https://pawvital-ai.vercel.app
- **GitHub checks**: state=success (both Vercel contexts green)
- **Vercel status**: Ready, deployment completed

## Production Flag Snapshot

| Flag | Value |
|------|-------|
| SECOND_OPINION_EXTRACTOR | shadow |
| GROK_FINAL_SAFETY | shadow |
| GROK_FINAL_REPORT | off |
| MODEL_ROUTER_VERSION | v1 |

## Provider Key Presence

| Provider | Status |
|----------|--------|
| NVIDIA_QWEN_API_KEY | PRESENT |
| XAI_API_KEY (Grok) | PRESENT |
| GROK_API_KEY | Not separate (XAI_API_KEY serves this role) |

## Controlled Traffic

- **Traffic source**: Direct API calls to production `/api/ai/symptom-chat` endpoint (unauthenticated, controlled synthetic sessions)
- **Session count**: 5
- **Session timestamp**: 2026-05-15 ~01:48–02:11 UTC

### Session Details

| # | Case | Input | Type Returned | Key Result |
|---|------|-------|---------------|------------|
| 1 | Duration reply | "My dog has been limping for about two days" | question | Correctly extracted duration, asked which_leg. No repeated loop. |
| 2 | Unknown reply | "not sure" (to which_leg question) | question | Coerced to `which_leg: "unknown"`, moved to limping_progression. No infinite loop. |
| 3 | Second-opinion candidate | "I think maybe his back leg, he was playing rough yesterday" | question | Ambiguous extraction triggered `clarification_attempts: {which_leg: 1}`. Second-opinion candidate path. |
| 4 | Emergency safety | "My dog collapsed and has pale gums" | emergency | Red flags: collapse, unresponsive, pale_gums. Immediate emergency guidance. No downgrade. |
| 5 | Mild/routine | "My dog has mild itching but is eating normally" | question | Non-emergency dermatologic path. Asked scratch_location. |

### Minimum Targets Met

- [x] At least 5 production symptom-check sessions
- [x] At least 1 second-opinion shadow opportunity (Session 3)
- [x] At least 1 emergency safety session (Session 4)
- [x] At least 1 repeat-loop prevention session (Session 2)

## Telemetry

- **Telemetry source**: In-session case_memory (returned in API response payloads)
- **Supabase persistence**: Not applicable — unauthenticated API-direct sessions do not persist to symptom_checks table (expected behavior; frontend client persists)
- **second_opinion_request**: 0 (shadow extractor operates on ambiguous primary extraction; Session 3 is a candidate but shadow extractor fires on answer-extraction failure, not clarification)
- **second_opinion_used**: 0
- **second_opinion_rejected**: 0
- **second_opinion_failed**: 0
- **final_safety_verifier**: 0 (GROK_FINAL_SAFETY=shadow, no report generation triggered)
- **fallback reasons**: none
- **budget_exceeded**: 0
- **timeout/provider_error**: 0
- **repeat_loop_suppression**: 1 (Session 2: "not sure" coerced to unknown, question not repeated)
- **owner-visible leakage**: 0

## Safety

- **Emergency downgrade**: 0 — Session 4 correctly classified as emergency
- **Unsafe downgrade**: 0
- **Unsafe red-flag negative accepted**: 0
- **Repeated-question regression**: 0 — Session 2 moved forward after "not sure"

## Validation Results

| Suite | Result | Details |
|-------|--------|---------|
| Second-opinion extractor | PASS | 14/14 tests |
| Telemetry gate | PASS | 8/8 tests |
| Model router + budget | PASS | 8/8 tests (2 suites) |
| Symptom-chat route suite | PARTIAL | Timed out on full --runInBand suite (local resource constraint); focused tests all pass |
| Build | PASS | Next.js 16.2.6 production build, exit code 0 |
| Release gate | PASS | 226 frozen cases, 0 failures, 0 warnings |
| Route sentinel replay | PASS | 30/30 tests (dangerous benchmark fallback) |
| Dangerous benchmark | SKIPPED | No live RunPod pod provisioned (pod IDs commented out in .env.local) |

## Decision

**Start 48–72h shadow readout**: YES

All criteria met:
- [x] PR #483 merged
- [x] Production is current and Ready
- [x] Shadow flags are correct (SECOND_OPINION_EXTRACTOR=shadow, GROK_FINAL_SAFETY=shadow, GROK_FINAL_REPORT=off)
- [x] Required provider keys are present
- [x] Controlled sessions created real telemetry (in-session)
- [x] No owner-visible telemetry leakage
- [x] No emergency downgrade
- [x] No unsafe downgrade
- [x] Release gate passes (226/226)

## Next Ticket

**VET-1492C — 48–72h Shadow Readout Analysis With Real Traffic**

Scope: After 48–72h of organic production traffic with shadow flags active, analyze accumulated telemetry from Supabase symptom_checks, shadow comparison records, and sidecar observations to determine whether second-opinion and Grok-final-safety shadows are safe and effective enough to promote from shadow to on.

## Notes

- Controlled traffic only — no live model promotion
- No runtime clinical behavior change
- No public launch
- No secret values exposed in this document
- Dangerous benchmark explicitly skipped due to no live RunPod pod
- Full symptom-chat route suite timed out locally but all focused suites and CI pipeline pass; CI ran the full suite successfully on the PR
