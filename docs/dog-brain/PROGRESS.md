# Dog Brain — Closed-Loop Progress

> Loop memory for the "Complete PawVital Dog Brain as a bounded closed loop" goal.
> DISCOVER → PLAN → EXECUTE → VERIFY → ITERATE. Do not claim done until hard verification passes.

## Current HEAD / branch

- Branch: `codex/dog-brain-ui-closeout`
- HEAD at loop start: `050bdcf` ("docs(qa): vet-record upload->extract->persist VERIFIED live")
- Worktree: `G:\MY Website\pawvital-ai` (busy multi-agent env — plans/*.json churn from agent-watcher is NOT ours)
- jest runs locally on G: (only `npm run build` is the known-broken-on-G: step → use Vercel remote for build proof)

## Verified test baseline (AutoLab: never hand off worse than this)

- `npx jest --runInBand "dog-brain"` → **8 suites / 67 tests PASS** (2.8s)
- `npx jest --runInBand "followups|next-question|question-phrasing|triage-engine"` → **8 suites / 233 tests PASS** (2.8s)

## Discovery — what the checker actually verified (not just "API exists")

### DONE (code-verified)
- **Blocker #1 — VetRecordIntakeButton passes pet_id.** `src/components/symptom-checker/vet-record-intake-button.tsx:66` sets `formData.set("pet_id", petId)`; route `src/app/api/azure/documents/vet-record-intake/route.ts:170-180` validates ownership and `persistVetRecordSummary` writes `user_id`+`pet_id` into `vet_record_summaries`. ✅
- **Blocker #2 — follow-up idempotency.** `src/app/api/dog-brain/followups/route.ts:89-137` does pre-query for pending (user+pet+signal_key+status=pending) → insert → catches 23505 as deduped. Does NOT rely on a non-matching onConflict target. ✅
- **Blocker #3 — 90-day context not silently capped.** `src/lib/health-log/dog-brain-context.ts` uses `MAX_LOGS=90`, passes full window to `summarizeDailyLogsForContext(logs, petName, MAX_LOGS)`; the 14-day `RECENT_PACK_WINDOW` is an intentional *additional* detail layer, not a cap. Test-covered (`dog-brain-90day-window.test.ts`). ✅
- **Blocker #4 — server-side due_at.** `followups/route.ts:109-111` defaults `due_at` to +3d server-side. ✅ (scheduling is minimal but durable)
- **Urgency safety.** Deterministic emergency/red-flag path (`route.ts:2327-2387`) runs before planning; Brain context lives only in `case_memory.daily_log_context`, read solely by `buildNarrativeReportPrompt`. Test-covered (`dog-brain-context-urgency-guard.test.ts`). ✅

### OPEN (real gaps, priority order)
1. **Blocker #5 — Brain influences question planning.** ✅ DONE — maker (run 2) + independent clinical checker **APPROVE-WITH-NITS, no required fixes** (run 3). Checker independently code-traced all 8 safety checks PASS: candidate set unchanged, complaint + pending-clarification priority, urgency/red-flag isolation, no-op + best-effort safety, wiring real end-to-end. SIA Goodhart guard: verified against deterministic SYMPTOM_MAP, not the maker's tests.
   - Checker nit (future, non-blocking): `stool_change → [diarrhea, blood_in_stool, constipation]` can't distinguish direction; after complaint exhaustion the highest-urgency sibling is surfaced, so a constipation-only history could surface a diarrhea follow-up. Tiebreak-only → safety intact. Tracked under gap #6 (enrich signal shape to carry stool direction).
   - **Thermo-review verdict: APPROVE-WITH-NITS.** Applied the interim fix (commit 2): the two independent best-effort Brain loads in the chat block now run via `Promise.all` instead of sequentially. Re-verified: typecheck pass, 468 tests pass (incl. symptom-chat route). Recorded FAST-FOLLOW (gap #7 below): fold signal detection into `loadDogBrainContext` (it already loads the 90-log superset) and return `{ context, prioritySymptoms }`, deleting `priority-symptoms-server.ts` + one ownership/logs round-trip per turn.
   - Design shipped: **tiebreak-only** — `getNextQuestionAvoidingRepeat(session, preferred, brainPrioritySymptoms=[])` inserts a Brain term BETWEEN the current complaint and the generic fallback. Current complaint always wins; Brain only surfaces an already-legal follow-up after the complaint is exhausted; empty Brain = byte-identical no-op.
   - Files: NEW `src/lib/dog-brain/question-priority.ts` (pure map signal→symptom keys), NEW `src/lib/dog-brain/priority-symptoms-server.ts` (best-effort loader), edited `answer-coercion.ts` (+3rd param), `next-question-orchestration.ts` (+optional input field), `route.ts` (import + load in existing best-effort chat block + pass to orchestrate).
   - Tests: NEW `tests/dog-brain-question-priority.test.ts` (7) + `tests/dog-brain-question-priority.orchestration.test.ts` (3) → proof (g) targeted question from Brain; complaint-wins; empty=no-op; pending-clarification overrides Brain; severity ordering/dedup; every emitted key ∈ SYMPTOM_MAP.
2. ~~**Test (d)** duplicate-pending follow-up~~ ✅ DONE (run 3) — `tests/dog-brain-followups-route.test.ts` POST block: proof (d) asserts an existing pending row → `deduped:true`, status 200, `insert` never called; plus create-path (201, insert once) + invalid-body-before-DB. 6/6 pass.
3. **Test (c)** vet-record durable persistence — feature done, no test asserts the `vet_record_summaries` row.
4. **Follow-up outcome → Brain memory (feature + test (e)).** `followups/[id]/route.ts` PATCH just flips status; outcome is not read back into Brain context / next-actions. `loadDogBrainContext` does not read `dog_brain_followups` outcomes.
5. **UI (layer G):** Reminders page does not surface Brain follow-ups; History has no Brain timeline; Supplements follow-up linkage weak. (Dashboard/DailyLog/SymptomChecker/Supplements already read signals.)
6. **Signal breadth (layer C):** only 5 of ~11 families (appetite, stool, vomiting, weight, medication). Missing water/urination, breathing/cough, mobility/pain, skin/ear, low-energy/behavior, supplement-improvement. Signal shape also lighter than contract (no `confidence`, `vet_handoff_text`, `suggested_followup_date`). Also: carry **stool direction** (diarrhea vs constipation) on `stool_change` so the Brain question tiebreak surfaces the matching follow-up (checker nit from #5); when adding families, extend `BRAIN_SIGNAL_SYMPTOM_KEYS` in `question-priority.ts` (water→`drinking_more`/`urination_problem`).

## PLAN — next bounded change (Blocker #5), clinically safe

**Scope:** make the Dog Brain *supportively* bias WHICH already-legal missing question is asked first — tiebreak only. Never invent questions, never change the candidate set, never touch urgency/red-flag/pending-clarification selection.

Design:
1. In the route chat path, after Brain memory loads, compute a small `brainPriorityTopics: string[]` from structured `detectDogBrainSignals(logs)` (map signal_type → symptom/question topic key). Pass it into `orchestrateNextQuestion` via a new optional input field.
2. In `getNextQuestionAvoidingRepeat` (or a thin wrapper in the orchestrator), when `needsClarificationQuestionId` is null AND there is no red-flag-mandated question AND there are ≥2 legal missing questions, prefer the missing question whose topic ∈ `brainPriorityTopics`. Otherwise unchanged.
3. Record a telemetry/evidence-chain line "Brain memory influenced next question: <id>" (internal only).

Tests to add (TDD, red→green):
- (g) given a session with 2 missing questions and Brain memory of a recurring skin signal, the skin-topic question is selected first.
- urgency regression: when a red-flag/emergency question is mandated, Brain preference does NOT fire (selection identical to baseline).
- no-Brain fallback: with empty Brain memory, selection is byte-identical to current behavior (guards against regressions in the 233-test baseline).

## Failed attempts
- (none this loop)

## Known pre-existing failure (NOT introduced by this work)
- `tests/symptom-checker.tester-onboarding.test.ts:139` — `fetchMock.toHaveBeenCalledTimes(1)` jsdom/`waitFor` timing flake. Fails in isolation; its import graph (`SymptomCheckerPage`, `request-timeout`, `useAppStore`, types) contains NONE of the 7 files changed this run. Matches project's documented pre-existing fails.

## Tests run this loop
- Baseline (run 1): `dog-brain` 67 pass; `followups|next-question|question-phrasing|triage-engine` 233 pass.
- Run 2 (blocker #5): new `dog-brain-question-priority*` = **10/10 pass**; `dog-brain|followups|next-question|question-phrasing|triage-engine|answer-coercion` = **363/363 pass** (no regression); full gate `clinical|dog-brain|symptom|health-log|followups|vet-record` = **2241 pass / 1 pre-existing-unrelated fail**.
- `npm run typecheck` = exit 0. `eslint` touched files = 0 errors (6 pre-existing route.ts warnings, none new). `npm run build` not run locally (broken on G: → CI/Vercel remote).

## Production / manual verification
- Pending. Browser walkthrough (Daily Log → signal → Symptom Checker uses Brain question → follow-up) deferred until the checker clears #5 and more of the chain lands.

## Next iteration
- DONE this run: Blocker #5 (maker + clinical checker APPROVE-WITH-NITS + thermo APPROVE-WITH-NITS, Promise.all fix) committed facb000 + 53d34ef; proof (d) committed 796e7eb.
- NEXT: gap #3 proof (c) — vet-record durable pet-scoped persistence to `vet_record_summaries` (extend `tests/vet-record-intake-button.test.ts` / `azure-document-intake-route.test.ts`; feature done, assert the row write incl. pet_id+user_id).
- THEN gap #4 — follow-up outcome → Brain memory: `followups/[id]` PATCH only flips status; make the outcome feed back into context/next-actions + test (e). This is a real feature gap, not just a test.
- THEN UI surfacing (Reminders/History) + signal breadth (#6) + the fold fast-follow (#7).
- Browser walkthrough still pending (needs auth session) — defer until the follow-up loop (gap #4) lands so the full chain is demonstrable.
