# VET-716: Conversation State Machine - Backend Ticket Sequence

## Status
- `complete`

## Owner
- `techlead`

## Goal
Split the explicit conversation state-machine work into small, reviewable backend tickets with clear checkpoints and rollback-safe boundaries.

## Context

The world-class plan (section: "Remaining Follow-On Work") identifies three areas:

1. **Explicit conversation state machine**: Replace ad-hoc pending-question flow with explicit states (`asked -> answered_this_turn -> confirmed -> needs_clarification`)
2. **Expand deterministic test coverage**: More edge-case tests for "I don't know", "maybe", "for about two days", multi-sentence responses
3. **Production telemetry analysis**: Track extraction success rate, pending-question rescues, repeated-question attempts

## Design Decision

**Do NOT create one giant refactor ticket.** Instead, decompose into small, sequential tickets with:
- One behavior change per ticket
- Clear rollback boundary (each ticket is independently safe)
- Review checkpoint after each ticket
- No runtime changes until implementation phase

---

## Ticket Sequence (Backend Wave)

### VET-717: Define State Machine Types and Interfaces
**Type:** `types-only` | **Risk:** `none` | **Rollback:** `trivial`

**Goal:** Add TypeScript types for the explicit state machine without changing runtime behavior.

**Scope:**
- Create `src/lib/conversation-state/types.ts` with:
  - `ConversationState` enum: `idle | asking | answered_unconfirmed | confirmed | needs_clarification | escalation`
  - `QuestionState` enum: `pending | asked | answered_this_turn | confirmed | needs_clarification | skipped`
  - `StateTransition` interface: `{ from: QuestionState; to: QuestionState; reason: string; timestamp: number }`
  - `ConversationStateMachine` interface: current state + transition history
- Export types from `src/lib/conversation-state/index.ts`
- No changes to `route.ts` or runtime logic

**Files:**
- `src/lib/conversation-state/types.ts` (new)
- `src/lib/conversation-state/index.ts` (new)

**Review Checkpoint:** Verify types compile, no runtime changes, no imports into route.ts yet.

**Rollback:** Delete two files.

---

### VET-718: Add State Machine Observer (Read-Only)
**Type:** `observability` | **Risk:** `none` | **Rollback:** `trivial`

**Goal:** Wire up read-only state observation for shadow telemetry.

**Scope:**
- Create `src/lib/conversation-state/observer.ts`:
  - `observeTransition()` function that logs state transitions to internal telemetry
  - `getStateSnapshot()` for debugging
- Wire observer into `route.ts` but do NOT change state logic yet
- Observer only reads existing `last_question_asked`, `answered_questions`, etc. and maps to state enum
- Telemetry stays internal (filtered from compression, user payloads)

**Files:**
- `src/lib/conversation-state/observer.ts` (new)
- `src/app/api/ai/symptom-chat/route.ts` (add observer import, call observeTransition() after each answer recording)

**Review Checkpoint:** Verify telemetry logs state transitions, no behavior changes, no state writes.

**Rollback:** Remove observer calls from route.ts, delete observer.ts.

---

### VET-719: Extract State Transition Logic (Pure Functions)
**Type:** `refactor` | **Risk:** `low` | **Rollback:** `safe`

**Goal:** Extract pure functions for state transitions without wiring them.

**Scope:**
- Create `src/lib/conversation-state/transitions.ts`:
  - `transitionToAsked(questionId, state)` - marks question as asked
  - `transitionToAnswered(questionId, answer, state)` - marks as answered_this_turn
  - `transitionToConfirmed(questionId, state)` - marks as confirmed
  - `transitionToNeedsClarification(questionId, reason, state)` - flags for follow-up
  - `transitionToSkipped(questionId, reason, state)` - for non-applicable questions
  - Each function returns new state (immutable), validates transition rules
- Add transition validation: cannot go from `confirmed` back to `asked`, etc.
- Unit tests for each transition function

**Files:**
- `src/lib/conversation-state/transitions.ts` (new)
- `tests/conversation-state/transitions.test.ts` (new)

**Review Checkpoint:** Verify pure functions have 100% test coverage, no imports into route.ts yet.

**Rollback:** Delete two files.

---

### VET-720: Wire State Machine for Answer Recording (Phase 1)
**Type:** `behavior-change` | **Risk:** `medium` | **Rollback:** `safe`

**Goal:** Replace direct `answered_questions` writes with state machine transitions for answer recording.

