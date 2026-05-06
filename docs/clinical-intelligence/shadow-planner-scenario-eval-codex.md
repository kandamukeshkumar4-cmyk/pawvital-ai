# Shadow Planner Scenario Eval Harness (VET-1442C)

## Scope

This ticket adds evaluation-only artifacts:

- `src/lib/clinical-intelligence/shadow-planner-scenario-eval.ts`
- `scripts/eval-shadow-planner-scenarios.ts`
- `tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts`
- `docs/clinical-intelligence/shadow-planner-scenario-eval-codex.md`

It does not change runtime wiring, live question selection, question cards, complaint modules, red flags, clinical signals, route logic, UI, infrastructure, env, or workflow files.

## Purpose

The harness runs the merged shadow planner complaint adapter against the merged base scenario pack, expected-outcome pack, edge-case scenario pack, and expected-outcome normalization pack, then reports quality metrics for the shadow-only planning path.

The harness is designed to answer:

- Did the adapter detect the expected complaint module?
- Did the planner choose an acceptable registered question card?
- Did emergency-first scenarios stay aligned to emergency-screen behavior?
- Did the comparison avoid repeating the generic baseline question?
- Did the shadow plan beat a generic fallback when the fixture expects it to?
- How much required red-flag screening coverage was preserved?

It reports these metrics only. It does not enforce production thresholds and it does not mutate live behavior.

## Inputs

The CLI loads:

- `tests/fixtures/clinical-intelligence/shadow-planner-scenarios.json`
- `tests/fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json`
- `tests/fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json`
- `tests/fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json`

The evaluator calls:

- `src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts`

## Evaluation Model

Each case uses:

- owner text from the scenario fixture
- expected comparison targets from the outcome fixture
- a fresh first-turn `ClinicalCaseState`
- detected owner-language signals copied into the case state for context only
- a generic existing-question baseline of `emergency_global_screen` for comparison metrics

The harness does not invent red-flag positives, does not inject LLM output, and does not expose chain-of-thought.

## Raw And Normalized Metrics

The structured summary now reports the raw harness output and a normalization-aware view side by side.

The top-level repeated-question and generic-question metrics are now setup-aware:

- `repeatedQuestionAvoidanceRate` uses only cases with real `repeatedQuestionSetup`
- `genericQuestionAvoidanceRate` uses only rows whose normalization entry keeps generic-question scoring in scope
- `repeatedQuestionEligibleCases` and `genericQuestionEligibleCases` make those denominators explicit

The legacy raw and normalized metric sets remain in `rawMetrics` and `normalizedMetrics`.

Raw metrics preserve the original report-only scoring against the exact expected-outcome fixture.

Normalized metrics layer in the normalization pack so the report can:

- accept documented complaint-module alternatives on ambiguous wording
- treat `alignment_only_ok` rows as question-aligned when emergency-first behavior is preserved
- exclude `exclude_for_now` rows from normalized generic-question scoring
- exclude `partial` rows from normalized full red-flag coverage scoring

This keeps the safety surface visible without pretending every emergency-first global screen is a direct quality miss.

## Metrics

The structured summary reports:

- `totalCases`
- `baseCaseCount`
- `edgeCaseCount`
- `repeatedQuestionEligibleCases`
- `genericQuestionEligibleCases`
- `rawMetrics`
- `normalizedMetrics`
- `rawFailedCaseCount`
- `normalizedFailedCaseCount`
- `complaintModuleMatchRate`
- `acceptableQuestionRate`
- `emergencyScreenAlignmentRate`
- `repeatedQuestionAvoidanceRate`
- `genericQuestionAvoidanceRate`
- `redFlagScreenCoverageRate`
- `failedCases`

Metric denominators are intentionally explicit inside the summary object:

- base and edge case counts are reported separately while `totalCases` covers the combined run
- top-level repeated-question avoidance uses only cases with real `repeatedQuestionSetup`
- top-level generic-question avoidance uses only cases whose normalization row keeps generic-question scoring in scope
- raw module match and acceptable-question rates use all cases
- normalized complaint-module match still uses all cases, but normalized base rows can accept documented alternate module IDs
- emergency-screen alignment uses only cases where the fixture expects earlier emergency screening
- repeated-question avoidance uses all base cases plus edge cases that include `repeatedQuestionSetup`
- raw generic-question avoidance uses cases where the fixture expects the shadow planner to beat a generic baseline
- normalized generic-question avoidance removes rows marked `exclude_for_now`
- raw red-flag coverage uses required-flag matches over total required flags
- normalized red-flag coverage removes rows marked `partial` from the full-coverage denominator

## Failure Model

The harness does not fail because quality rates are low.

It only throws on structural invalidity, such as:

- duplicate or missing case IDs
- scenario/outcome mismatch
- unregistered baseline comparison question
- adapter output pointing at an unregistered question card
- telemetry `ownerFacingImpact` drifting away from `"none"`

Everything else is reported as metrics plus `failedCases`.

Each failed-case entry now includes:

- `reason` as the legacy raw failure string
- `rawReason`
- `normalizedReason`
- `repeatedQuestionMetricStatus`
- `genericQuestionMetricStatus`

Metric-status fields distinguish:

- `no_metric_setup`
- `actual_repeated_question_failure`
- `actual_generic_question_failure`

This preserves CLI/JSON compatibility while making it obvious which misses remain after normalization.

## CLI

Primary command:

```bash
node scripts/eval-shadow-planner-scenarios.ts
```

Optional JSON summary:

```bash
node scripts/eval-shadow-planner-scenarios.ts --json
```

The CLI is a thin wrapper. It writes a temporary runner under the repo, compiles that runner with the local TypeScript CLI into a throwaway CommonJS output directory, prints either the readable summary or JSON summary, and then removes the temporary files.

## Output Shape

The CLI prints a readable summary with:

- total case count
- base-case count
- edge-case count
- setup-aware repeated/generic eligible-case counts
- setup-aware repeated/generic rate lines
- raw metric lines as count/denominator plus percentage
- normalized metric lines as count/denominator plus percentage
- raw and normalized failed-case counts
- a compact failed-case list with expected and actual structured fields, raw/normalized reasons, and setup-status labels for repeated/generic metrics

Tests consume the structured JSON returned by `evaluateShadowPlannerScenarios(...)` directly.

## Safety Notes

- Shadow-only evaluation
- No runtime files touched
- No LLM or RAG calls
- No raw owner text in reported failure payloads
- Emergency handoff behavior remains preserved when the supplied case state is already `emergency`
- Normalization is report-only and never changes planner runtime behavior
