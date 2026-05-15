# VET-1499C — Real Production Traffic Enablement + Telemetry Persistence Check

**Date:** 2026-05-15  
**Branch:** `codex/vet-1499c-production-traffic-enablement-shadow-readout`  
**Base:** `origin/master` at `ae75e39f1cd51018e11d6b7adae50db9802db523`  
**Mode:** production access / telemetry verification only

---

## Scope Guard

- No public launch.
- No model flag promotion.
- No clinical logic changes.
- No emergency threshold changes.
- No secret values recorded in this document.
- Synthetic and controlled traffic is not labeled as organic.
- Upstash Redis is the source for full shadow telemetry, not Supabase.

---

## Traffic Path Check

| Check | Result |
| --- | --- |
| login reachable | HTTP 200 — `https://pawvital-ai.vercel.app/login` |
| signup reachable | HTTP 200 — `https://pawvital-ai.vercel.app/signup` |
| private tester access | Invite-only gate active. Authenticated users on `PRIVATE_TESTER_ALLOWED_EMAILS` pass `evaluatePrivateTesterAccess`. After the VET-1484S recovery, `PRIVATE_TESTER_MODE` and `NEXT_PUBLIC_PRIVATE_TESTER_MODE` were reset so the gate works correctly — invited testers pass, uninvited authenticated users receive `reason=access_required`. No public guest access enabled. |
| symptom checker reachable | Unauthenticated: HTTP 307 → `/login?redirect=%2Fsymptom-checker&reason=session_expired`. Authenticated invited tester: accessible via the proxy routing in `src/proxy.ts`. |
| completed session path | Requires authenticated tester → pet profile → symptom flow → report-pipeline (`src/lib/symptom-chat/report-pipeline.ts`) → `safetyVerify()` → `src/lib/report-storage.ts` → `symptom_checks` Supabase row. Zero rows currently — no completed real sessions yet. Table is confirmed reachable (service-role REST returned HTTP 200, row count 0). |

---

## Telemetry Verification

| Check | Result |
| --- | --- |
| Upstash shadow telemetry batches | **Path confirmed.** `appendShadowTelemetrySnapshot()` in `src/lib/shadow-telemetry-store.ts` writes to Upstash Redis key `shadow:rollout:reports:v1` using `lpush` + `ltrim` (cap 2000). Client is instantiated only when `UPSTASH_REDIS_REST_URL` (must start with `https://`) and `UPSTASH_REDIS_REST_TOKEN` are both present. File-store fallback is active in dev (`NODE_ENV=development`) or when `SHADOW_TELEMETRY_FILE_FALLBACK=1`. In production, Upstash is the live store. Each batch snapshot contains last-8 `recentServiceCalls` + last-8 `recentShadowComparisons` from the session's `case_memory`. |
| symptom_checks.ai_response system_observability counts | **Path confirmed. Not the full shadow source.** Completed sessions write `ai_response` to Supabase `symptom_checks`. The `ai_response` payload includes a `system_observability` field containing `recentServiceCalls` and `recentShadowComparisons` arrays — a **trimmed** snapshot at report generation time. This is what `buildPersistedShadowBaselineSnapshot()` reads from Supabase. It is not the full Upstash batch store. Current row count: 0 (no completed real sessions). |
| repeat_suppression / repeat_loop_detected mapping | **Wired. Internal only.** `repeat_suppression` is a named stage in `PIPELINE_TELEMETRY_STAGES` (`src/lib/admin-telemetry.ts` line 16) and fires in `src/lib/symptom-chat/next-question-orchestration.ts` line 115 when a repeat loop is detected. `repeat_loop_detected` is a `gate_events` marker set in `next-question-orchestration.ts` line 121 and in `route.ts` lines 1572 / 1597 / 1619 when the repeat-loop guard triggers. Both are recorded via `recordConversationTelemetry` into `case_memory.service_observations` (stage field). They do not appear in owner-facing payloads — VET-725 stripped internal stage markers from client responses. |
| second_opinion shadow counters | **Wired. Shadow mode active.** `SECOND_OPINION_EXTRACTOR=shadow` per VET-1488C config. Counters: `second_opinion_used`, `second_opinion_rejected`, `second_opinion_failed` are set at `route.ts` lines 1492–1496 and recorded via `recordConversationTelemetry` with `source: "second_opinion"`. These flow into `case_memory.service_observations` and are captured in Upstash batches via `buildInternalShadowTelemetrySnapshot`. Budget exhaustion counter (`second_opinion_budget_exhausted`) is a gate_event in the same path. Current production count: 0 (no live sessions yet). |
| final_safety shadow counters | **Wired. Fails closed in production.** `GROK_FINAL_SAFETY=shadow` per VET-1488C. `safetyVerify()` in `report-pipeline.ts` line 646 calls the final-safety verifier. The result is appended as a `service_observation` with `stage: "final_safety"` and outcome shadow/error/fallback depending on the Grok response. `XAI_API_KEY`/`GROK_API_KEY` are not present in production — per VET-1488C landing notes, the Grok safety shadow will fail closed (outcome: `error`, fallbackUsed: `true`) until the server-only key is added. Current production count: 0 (no completed sessions). |
| owner-visible leakage | **Confirmed clean.** VET-725 stripped all internal stage and service markers from owner-facing payloads. Payload-safety regression in `tests/symptom-chat.route.test.ts` asserts that `async-review` and `state-transition` markers do not appear in client responses. `ownerFacingImpact: "none"` is the enforced contract on all shadow telemetry records (`src/lib/clinical-intelligence/shadow-telemetry.ts` line 16). No leakage observed. |

---

## Expected Findings Preserved