**Scope:**
- In `route.ts`, when recording an answer:
  - Call `transitionToAnswered()` instead of directly mutating `answered_questions`
  - Keep existing `recordAnswer()` function but have it call the transition function
  - State machine writes to `answered_questions` (backward compatible)
- Add telemetry marker for `state_transition: answered`
- Preserve all existing fallback logic (deterministic coercion, pending recovery)

**Files:**
- `src/app/api/ai/symptom-chat/route.ts` (modify answer recording to use transitions)
- `src/lib/conversation-state/transitions.ts` (add state write logic)

**Review Checkpoint:** Verify answer recording works identically, telemetry shows transitions, compression boundary tests pass.

**Rollback:** Revert route.ts to use direct writes, keep transition functions for future use.

---

### VET-721: Wire State Machine for Question Asking (Phase 2)
**Type:** `behavior-change` | **Risk:** `medium` | **Rollback:** `safe`

**Goal:** Replace direct `last_question_asked` writes with state machine transitions.

**Scope:**
- In `route.ts`, when selecting next question:
  - Call `transitionToAsked(questionId, state)` before phrasing
  - Set `last_question_asked` as before (backward compatible)
  - Add transition telemetry
- Ensure `asked` state is recorded before phrasing is sent to user

**Files:**
- `src/app/api/ai/symptom-chat/route.ts` (modify question selection to use transitions)

**Review Checkpoint:** Verify question flow unchanged, telemetry shows `asked` transitions, repeat-suppression tests pass.

**Rollback:** Revert route.ts to direct writes.

---

### VET-722: Add Confirmation State (Phase 3)
**Type:** `behavior-change` | **Risk:** `medium` | **Rollback:** `safe`

**Goal:** Introduce explicit `confirmed` state when acknowledgment is phrased.

**Scope:**
- After acknowledgment phrasing completes, call `transitionToConfirmed(questionId, state)`
- Add `confirmed_questions` array to session state (parallel to `answered_questions`)
- Compression preserves `confirmed_questions` as protected state
- Acknowledgment phrasing can reference `confirmed_questions` length (already done in VET-707C)

**Files:**
- `src/app/api/ai/symptom-chat/route.ts` (add confirmation transition)
- `src/lib/conversation-state/transitions.ts` (add confirmation logic)
- `src/lib/types.ts` (add `confirmed_questions?: string[]` to SessionData)

**Review Checkpoint:** Verify confirmed state is recorded, compression tests pass, acknowledgment phrasing unchanged.

**Rollback:** Revert route.ts, remove confirmed_questions from session.

---

### VET-723: Add Needs Clarification State (Phase 4)
**Type:** `behavior-change` | **Risk:** `medium` | **Rollback:** `safe`

**Goal:** Flag questions that need follow-up when answers are ambiguous.

**Scope:**
- When extraction fails AND pending-recovery cannot coerce a deterministic answer:
  - Call `transitionToNeedsClarification(questionId, reason, state)`
  - Add `needs_clarification_questions: Record<string, string>` to session (questionId -> reason)
  - Continue asking follow-up questions as before
- Add telemetry for `needs_clarification` transitions with reason codes

**Files:**
- `src/app/api/ai/symptom-chat/route.ts` (add needs-clarification logic)
- `src/lib/conversation-state/transitions.ts` (add needs-clarification transition)
- `src/lib/types.ts` (add `needs_clarification_questions?: Record<string, string>`)

**Review Checkpoint:** Verify ambiguous answers are flagged, telemetry shows reason codes, question flow unchanged.

**Rollback:** Revert route.ts, remove needs_clarification state.

---

### VET-724: Add State Machine Diagnostics Endpoint
**Type:** `observability` | **Risk:** `none` | **Rollback:** `trivial`

**Goal:** Add debug endpoint for state machine inspection.

**Scope:**
- Create `GET /api/debug/conversation-state` (dev-only):
  - Returns current state machine snapshot
  - Shows transition history
  - Shows protected state values
- Guard with `process.env.NODE_ENV === 'development'`

**Files:**
- `src/app/api/debug/conversation-state/route.ts` (new)

**Review Checkpoint:** Verify endpoint returns state in dev, 404 in production.

**Rollback:** Delete route file.

---

### VET-725: Expand Edge-Case Test Coverage
**Type:** `test-coverage` | **Risk:** `none` | **Rollback:** `trivial`

**Goal:** Add deterministic tests for edge-case replies identified in world-class plan.

