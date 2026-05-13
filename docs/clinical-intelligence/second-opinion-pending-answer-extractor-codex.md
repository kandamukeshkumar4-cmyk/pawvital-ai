# VET-1425 Second-Opinion Pending Answer Extractor

## Scope

VET-1425 adds a narrow second-opinion extractor for owner replies to the active pending follow-up question. It is only a fallback after structured extraction and deterministic coercion fail.

Out of scope:

- Non-extraction provider changes
- Planner cutover
- Emergency sentinel changes
- Final report changes
- User-visible model reasoning

## Trigger Contract

The extractor can run only when all conditions are true:

- `SECOND_OPINION_EXTRACTOR` is `shadow` or `on`
- structured extraction did not answer the pending question
- deterministic coercion did not answer the pending question
- an active pending question exists
- `clarification_attempts === 1`
- the owner reply is not empty

Default mode is `off`.

## Feature Flag

- `off`: do not call the extractor.
- `shadow`: call the extractor and record internal telemetry, but do not resolve the pending question.
- `on`: call the extractor and use accepted answers to resolve the pending question.

## Accepted Output

The model output must be strict JSON with no markdown, comments, or reasoning:

```json
{
  "answered": true,
  "questionId": "vomit_duration",
  "answerValue": "for about two days",
  "confidence": 0.86,
  "ownerPhrase": "for about two days",
  "needsClarification": false
}
```

Rejected outputs return no answer and preserve the existing clarification path.

## Safety Rules

- The pending question ID must match exactly.
- Confidence must be at least `0.82`.
- `ownerPhrase` must be an exact source span from the owner reply.
- Choice answers must normalize to an allowed choice for that pending question.
- Critical unknown replies remain unresolved when the existing deterministic path requires safe escalation.
- Critical false answers are accepted only with explicit owner denial.
- Replies that introduce a new symptom outside the pending question are rejected.
- Malformed JSON, provider errors, and timeouts return no answer.

## Telemetry

Internal telemetry uses stage `second_opinion` and never appears in the client payload.

Outcomes:

- `second_opinion_used`
- `second_opinion_failed`
- `second_opinion_rejected`

Reasons:

- `no_pending_question`
- `deterministic_resolved`
- `not_first_clarification`
- `malformed_json`
- `low_confidence`
- `unsafe_inference`
- `timeout`
- `provider_error`

## Route Wiring

The route calls the extractor only inside pending-question recovery, after deterministic recovery fails and before the repeat-loop guard records another clarification attempt or terminal fallback. In `on` mode, accepted answers use the same `transitionToAnswered` and `pruneAnsweredQuestionState` path as deterministic pending recovery, keeping `answered_questions`, `extracted_answers`, and pending-question state in sync.
