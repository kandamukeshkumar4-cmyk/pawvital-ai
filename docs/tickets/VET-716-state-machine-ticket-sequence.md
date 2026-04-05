# VET-716: Conversation State Machine - Backend Ticket Sequence

## Status
- `complete`

## Operational Note

- `VET-722` and `VET-723` were later used for docs/spec tickets outside this original provisional numbering plan.
- Before implementation reaches confirmation-state or needs-clarification-state work, this sequence must be refreshed so the remaining behavior tickets get new unambiguous IDs.
- `VET-726` (this sequence-sync ticket) corrects that drift and defines VET-727 through VET-729 as the next three unambiguous behavior tickets. See the Revised Execution Sequence section below.

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

## Landed Through Asked-State

The following tickets are already landed and define the baseline this refreshed sequence must respect:

| Ticket | Status | Notes |
|--------|--------|-------|
| VET-717 | landed | Conversation-state type surface is in place. |
| VET-718 | landed | Read-only observer and snapshot wiring are live. |
| VET-719 | landed | Pure transition helpers and isolated tests are live. |
| VET-720 | landed | Answer-recording wire spec defines the runtime-wrapper module boundary. |
| VET-721 | landed | `transitionToAnswered()` owns answer-recording writes. |
| VET-722 | landed | Explicit-unknown clinical policy proposal is reserved and must not be renumbered. |
| VET-723 | landed | Asked-state spec defines the `question-asking.ts` runtime-wrapper pattern. |
| VET-724 | landed | `transitionToAsked()` owns the asked-state route write. |
| VET-725 | landed | Replay regressions lock the asked-state behavior before the next behavior layer starts. |

---

## Revised Execution Sequence (Post-Asked-State)

### VET-727: Confirmation-State Transition Wiring
**Type:** `behavior-change` | **Risk:** `medium` | **Rollback:** `safe`

**Goal:** Make `confirmed` a durable, explicit state that is written only after the assistant successfully prepares the acknowledgment-plus-next-question turn.

**Exact Scope:**
- Add protected confirmation-state storage for question IDs that have moved from `answered_this_turn` to `confirmed`, and thread that field through the current compression-protection path.
- Add a runtime wiring module such as `src/lib/conversation-state/confirmation-state.ts` with `transitionToConfirmed()` following the same wrapper pattern established by `answer-recording.ts` and `question-asking.ts`.
- Update the conversation-state snapshot and transition-note logic so `answered_this_turn` and `confirmed` no longer collapse onto the same inferred state once `last_question_asked` advances.
- In `route.ts`, capture the question IDs answered during the current turn before `transitionToAsked()` overwrites the pending-question anchor.
- After `phraseQuestion()` succeeds and immediately before the `NextResponse.json({ type: "question", ... })` return, call `transitionToConfirmed()` for the captured question IDs.
- Keep the current question-selection order, asked-state write timing, and phrasing prompt content intact.

**Exact Non-Goals:**
- Do not change extraction, deterministic coercion, pending recovery, or next-question selection.
- Do not widen the explicit-unknown behavior proposed in landed VET-722.
- Do not add needs-clarification reason storage or touch `unresolved_question_ids` semantics.
- Do not redesign question wording, acknowledgment copy, sidecar dashboards, or debug endpoints.

**Rollback Boundary:**
- Revert the confirmation-state field, wrapper module, snapshot updates, and the single route confirmation block.
- Leave `transitionToAnswered()` and `transitionToAsked()` in place exactly as landed.

**Sequencing Gate:**
- VET-728 must land before any needs-clarification implementation starts.

---

### VET-728: Confirmation-State Regression Pack
**Type:** `test-coverage` | **Risk:** `none` | **Rollback:** `trivial`

**Goal:** Lock the confirmation boundary before clarification-state work starts.

**Exact Scope:**
- Add route-level replay coverage proving a question is not marked confirmed until the assistant successfully prepares the acknowledgment-plus-next-question response.
- Add protected-state assertions proving the new confirmation field survives compression and remains internal-only.
- Add negative coverage proving asked-state writes do not auto-confirm the next unanswered question and error paths do not append confirmation state.
- Keep the tests anchored to the shipped `transitionToAnswered()` and `transitionToAsked()` wrappers rather than mocking internal state changes.

**Exact Non-Goals:**
- Do not change runtime control flow except for any minimal test scaffolding already required by the suite.
- Do not add needs-clarification assertions yet.
- Do not broaden the asked-state regression pack beyond confirmation semantics.
- Do not add telemetry dashboards, deploy work, or schema/policy edits.

**Rollback Boundary:**
- Delete the new confirmation-state regression coverage only.

**Sequencing Gate:**
- VET-729 may start only after this pack passes on the landed VET-727 branch tip.

---

### VET-729: Needs-Clarification Transition Wiring
**Type:** `behavior-change` | **Risk:** `medium` | **Rollback:** `safe`

**Goal:** Make clarification state explicit when extraction plus deterministic pending recovery fail, while preserving `case_memory.unresolved_question_ids` as the authoritative open-question list.

**Exact Scope:**
- Add a runtime wiring module such as `src/lib/conversation-state/needs-clarification.ts` with `transitionToNeedsClarification()`.
- Record clarification reason metadata keyed by question ID without introducing a second unresolved-question list.
- Wire the pending-recovery failure branch in `route.ts` (the `resolvePendingQuestionAnswer(...) === null` path) through the new wrapper before pending-recovery telemetry is recorded.
- Extend the conversation-state snapshot and transition-note generation so clarification transitions reflect both the existing unresolved-question authority and the new reason code.
- Preserve current question selection and follow-up flow; this ticket records explicit state, not a new clarification strategy.

**Exact Non-Goals:**
- Do not widen extractor coercions or implement any of the open schema decisions from VET-722.
- Do not redesign the confirmation boundary or alter confirmation-state storage.
- Do not let compression own clarification state or rewrite `unresolved_question_ids`.
- Do not touch asked-state or answer-recording wrappers except for the observer/snapshot threading needed to represent the new state.

**Rollback Boundary:**
- Revert the clarification wrapper, reason metadata field, snapshot updates, and the pending-recovery failure call site.
- Keep `unresolved_question_ids` driving open-question selection exactly as before.

---

## Renumbering Map

- The original provisional confirmation-state placeholder is now `VET-727`.
- `VET-728` is the mandatory confirmation regression gate inserted between confirmation-state and clarification-state work.
- The original provisional needs-clarification placeholder is now `VET-729`.
- Landed docs-only tickets `VET-722` and `VET-723` are permanent and must never be reused.

---

## Execution Order

1. `VET-727` — confirmation-state transition wiring
2. `VET-728` — confirmation-state regression pack
3. `VET-729` — needs-clarification transition wiring

---
## Verification

- Manual consistency check against landed VET-720, VET-723, VET-724, and VET-725: PASS
- No runtime changes in this ticket. This is planning/docs only.

---

## Notes

- `VET-727` through `VET-729` are now the only valid next sequence numbers after the landed asked-state wave.
- `VET-722` and `VET-723` remain reserved for the landed docs-only policy/spec tickets and must not be reused.