**Scope:**
- Add tests to `tests/conversation-state/edge-cases.test.ts`:
  - "I don't know" -> unknown coercion
  - "maybe" -> unknown coercion
  - "for about two days" -> duration extraction
  - "he hit his leg on the fence" -> trauma history recovery
  - "yes, there's swelling" -> affirmative swelling
  - Multi-sentence: "no not really, but he's been limping" -> partial answer + new symptom
- Each test asserts:
  - State transitions correctly
  - Protected state preserved
  - No repeat question after answer

**Files:**
- `tests/conversation-state/edge-cases.test.ts` (new)

**Review Checkpoint:** Verify 100% test pass, no runtime changes.

**Rollback:** Delete test file.

---

### VET-726: Add Production Telemetry Dashboard Queries
**Type:** `observability` | **Risk:** `none` | **Rollback:** `trivial`

**Goal:** Define Supabase queries for state machine telemetry analysis.

**Scope:**
- Create `scripts/telemetry/state-machine-queries.sql`:
  - Extraction success rate by question type
  - Pending-question rescue rate
  - Repeat-question attempt rate
  - State transition distribution
  - Needs-clarification reason code breakdown
- Document how to run queries in development

**Files:**
- `scripts/telemetry/state-machine-queries.sql` (new)
- `docs/telemetry/state-machine-metrics.md` (new)

**Review Checkpoint:** Verify queries run against dev database, documentation clear.

**Rollback:** Delete two files.

---

## Review Checkpoints Summary

| Ticket | Type | Review Focus | Rollback Safety |
|--------|------|--------------|-----------------|
| VET-717 | types-only | Types compile, no runtime | Delete 2 files |
| VET-718 | observability | Telemetry logs, no behavior | Remove observer calls |
| VET-719 | refactor | Pure functions, 100% test coverage | Delete 2 files |
| VET-720 | behavior | Answer recording unchanged | Revert route.ts |
| VET-721 | behavior | Question flow unchanged | Revert route.ts |
| VET-722 | behavior | Confirmed state recorded | Revert route.ts |
| VET-723 | behavior | Needs-clarification flagged | Revert route.ts |
| VET-724 | observability | Debug endpoint works in dev | Delete route |
| VET-725 | test-coverage | Tests pass, no runtime | Delete test file |
| VET-726 | observability | Queries run, docs clear | Delete 2 files |

---

## Rollback-Safe Boundaries

Each ticket is rollback-safe because:

1. **Types-only tickets (VET-717)**: No runtime impact, just delete files
2. **Observability tickets (VET-718, VET-724, VET-726)**: Read-only, no behavior change
3. **Refactor tickets (VET-719)**: Pure functions with tests, not wired in yet
4. **Behavior tickets (VET-720, VET-721, VET-722, VET-723)**:
   - Each modifies `route.ts` in isolated sections
   - Backward compatible: state machine writes to same fields as before
   - Revert is just `git checkout` on route.ts + state files

---

## Execution Order

**Wave 1: Foundation (Safe to parallelize)**
- VET-717 (types)
- VET-719 (pure functions)
- VET-725 (edge-case tests)

**Wave 2: Observability (Safe to parallelize)**
- VET-718 (observer)
- VET-724 (debug endpoint)
- VET-726 (telemetry queries)

**Wave 3: Behavior Changes (Sequential, one per day)**
- VET-720 (answer recording)
- VET-721 (question asking)
- VET-722 (confirmation)
- VET-723 (needs clarification)

---

## Files Changed (Summary)

**New Files:**
- `src/lib/conversation-state/types.ts`
- `src/lib/conversation-state/index.ts`
- `src/lib/conversation-state/observer.ts`
- `src/lib/conversation-state/transitions.ts`
- `tests/conversation-state/transitions.test.ts`
- `tests/conversation-state/edge-cases.test.ts`
- `src/app/api/debug/conversation-state/route.ts`
- `scripts/telemetry/state-machine-queries.sql`
- `docs/telemetry/state-machine-metrics.md`

**Modified Files:**
- `src/app/api/ai/symptom-chat/route.ts` (wiring, ~10-15 targeted changes)
- `src/lib/types.ts` (add session state fields)

---

## Verification

No runtime changes in this ticket. This is planning/docs only.

Verification for future implementation tickets will be defined in each ticket's brief.

---

## Notes

- This sequence uses the shipped VET-705A through VET-715 context
- No giant refactor ticket - each ticket is small and reviewable
- Rollback is always safe - either delete files or revert route.ts
- Telemetry stays internal (filtered from compression per VET-706)
- Protected state rules from VET-704/VET-705A are preserved
- Acknowledgment phrasing from VET-707C is leveraged in VET-722
