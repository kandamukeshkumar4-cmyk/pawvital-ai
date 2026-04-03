# VET-720: Answer Recording State-Machine Wire Spec

**Status:** `ready-for-implementation` — BLOCKED on VET-714 and VET-715 review sign-off
**Type:** `behavior-change` | Risk: `medium` | Rollback: `safe`
**Branch:** `qwen/vet-720-first-state-machine-behavior-spec-v1`
**Implements:** VET-716 sequence, Wave 3 Phase 1

---

## Summary

Replace the direct `recordAnswer()` call pattern at three sites in `route.ts` with a single `transitionToAnswered()` wrapper function. The wrapper delegates to `recordAnswer()` unchanged and adds a telemetry marker. No behavioral change. No session schema additions.

---

## Pre-conditions

All must be true before the first line of implementation:

| Pre-condition | Source |
|---------------|--------|
| VET-717 types landed | `src/lib/conversation-state/types.ts` exists |
| VET-718 observer landed | `observeTransition()` and `getStateSnapshot()` imported in route.ts |
| VET-719 helpers landed | `src/lib/conversation-state/transitions.ts` exists with pure helpers |
| VET-714 review sign-off | Edge-case regression tests confirmed passing |
| VET-715 review sign-off | Schema audit findings reviewed, no blocking gap found |

**Do not begin implementation until the VET-714 and VET-715 sign-offs are recorded in the Obsidian brief.**

---

## File Changes

### 1. `src/lib/conversation-state/transitions.ts` — add `transitionToAnswered()`

Add the following function at the end of the file. Import `recordAnswer` from triage-engine and `getStateSnapshot` + `observeTransition` from `./observer`.

```typescript
import { recordAnswer } from "@/lib/triage-engine";
import type { TriageSession } from "@/lib/triage-engine";
import { getStateSnapshot, observeTransition } from "./observer";

export interface TransitionToAnsweredInput {
  session: TriageSession;
  questionId: string;
  value: string | boolean | number;
  reason: "turn_answer_recorded" | "pending_question_recovered" | "location_answer_propagated";
}

export function transitionToAnswered(input: TransitionToAnsweredInput): TriageSession {
  const { session, questionId, value, reason } = input;
  const beforeState = getStateSnapshot(session);
  let updated = recordAnswer(session, questionId, value);
  updated = observeTransition(updated, {
    before: beforeState,
    after: getStateSnapshot(updated),
    questionId,
    reason,
    to: "answered_this_turn",
  });
  console.log(
    `[StateMachine] state_transition: answered | question=${questionId} | reason=${reason}`
  );
  return updated;
}
```

### 2. `src/lib/conversation-state/index.ts` — export `transitionToAnswered`

Add to the existing re-export block:

```typescript
export { transitionToAnswered } from "./transitions";
export type { TransitionToAnsweredInput } from "./transitions";
```

### 3. `src/app/api/ai/symptom-chat/route.ts` — replace three call sites

Add `transitionToAnswered` to the import from `@/lib/conversation-state`. Remove the three `recordAnswer()` direct calls. The surrounding logic (guards, telemetry, logging) is unchanged.

#### Call Site 1 — Turn Answer Loop (~line 641)

Before:
```typescript
const beforeState = getStateSnapshot(session);
session = recordAnswer(session, key, value);
session = observeTransition(session, {
  before: beforeState,
  after: getStateSnapshot(session),
  questionId: key,
  reason: "turn_answer_recorded",
  to: "answered_this_turn",
});
```

After:
```typescript
session = transitionToAnswered({
  session,
  questionId: key,
  value,
  reason: "turn_answer_recorded",
});
```

#### Call Site 2 — Pending Question Recovery (~line 678)

Before:
```typescript
const beforeState = getStateSnapshot(session);
session = recordAnswer(session, pendingQ, pendingAnswer.value);
session = observeTransition(session, {
  before: beforeState,
  after: getStateSnapshot(session),
  questionId: pendingQ,
  reason: "pending_question_recovered",
  to: "answered_this_turn",
});
```

After:
```typescript
session = transitionToAnswered({
  session,
  questionId: pendingQ,
  value: pendingAnswer.value,
  reason: "pending_question_recovered",
});
```

#### Call Site 3 — Location Answer Propagation (~line 4288)

