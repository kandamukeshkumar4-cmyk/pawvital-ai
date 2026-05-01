# VET-1420C: Shadow Metrics Reporter Scaffold

## Goal

Provide a pure summary layer for shadow-planner comparison telemetry.

This scaffold:

- accepts direct comparison results or telemetry-wrapped comparison results
- produces aggregate internal metrics only
- does not persist data
- does not wire into runtime routes
- does not change question selection or owner-facing output

## Files

- `src/lib/clinical-intelligence/shadow-metrics.ts`
- `tests/clinical-intelligence/shadow-metrics.test.ts`
- `docs/clinical-intelligence/shadow-metrics-reporter-codex.md`

## Summary Shape

`ShadowMetricsSummary`

- `totalComparisons`
- `oldGenericQuestionCount`
- `oldGenericQuestionRate`
- `newScreensEmergencyEarlierCount`
- `newScreensEmergencyEarlierRate`
- `repeatedQuestionAvoidedCount`
- `repeatedQuestionAvoidedRate`
- `plannedQuestionAvailableCount`
- `plannedQuestionAvailableRate`
- `selectedBecauseCounts`
- `screenedRedFlagCounts`
- `safetyNoteCounts`

## Behavior

`summarizeShadowMetrics()`

- accepts an array of shadow comparison or telemetry records
- normalizes partial and telemetry-wrapped records safely
- returns zero counts and zero rates for empty input
- never requires owner text or raw message text
- aggregates only IDs, planner reason categories, red-flag IDs, and safety-note strings

`isShadowOutputSafeForInternalDisplay()`

- returns `true` only for internal-only shadow payloads
- returns `false` when owner-facing impact is present or raw owner/message text fields appear
- does not expose any owner-facing behavior by itself

## Safety Guarantees

- No persistence.
- No route calls.
- No planner wiring.
- No symptom-chat changes.
- No triage-engine, clinical-matrix, symptom-memory, emergency sentinel, or complaint-module changes.
- No database writes.
- No runtime telemetry integration.
- No owner-facing text generation or emission.

## Defensive Clone Behavior

- Aggregate count maps are returned as new objects on every call.
- Input arrays are normalized without retaining caller references.
- Mutating a returned summary does not affect future summaries.

## No-Runtime-Wiring Proof

- `shadow-metrics.ts` imports only the existing shadow scaffold modules.
- No existing runtime file was edited.
- The new surface is only referenced by its focused test and this doc in this ticket.

## Validation

Run:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-metrics.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner.test.ts
npm run build
```