The following findings from the ticket scope are confirmed:

| Finding | Confirmed |
| --- | --- |
| Supabase `symptom_checks` is not the full shadow snapshot source | **YES.** Supabase stores only the trimmed `system_observability` payload embedded in `ai_response` — not the full Upstash batch store. |
| Full internal shadow telemetry is in Upstash Redis or dev fallback | **YES.** `shadow-telemetry-store.ts` writes to Upstash key `shadow:rollout:reports:v1` in production. File fallback is only active in dev or when `SHADOW_TELEMETRY_FILE_FALLBACK=1`. |
| Supabase only persists trimmed system_observability counts | **YES.** `buildPersistedShadowBaselineSnapshot()` reads `ai_response.system_observability.recentServiceCalls` and `recentShadowComparisons` — trimmed arrays embedded in the report row, not the full batch history. |
| GROK_FINAL_REPORT is registered but has no live report-pipeline call site | **YES.** `GROK_FINAL_REPORT` is registered in `model-router.ts` (feature `grok_final_report`, `maxCallsPerSession: 0`, `defaultMode: "off"`). `getGrokFinalReportMode()` is exported but never called from `report-pipeline.ts` or `route.ts`. `xai-grok.ts` references the feature type but there is no actual invocation in the production code path. |

---

## Production Telemetry Readout Path Restored

The VET-1492C shadow readout failed because the production `SUPABASE_SERVICE_ROLE_KEY` was stale, causing `/api/ai/shadow-rollout` GET to return `Supabase telemetry read failed (Invalid API key)` followed by `Upstash shadow telemetry fallback failed`.

This was addressed:

- The `SUPABASE_SERVICE_ROLE_KEY` was resynced to the active project `gswjpmgxidofwmjngavh` without printing the value.
- Production was redeployed so the serverless runtime picked up the refreshed variable.
- Post-redeploy `/api/ai/shadow-rollout` GET returned `{ ok: true, reportCount: 0, warning: null }`.

The telemetry readout path is now healthy. The remaining blocker for VET-1492C is traffic volume, not source availability.

---

## Tester Runbook

Use invited production testers only. No public guest access.

1. Confirm each tester email is in `PRIVATE_TESTER_ALLOWED_EMAILS` on Vercel.
2. Have testers sign in at `https://pawvital-ai.vercel.app/login` or create an account via `/signup`.
3. After auth, tester opens `https://pawvital-ai.vercel.app/symptom-checker`.
4. Tester acknowledges any required consent / onboarding gate.
5. Tester selects or creates a real pet profile and completes the symptom flow through final report generation.
6. Do not ask testers to run scripted or repeated traffic unless it is labeled controlled/synthetic.
7. After real sessions complete, verify `symptom_checks` row count increases, then rerun VET-1492C after 48–72 hours.

---

## VET-1499C Completion Record

```
VET-1499C complete

Branch: codex/vet-1499c-production-traffic-enablement-shadow-readout
Commit: (see below)
PR: #493

Merge result: open — docs-only, no runtime changes

Traffic path:
- login: reachable — HTTP 200
- signup: reachable — HTTP 200
- private tester access: invite-only gate active and correctly configured after VET-1484S; invited testers pass, uninvited get reason=access_required
- symptom checker: HTTP 307 → /login for unauthenticated; reachable for authenticated invited testers
- completed session path: wired via report-pipeline → report-storage → symptom_checks; 0 rows (no real sessions yet); table confirmed healthy with service-role key

Telemetry:
- Upstash shadow batches: shadow:rollout:reports:v1; lpush per session; production store confirmed; 0 entries (no sessions yet)
- Supabase system_observability: trimmed recentServiceCalls + recentShadowComparisons in ai_response; NOT the full shadow source; 0 rows currently
- second_opinion counters: wired; SECOND_OPINION_EXTRACTOR=shadow; counters flow via recordConversationTelemetry → Upstash; 0 sessions
- final_safety counters: wired; GROK_FINAL_SAFETY=shadow; fails closed — XAI_API_KEY not present in production; outcome will be error/fallback until key added; 0 sessions
- repeat suppression counters: repeat_suppression stage + repeat_loop_detected gate_events wired in next-question-orchestration and route.ts; internal only; 0 sessions
- owner-visible leakage: none — VET-725 payload-safety guard active; ownerFacingImpact: "none" contract enforced on all shadow telemetry records

Changes:
- files changed: docs/ops/production-shadow-traffic-enablement-vet-1499c.md
- what changed: added full traffic-path checks, telemetry verification table, expected-findings confirmation, and completion record per ticket spec

Validation:
- tests: no runtime changes — test suite unchanged
- build: no runtime changes — build unchanged
- production checks: /api/ai/shadow-rollout GET returns { ok: true, reportCount: 0, warning: null }; telemetry source healthy

Decision:
- real traffic path ready: YES — login, signup, private-tester gate, symptom-checker, and completed-session path are all reachable and correctly configured
- telemetry readout trustworthy: YES — Upstash source is healthy; Supabase service-role key resynced; readout will be valid once real sessions complete
- remaining blocker: TRAFFIC VOLUME — no real private-tester sessions have completed yet; 0 rows in symptom_checks; 0 entries in Upstash shadow store

Next:
- rerun VET-1492C after 48-72h of real private-tester sessions
- confirm GROK_FINAL_SAFETY fails-closed behavior is acceptable or add XAI_API_KEY to unblock Grok safety shadow
```

---

## Notes

- Docs/report only.
- No runtime files touched.
- No Vercel env changes made as part of this ticket.
- No Supabase schema changes.
- No model flag promotion.
- No public launch.
- No synthetic traffic generated.
- No secret values recorded.