Before:
```typescript
const beforeState = getStateSnapshot(updated);
updated = recordAnswer(updated, targetQuestionId, sourceValue);
updated = observeTransition(updated, {
  before: beforeState,
  after: getStateSnapshot(updated),
  questionId: targetQuestionId,
  reason: "location_answer_propagated",
  to: "answered_this_turn",
});
```

After:
```typescript
updated = transitionToAnswered({
  session: updated,
  questionId: targetQuestionId,
  value: sourceValue,
  reason: "location_answer_propagated",
});
```

---

## What Does NOT Change

- `recordAnswer()` in `triage-engine.ts` — untouched
- Session state shape — no new fields
- `answered_questions` write semantics — identical
- `extracted_answers` write semantics — identical
- `checkRedFlags()` invocation — still called inside `recordAnswer()` as before
- `observeTransition()` behavior — same call, same inputs, now inside the wrapper
- Compression boundary — no new session fields, no change to what is protected
- Client response payload — no new keys

---

## Backward Compatibility Contract

`transitionToAnswered()` is a refactor wrapper, not a new behavior. It executes the exact same sequence that existed at each call site:

1. `getStateSnapshot(session)` — capture before-state
2. `recordAnswer(session, questionId, value)` — write to `answered_questions` and `extracted_answers`, trigger `checkRedFlags()`
3. `observeTransition(...)` — emit sidecar observation

The only addition is the `console.log` telemetry marker, which is internal-only and has no effect on session state.

---

## Telemetry Marker

- **Format:** `[StateMachine] state_transition: answered | question=<id> | reason=<reason>`
- **Channel:** `console.log` (server-side log aggregation only)
- **Placement:** After `observeTransition()` returns, inside `transitionToAnswered()`
- **User-facing:** No — this never appears in response JSON
- **Compression-safe:** Yes — emitted at write time, stored nowhere in session state

---

## Protected State (Must Not Change)

| Field | Protected By | Verified By |
|-------|-------------|-------------|
| `answered_questions` | `recordAnswer()` write logic | grep for direct mutation outside `recordAnswer` |
| `extracted_answers` | `recordAnswer()` write logic | same |
| `last_question_asked` | Not touched in this ticket | grep confirms no write |
| `case_memory.unresolved_question_ids` | Not touched in this ticket | grep confirms no write |
| `red_flags_triggered` | `checkRedFlags()` inside `recordAnswer()` | unchanged path |

---

## Verification Steps

Run these after implementation, before marking ready for review:

```bash
# 1. TypeScript must compile clean
npx tsc --noEmit

# 2. No direct recordAnswer call remains in route.ts
#    (only the import line from triage-engine should remain)
grep -n "recordAnswer(" src/app/api/ai/symptom-chat/route.ts

# 3. transitionToAnswered is used at all three replaced sites
grep -n "transitionToAnswered" src/app/api/ai/symptom-chat/route.ts

# 4. VET-714 regression tests pass
npx jest tests/conversation-state/ --passWithNoTests

# 5. No new fields in session snapshot (diff session object shape before/after)
#    Run a test conversation and inspect the session JSON returned — no new top-level keys
```

Manual verification:
- Start a test conversation, answer a follow-up question, confirm `[StateMachine] state_transition: answered` appears in server logs
- Confirm the question does not repeat on the next turn (pending recovery still works)
- Confirm `which_leg` answer propagates to `wound_location` in a wound scenario (location propagation still works)

---

## Rollback

```bash
# Option A — full revert
git revert <VET-720-commit-sha>

# Option B — restore only route.ts, keep transitions.ts additions as dead code
git checkout <pre-VET-720-sha> -- src/app/api/ai/symptom-chat/route.ts
```

Either option fully restores prior behavior. No database changes. No migration required.

---

## Safety Assessment Summary

| Question | Answer |
|----------|--------|
| Safe before VET-714 lands? | No — VET-714 defines the behavioral baseline; implement after sign-off |
| Safe before VET-715 lands? | No — schema gaps could affect what `recordAnswer()` receives; implement after sign-off |
| Blast radius if broken? | Answer recording fails; visible conversation degradation; no silent clinical corruption |
| Rollback cost? | Single `git revert`; no DB involved |
| Compression boundary risk? | None — no new session fields, telemetry marker is log-only |

---

## What Comes Next

After VET-720 lands and is stable:

- **VET-721** — Wire state machine for question asking (`transitionToAsked()` replaces `last_question_asked` write)
- **VET-722** — Add confirmation state after acknowledgment phrasing
- **VET-723** — Add needs-clarification state for unresolved ambiguous answers
