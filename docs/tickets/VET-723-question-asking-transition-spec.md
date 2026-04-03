# VET-723: Question Asking Transition Spec

**Date:** 2026-04-03
**Agent:** techlead
**Branch:** `copilot/qwenvet-722-unknown-option`
**Type:** `spec` | Risk: `medium` | Rollback: `safe`
**Implements:** VET-716 sequence, Wave 3 Phase 2
**Depends on:** VET-720 (answer recording wire spec), VET-721 (answer recording implementation)

**Sequencing note:** This spec supersedes the provisional VET-716 numbering for follow-on behavior tickets. The next confirmation and needs-clarification implementation tickets must be renumbered in a later sequence-sync pass before work begins.

---

## Summary

Define the exact wiring for replacing the direct `session.last_question_asked = nextQuestionId` write in
`route.ts` with a `transitionToAsked()` wrapper that follows the same module pattern established by VET-720's
`transitionToAnswered()`.

This spec covers only the `asked` state transition. It does not include confirmation state, clarification
state, or any behavior beyond marking a question as asked.

---

## Pre-conditions

All must be true before the first line of implementation:

| Pre-condition | Source |
|---|---|
| VET-717 types landed | `src/lib/conversation-state/types.ts` exists with `QuestionState` |
| VET-718 observer landed | `observeTransition()` and `getStateSnapshot()` callable from `route.ts` |
| VET-719 helpers landed | `src/lib/conversation-state/transitions.ts` exists |
| VET-720 spec reviewed | `docs/tickets/VET-720-answer-recording-wire-spec.md` reviewed |
| VET-721 implementation landed | `transitionToAnswered()` is in production and stable |
| VET-721 regression tests passing | No conversation regressions after VET-721 |

**Implementation may begin only after VET-721 is stable in the target environment.**

---

## Module Ownership

### What owns runtime wiring

**File:** `src/lib/conversation-state/question-asking.ts` (new)

This is a runtime wiring module. It may import:
- `observeTransition()` and `getStateSnapshot()` from `./observer`
- `QuestionState` types from `./types`
- Nothing from `triage-engine.ts` directly (the `last_question_asked` write happens via session mutation
  passed in as a parameter)

It must **not** be imported into `transitions.ts`. The module boundary established by VET-720 holds here:

```
transitions.ts        → pure helpers only, no runtime imports
observer.ts           → read-only observation, no state writes
question-asking.ts    → runtime wiring layer (new, this ticket)
answer-recording.ts   → runtime wiring layer (landed in VET-720)
route.ts              → orchestration, calls wiring layers
```

### What remains pure helper logic

**File:** `src/lib/conversation-state/transitions.ts`

The `transitionToAsked()` pure function (defined in VET-719) lives here. It must:
- Accept a question ID and a state snapshot
- Return new state with the question marked as `asked`
- **Not** write to `session.last_question_asked` directly
- **Not** call `observeTransition()`
- **Not** import `observer.ts`

The pure helper validates the transition rule: a question in `confirmed` state must not transition back to
`asked`. All other transitions to `asked` are valid.

---

## File Changes

### 1. `src/lib/conversation-state/question-asking.ts` — add `transitionToAsked()`

Create a dedicated wiring module. This module is intentionally **not** part of the pure helper layer.

```typescript
import { getStateSnapshot, observeTransition } from "./observer";
import type { TriageSession } from "@/lib/triage-engine";

export interface TransitionToAskedInput {
  session: TriageSession;
  questionId: string;
  reason: "next_question_selected";
}

export function transitionToAsked(input: TransitionToAskedInput): TriageSession {
  const { session, questionId, reason } = input;
  const beforeState = getStateSnapshot(session);
  let updated = { ...session, last_question_asked: questionId };
  updated = observeTransition(updated, {
    before: beforeState,
    after: getStateSnapshot(updated),
    questionId,
    reason,
    to: "asked",
  });
  console.log(
    `[StateMachine] state_transition: asked | question=${questionId} | reason=${reason}`
  );
  return updated;
}
```

### 2. `src/lib/conversation-state/index.ts` — export `transitionToAsked`

Add to the existing re-export block:

```typescript
export { transitionToAsked } from "./question-asking";
export type { TransitionToAskedInput } from "./question-asking";
```

### 3. `src/app/api/ai/symptom-chat/route.ts` — replace the call site

There is exactly one write site for `last_question_asked` that requires replacement.

#### Call Site — Question Selection (~line 978)

Current code:

```typescript
// Track which question we're asking so we can detect unanswered loops
const beforeState = getStateSnapshot(session);
session.last_question_asked = nextQuestionId;
session = observeTransition(session, {
  before: beforeState,
  after: getStateSnapshot(session),
  questionId: nextQuestionId,
  reason: "next_question_selected",
  to: "asked",
});
```

Replacement:

```typescript
// Track which question we're asking so we can detect unanswered loops
session = transitionToAsked({
  session,
  questionId: nextQuestionId,
  reason: "next_question_selected",
});
```

Add `transitionToAsked` to the import from `@/lib/conversation-state`. The `getStateSnapshot` and
`observeTransition` imports may remain if they are still used elsewhere in `route.ts`; otherwise remove
them from the import only if no other call sites remain.

---

## Exact Call Site Location

The write to replace is at the point in `route.ts` where `nextQuestionId` has been selected and the question
is about to be phrased. Based on the current source (line ~978–989):

```typescript
session.last_question_asked = nextQuestionId;
```

This is the only line in `route.ts` that writes directly to `session.last_question_asked`.

**Do not** replace read-only accesses to `session.last_question_asked` elsewhere in `route.ts`. There are
multiple read sites (lines ~351, ~659, ~898, ~1073, ~1131, ~2943, ~3652–3655, ~4202, ~4360). None of these
are write sites. None change.

---

## Internal-Only Telemetry Expectations

### Telemetry Marker

- **Format:** `[StateMachine] state_transition: asked | question=<id> | reason=<reason>`
- **Channel:** `console.log` (server-side log aggregation only)
- **Placement:** After `observeTransition()` returns, inside `transitionToAsked()`
- **User-facing:** No — this never appears in response JSON
- **Compression-safe:** Yes — emitted at write time, stored nowhere in session state

### Observer Transition Record

The `observeTransition()` call inside `transitionToAsked()` emits a transition record identical in structure
to the one emitted by `transitionToAnswered()`. Fields:

| Field | Value |
|---|---|
| `before` | State snapshot before `last_question_asked` write |
| `after` | State snapshot after `last_question_asked` write |
| `questionId` | The question ID being asked |
| `reason` | Always `"next_question_selected"` for this call site |
| `to` | Always `"asked"` |

No new telemetry fields. No additions to the session object. No additions to the response JSON.

---

## What Does NOT Change

| Item | Status |
|---|---|
| `last_question_asked` field name | Unchanged — same field, same semantics |
| `answered_questions` | Not touched |
| `extracted_answers` | Not touched |
| `case_memory.unresolved_question_ids` | Not touched |
| `red_flags_triggered` | Not touched |
| Question phrasing logic (STEP 5) | Unchanged — runs after `transitionToAsked()` exactly as before |
| Repeat-suppression logic (~line 898) | Unchanged — reads `last_question_asked` as before |
| Pending question recovery (~line 659) | Unchanged — reads `last_question_asked` as before |
| Session compression | No new fields; compression boundary unchanged |
| Client response payload | No new keys |
| `checkRedFlags()` | Not involved in this ticket |

---

## Backward Compatibility Contract

`transitionToAsked()` is a refactor wrapper. It executes the exact same sequence that existed at the call
site before this ticket:

1. `getStateSnapshot(session)` — capture before-state
2. `session.last_question_asked = nextQuestionId` — write the asked question ID
3. `observeTransition(...)` — emit sidecar observation

The only addition is the `console.log` telemetry marker, which is internal-only and has no effect on
session state, response payloads, or downstream logic.

---

## Protected State (Must Not Change)

| Field | Protected By | Verified By |
|---|---|---|
| `last_question_asked` | `transitionToAsked()` wrapper | grep confirms single write site |
| `answered_questions` | `transitionToAnswered()` (VET-720) | unchanged |
| `extracted_answers` | `recordAnswer()` in triage-engine | unchanged |
| `red_flags_triggered` | `checkRedFlags()` inside `recordAnswer()` | unchanged path |

