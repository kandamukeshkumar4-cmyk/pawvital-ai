# Shadow Planner Scenario Eval Harness (VET-1442C)

## Scope

This ticket adds evaluation-only artifacts:

- `src/lib/clinical-intelligence/shadow-planner-scenario-eval.ts`
- `scripts/eval-shadow-planner-scenarios.ts`
- `tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts`
- `docs/clinical-intelligence/shadow-planner-scenario-eval-codex.md`

It does not change runtime wiring, live question selection, question cards, complaint modules, red flags, clinical signals, route logic, UI, infrastructure, env, or workflow files.

## Purpose

The harness runs the merged shadow planner complaint adapter against the merged scenario and expected-outcome fixture packs, then reports quality metrics for the shadow-only planning path.

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

## Metrics

The structured summary reports:

- `totalCases`
- `complaintModuleMatchRate`
- `acceptableQuestionRate`
- `emergencyScreenAlignmentRate`
- `repeatedQuestionAvoidanceRate`
- `genericQuestionAvoidanceRate`
- `redFlagScreenCoverageRate`
- `failedCases`

Metric denominators are intentionally explicit inside the summary object:

- module match and acceptable-question rates use all cases
- emergency-screen alignment uses only cases where the fixture expects earlier emergency screening
- repeated-question avoidance uses only cases where repeat avoidance is expected
- generic-question avoidance uses only cases where the fixture expects the shadow planner to beat a generic baseline
- red-flag coverage uses required-flag matches over total required flags

## Failure Model

The harness does not fail because quality rates are low.

It only throws on structural invalidity, such as:

- duplicate or missing case IDs
- scenario/outcome mismatch
- unregistered baseline comparison question
- adapter output pointing at an unregistered question card
- telemetry `ownerFacingImpact` drifting away from `"none"`

Everything else is reported as metrics plus `failedCases`.

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
- each required metric as count/denominator plus percentage
- a compact failed-case list with expected and actual structured fields

Tests consume the structured JSON returned by `evaluateShadowPlannerScenarios(...)` directly.

## Safety Notes

- Shadow-only evaluation
- No runtime files touched
- No LLM or RAG calls
- No raw owner text in reported failure payloads
- Emergency handoff behavior remains preserved when the supplied case state is already `emergency`
