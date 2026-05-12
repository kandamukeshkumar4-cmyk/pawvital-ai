# VET-1423 Pending Question Repeat Loop Guardrails

## Scope

This change hardens pending follow-up handling so the same question cannot loop indefinitely once the route has already tried to recover it from direct owner text.

In scope:

- pending question identity
- per-question ask counts
- per-question clarification attempt counts
- pending resolution before next-question selection
- non-critical unknown closure after the second ask
- critical fail-closed escalation after the second ask
- compression protection for the new control-state fields

Out of scope:

- model routing
- Grok
- planner cutover
- emergency sentinel behavior
- diagnosis or treatment wording
- triage-engine or clinical-matrix refactors

## Control State

The protected control state now includes:

- `case_memory.pending_question_id`
- `case_memory.question_asked_counts`
- `case_memory.clarification_attempts`
- existing `answered_questions`
- existing `extracted_answers`
- existing `unresolved_question_ids`
- existing `clarification_reasons`
- existing `last_question_asked`

These fields are preserved across compression and are never allowed to come from compression output.

## Runtime Rules

1. A question becomes the active pending question when it is actually asked.
2. If the owner answers that pending question, it is resolved before the route selects another question.
3. The same `question_id` can be asked at most 2 times.
4. If a third recovery attempt would be required:
   - non-critical question: record `unknown`, clear pending state, and move on
   - critical question: fail closed through `cannot_assess`
5. Answered question ids are pruned out of unresolved control state before next-question sync and before compression merge.

## Files

- `src/lib/symptom-chat/pending-question-state.ts`
  Central helper for pending question id, ask counts, clarification attempts, and answered-state pruning.
- `src/lib/symptom-chat/repeat-loop-guard.ts`
  Encodes the max-2-asks policy and the non-critical vs critical terminal behavior.
- `src/app/api/ai/symptom-chat/route.ts`
  Uses the new helpers during pending-question recovery so loop exits happen before next-question selection.
- `src/lib/symptom-chat/question-response-flow.ts`
  Records ask counts when a question is actually asked, including clarification re-asks.
- `src/lib/symptom-memory.ts`
  Preserves the new fields across compression and filters answered ids from unresolved state sync.

## Regression Coverage

`tests/symptom-chat.repeat-loop.test.ts` locks:

- duration reply resolves and advances
- repeated `not sure` cannot loop forever
- skipped/non-answer reply cannot re-ask more than twice
- critical pending unknown fails closed
- answered pending ids do not come back into unresolved state
- compression preserves pending-question counters