---

## Rollback

```bash
# Option A — full revert
git revert <VET-723-impl-commit-sha>

# Option B — restore only route.ts, keep question-asking.ts as dead code
git checkout <pre-VET-723-sha> -- src/app/api/ai/symptom-chat/route.ts
```

Either option fully restores prior behavior. No database changes. No migration required.

---

## Verification

Run these after implementation, before marking ready for review:

```bash
# 1. TypeScript must compile clean
npx tsc --noEmit

# 2. Confirm single write site for last_question_asked in route.ts
#    (only the transitionToAsked call should remain; direct assignment must be gone)
grep -n "last_question_asked\s*=" src/app/api/ai/symptom-chat/route.ts

# 3. Confirm transitionToAsked is called at the selection site
grep -n "transitionToAsked" src/app/api/ai/symptom-chat/route.ts

# 4. VET-714 regression tests pass
npx jest tests/symptom-chat.route.test.ts --silent

# 5. No new fields in session snapshot
#    Run a test conversation, inspect session JSON — no new top-level keys
```

Manual verification:
- Start a test conversation, observe that the first follow-up question is asked correctly
- `[StateMachine] state_transition: asked` appears in server logs before question phrasing
- The question does not repeat if the answer is provided on the next turn (pending recovery still works)
- `last_question_asked` is still set before STEP 5 phrasing begins

Consistency check:
- `git diff --stat` shows only `src/lib/conversation-state/question-asking.ts` (new),
  `src/lib/conversation-state/index.ts` (modified), and
  `src/app/api/ai/symptom-chat/route.ts` (modified, one call site replaced)
- Cross-reference with VET-716: VET-721 scope in that document describes exactly this scope
- Cross-reference with VET-720: Module pattern for `question-asking.ts` matches `answer-recording.ts`

---

## Explicit Non-Goals

The following are explicitly out of scope for the implementation of this spec. Any PR that includes
these items should be rejected:

1. **Confirmation state** — `transitionToConfirmed()` is VET-722, not this ticket.
2. **Needs-clarification state** — `transitionToNeedsClarification()` is a separate ticket, not this ticket.
3. **Schema changes** — No changes to `clinical-matrix.ts`.
4. **New session fields** — No additions to `TriageSession` or `SessionData`.
5. **Phrasing behavior changes** — The question phrasing logic (STEP 5) is not modified.
6. **Repeat-question suppression changes** — The repeat-suppression guard is not modified.
7. **Unknown option handling** — That is VET-722 scope.
8. **Pure helper additions** — `transitions.ts` is not modified by this ticket. The pure `transitionToAsked()`
   helper already landed in VET-719.
9. **Test additions** — Test coverage for `question-asking.ts` is welcome but not required for this ticket.
   Do not block on test additions.

---

## Safety Assessment Summary

| Question | Answer |
|---|---|
| Safe before VET-721 lands? | No — implement only after VET-721 is stable and regression-tested |
| Blast radius if broken? | Question asking fails; visible conversation stall; no silent clinical corruption |
| Rollback cost? | Single `git revert` or route.ts checkout; no DB involved |
| Compression boundary risk? | None — no new session fields, telemetry marker is log-only |
| Module boundary risk? | None — `question-asking.ts` follows the same pattern as `answer-recording.ts` |

---

## What Comes Next

After this spec is implemented and stable:

- write a sequence-sync update that assigns fresh ticket numbers for:
  - confirmation-state wiring after acknowledgment phrasing
  - needs-clarification wiring for unresolved ambiguous answers
- keep those follow-ons separate from this asked-state ticket

Those follow-ons depend on the stable `asked → answered_this_turn` pipeline that VET-720 + VET-721 + this
ticket establish.

---

## Files Changed

- `src/lib/conversation-state/question-asking.ts` — new wiring module (implementation only)
- `src/lib/conversation-state/index.ts` — add export (implementation only)
- `src/app/api/ai/symptom-chat/route.ts` — replace one call site (implementation only)
- `docs/tickets/VET-723-question-asking-transition-spec.md` — new file (this document)
