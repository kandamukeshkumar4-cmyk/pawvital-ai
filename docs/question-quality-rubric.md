# Question Quality Rubric

## Purpose

This rubric defines how `scripts/eval-question-quality.ts` scores the current first follow-up question for each baseline scenario in `tests/fixtures/question-quality-cases.json`.

The harness scores the current deterministic question-selection path only. It does not change runtime behavior.

## Fixture Contract

Each case must include:

- `id`
- `category`
- `complaintFamily`
- `pet`
- `initialMessage`
- `expectedMustScreen`
- `badFirstQuestions`
- `idealQuestionCategories`
- `expectedUrgency`

The baseline fixture may also include helper fields such as `symptomKeys`, `turnFocusSymptoms`, and `recommendedFirstModule` so the harness can run the existing deterministic question path safely.

## 0-3 Scoring Scale

Every scored dimension uses the same coarse meaning:

- `0`: unsafe, irrelevant, or clearly poor for first-question use
- `1`: weak or only partly useful
- `2`: acceptable but not ideal
- `3`: strong first-question behavior for that case

## Scored Dimensions

### 1. Question Specificity

- `0`: generic prompt or unrelated question
- `1`: complaint-linked but broad
- `2`: targeted to the complaint family
- `3`: targeted and discriminative for the immediate decision

### 2. Urgency-Changing Value

- `0`: unlikely to change urgency understanding
- `1`: provides limited urgency signal
- `2`: materially helps urgency classification
- `3`: directly screens a high-signal urgency fork

### 3. Emergency Red-Flag Coverage

- `0`: misses the expected first red-flag screen
- `1`: indirectly touches emergency risk
- `2`: partially covers a must-screen item
- `3`: directly covers a must-screen emergency signal

### 4. Concern-Bucket Discrimination

- `0`: does not separate likely buckets
- `1`: weak discrimination
- `2`: reasonable separation value
- `3`: strong bucket split for the complaint family

### 5. Owner-Answerability

- `0`: unclear, jargon-heavy, or hard for an owner to answer
- `1`: answerable but awkward or interpretive
- `2`: plainly answerable
- `3`: easy, observable, and low-friction

### 6. Repeated-Question Behavior

- `0`: repeats the same question after it was just asked or answered
- `3`: avoids the same-question repeat

This dimension is binary on purpose because repeat safety is a hard failure mode.

### 7. Generic Wording

- `0`: one of the explicitly bad first questions or equivalent generic wording
- `1`: broad wording with limited clinical precision
- `2`: somewhat targeted wording
- `3`: concrete, complaint-specific wording

### 8. Report Usefulness Value

- `0`: low-value answer for vet handoff or report structure
- `1`: some value but poorly structured
- `2`: useful structured handoff detail
- `3`: high-value structured detail for downstream report quality

## Output Metrics

The harness must print:

- total cases
- average question score
- generic question rate
- emergency red-flag miss rate
- first-question emergency-screen rate
- repeated-question rate
- per-category scores
- top 20 generic or weak question patterns
- top 20 missed red-flag patterns
- recommended first complaint modules

## Interpretation

- The baseline is expected to expose weaknesses in emergency screening order, complaint-family specificity, and multi-symptom bucket discrimination.
- Low scores are measurement outputs, not production regressions introduced by VET-1399.
- Recommended modules are prioritization hints for later tickets; they do not imply runtime cutover in this ticket.
