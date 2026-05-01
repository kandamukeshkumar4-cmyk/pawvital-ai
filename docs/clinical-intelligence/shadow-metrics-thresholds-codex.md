# VET-1423C: Shadow Metrics Threshold Evaluator Scaffold

## Goal

Provide a pure threshold evaluator for `ShadowMetricsSummary` output from the
VET-1420C shadow metrics scaffold.

This scaffold:

- evaluates shadow metrics summaries only
- returns internal pass, warn, or fail metadata
- keeps low-sample and empty-input cases at `warn`
- does not change runtime planner behavior
- does not wire into CI, production, telemetry, or storage

## Files

- `src/lib/clinical-intelligence/shadow-metrics-thresholds.ts`
- `tests/clinical-intelligence/shadow-metrics-thresholds.test.ts`
- `docs/clinical-intelligence/shadow-metrics-thresholds-codex.md`

## Threshold Config

`ShadowMetricsThresholdConfig`

- `maxOldGenericQuestionRate`
- `minPlannedQuestionAvailableRate`
- `minNewScreensEmergencyEarlierRate`
- `minRepeatedQuestionAvoidedRate`
- `maxSafetyNoteRate`
- `minimumComparisonsForStrictGate`

`DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG`

- `maxOldGenericQuestionRate: 0.25`
- `minPlannedQuestionAvailableRate: 0.8`
- `minNewScreensEmergencyEarlierRate: 0.1`
- `minRepeatedQuestionAvoidedRate: 0.75`
- `maxSafetyNoteRate: 0.5`
- `minimumComparisonsForStrictGate: 20`

These defaults are scaffold values only. They are not wired to CI or any
runtime gate in this ticket.

## Evaluator Output

`ShadowMetricsThresholdEvaluation`

- `status: "pass" | "warn" | "fail"`
- `totalComparisons`
- `checks`
- `failedChecks`
- `warningChecks`
- `summaryNotes`

Each check includes:

- `key`
- `status`
- `actualValue`
- `thresholdValue`
- `comparison`
- `note`

## Behavior

`evaluateShadowMetricsThresholds()`

- accepts a `ShadowMetricsSummary`-shaped input only
- derives rates from summary counts instead of mutating source data
- returns `warn` for empty or low-sample summaries
- fails strict checks only when sample size meets
  `minimumComparisonsForStrictGate`
- treats these as strict fail checks when sample size is sufficient:
  - `oldGenericQuestionRate`
  - `plannedQuestionAvailableRate`
- treats these as advisory warn checks:
  - `newScreensEmergencyEarlierRate`
  - `repeatedQuestionAvoidedRate`
  - `safetyNoteRate`

## Safety Guarantees

- No owner text accepted as part of the evaluator contract.
- No owner text emitted in checks or summary notes.
- Returned arrays and check objects are cloned on every call.
- No persistence.
- No telemetry runtime integration.
- No planner wiring.
- No GitHub workflow or CI changes.
- No symptom-chat, triage-engine, clinical-matrix, or symptom-memory changes.

## No-Runtime-Wiring Proof

- `shadow-metrics-thresholds.ts` imports only the shadow metrics summary type.
- No runtime file was edited to consume the evaluator.
- The new module is referenced only by its focused test and this doc in this
  ticket.

## Validation

Run:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-metrics-thresholds.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-metrics.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner.test.ts
npm run build
```
