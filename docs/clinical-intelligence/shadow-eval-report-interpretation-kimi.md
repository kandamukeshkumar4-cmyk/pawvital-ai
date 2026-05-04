# VET-1446K Shadow Eval Report Interpretation Pack

## Scope

This package adds documentation and test coverage only:

- `docs/clinical-intelligence/shadow-eval-report-interpretation-kimi.md`
- `tests/clinical-intelligence/shadow-eval-report-interpretation-pack.test.ts`

It does not change eval runtime code, planner logic, adapter logic, question cards, complaint modules, red flags, clinical signals, symptom-chat, triage-engine, clinical-matrix, symptom-memory, RAG, UI, env, infrastructure, or workflow files.

This pack does not provide diagnosis or treatment guidance.

## Purpose

The shadow planner scenario eval already reports comparison metrics and per-case failures. This interpretation pack tells reviewers how to classify those failures before they decide whether to patch fixtures, patch the adapter, or request question-card work in a later ticket.

The intent is report-only triage for future reviewers:

- separate safety-critical misses from quality-only misses
- separate true regressions from acceptable ambiguity on confusing multi-symptom cases
- separate code problems from fixture_error problems
- keep runtime cutover blocked until the report-only evaluation surface is stable

## Failure Classes

- `safety_critical`
  Use this class when `missingRequiredRedFlags` is non-empty, when `redFlagScreenCoverageRate` drops on a must-not-miss path, or when complaint-module drift suppresses required screening for the case.

- `emergency_screen_gap`
  Use this class when the failed-case reason says `Emergency-screen alignment expectation was not met` or when `emergencyScreenAlignmentRate` falls because a case marked `shouldScreenEmergencyEarlier` no longer reaches an emergency-screen question.

- `repeated_question_regression`
  Use this class when the failed-case reason says `Repeated-question avoidance expectation was not met` or when the planner repeats the generic baseline instead of moving forward.

- `acceptable_ambiguity`
  Use this class when a confusing multi-symptom case picks a safe registry-backed alternative that preserves complaint-module detection, emergency behavior, required red-flag coverage, and repeat avoidance, but the fixture acceptable-question set is too narrow.

- `quality_only`
  Use this class when `selectedBecause` or `genericQuestionAvoidanceRate` misses do not reduce emergency screening, complaint-module detection, or required red-flag coverage.

- `fixture_error`
  Use this class when the pack itself is structurally wrong: `scenario/outcome mismatch`, `unregistered` IDs, `duplicate case IDs`, or stale expectation text that no longer matches the merged registry-backed surface.

## Metric-To-Action Map

| Eval metric | Reviewer action |
| --- | --- |
| `complaintModuleMatchRate` | Review adapter routing first. Patch fixtures only if the expected module is factually stale after checking the merged registry and case wording. |
| `acceptableQuestionRate` | Check whether the planner chose a safe registry-backed alternative and resolve fixture ambiguity before patching code. |
| `emergencyScreenAlignmentRate` | Treat misses as `emergency_screen_gap` and block cutover until resolved. |
| `repeatedQuestionAvoidanceRate` | Treat misses as `repeated_question_regression` and inspect asked/answered filtering before broadening fixtures. |
| `genericQuestionAvoidanceRate` | Treat misses as quality-only unless they also drop emergency screening or required red-flag coverage. |
| `redFlagScreenCoverageRate` | Treat misses as safety-critical unless the fixture itself names impossible flags. |
| `failedCases` | Read each failed case reason, then classify it as one of the six failure classes before opening implementation work. |

## Case-Level Reading Rules

- A complaint-module mismatch on an emergency or must-not-miss row is not a neutral quality miss. Review it as `safety_critical` first, then decide whether the adapter or the fixture is wrong.
- A planned question outside the acceptable set is not automatically a code regression. If the chosen question is a registry-backed alternative that keeps emergency and red-flag behavior intact, review it as `acceptable_ambiguity` before asking for code changes.
- A `selectedBecause` miss is usually `quality_only`. Reclassify it upward only when the wrong reason hides an emergency-screen path that the fixture explicitly expects.
- A fallback result instead of a planned question is not acceptable for cutover review. If it appears on a must-not-miss row, treat it as `safety_critical`; otherwise treat it as at least `quality_only` until the cause is understood.

## Patch Boundaries

### Patch fixtures when

- the planner output is still safe, registry-backed, and clinically aligned, but the acceptable-question set is too narrow
- the case belongs in `acceptable_ambiguity` and the pack should explicitly allow the alternative
- the expected module, note text, or required red-flag list is factually stale relative to the merged fixture or registry
- the failure is a true `fixture_error`, including `scenario/outcome mismatch`, `unregistered` IDs, or impossible expected flags

### Patch the adapter when

- complaint-module detection is wrong even though the fixture wording still points at the current module
- the module-to-planner-family bridge is wrong and sends a case away from the correct question family
- safe complaint-specific or emergency cards already exist, but the adapter path still fails to surface them
- repeat avoidance breaks because the comparison inputs or the adapter-side filtering assumptions are wrong

### Patch question cards when

- the adapter finds the right complaint family but only low-value or generic cards are reachable
- required red flags are missing from otherwise appropriate cards, causing coverage loss even when routing is correct
- the merged registry lacks a complaint-specific emergency, characterize, or discriminate card needed for the fixture to remain both safe and specific

## Cutover Rule

Runtime cutover remains blocked until the report-only shadow eval is stable.

For reviewer decisions, "stable" means:

- no open `safety_critical` failures
- no open `emergency_screen_gap` failures
- no unresolved question over whether a miss is real code drift or `fixture_error`
- any remaining failures are clearly labeled as `quality_only` or `acceptable_ambiguity`

This interpretation pack is not a cutover approval by itself. It exists so future report reviews can classify failures consistently before runtime wiring is considered.
