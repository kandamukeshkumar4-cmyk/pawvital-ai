# VET-1417C: Shadow Planner Scaffold and Telemetry Contract

## Goal

Provide a scaffold-only comparison layer that can later evaluate:

- the existing owner-facing question path
- the clinical-intelligence planner path

This scaffold does not change runtime behavior. It builds pure comparison data and a telemetry-shaped wrapper only.

## Files

- `src/lib/clinical-intelligence/shadow-planner.ts`
- `src/lib/clinical-intelligence/shadow-telemetry.ts`
- `tests/clinical-intelligence/shadow-planner.test.ts`
- `docs/clinical-intelligence/shadow-planner-scaffold-codex.md`

## Comparison Result Shape

`ShadowPlannerComparisonResult`

- `existingQuestionId`
- `plannedQuestionId`
- `plannedShortReason`
- `screenedRedFlags`
- `selectedBecause`
- `oldWasGeneric`
- `newScreensEmergencyEarlier`
- `repeatedQuestionAvoided`
- `safetyNotes`

## Pure Function Surface

`shadow-planner.ts`

- `createEmptyShadowPlannerComparisonResult()`
- `buildShadowPlannerComparison()`
- `isShadowPlannerComparisonReady()`

`shadow-telemetry.ts`

- `createEmptyShadowTelemetryRecord()`
- `buildShadowTelemetryRecord()`

All functions are pure:

- no persistence
- no route calls
- no runtime planner execution
- no symptom-chat wiring
- no retrieval, RAG, or URL fetching

## Input Contract

The scaffold accepts existing repo metadata instead of inventing new runtime state:

- existing question id from the current path
- planned question metadata from `planNextClinicalQuestion()`
- optional injected `lookupQuestionCard` from `question-card-registry.ts`
- optional explicit `ClinicalQuestionCard` objects from registry callers
- asked/answered/skipped question ids from existing case-state tracking
- optional planner safety notes supplied by future non-owner-facing integration code

## Safety Behavior

- If the planned question input is incomplete, the scaffold returns a safe non-throwing result with empty planned fields.
- The scaffold never generates owner text, diagnosis text, treatment advice, or new question content.
- The telemetry wrapper marks `ownerFacingImpact: "none"` and only packages the comparison result.
- Returned arrays are cloned so callers cannot mutate future shadow payloads by reference.

## No-Runtime-Wiring Proof

- No existing runtime file was edited.
- No export was added to symptom chat, triage, symptom memory, complaint modules, or emergency sentinel code.
- The new scaffold imports only existing planner and question-card types plus injected lookup metadata.
- Outside the two scaffold files themselves, the only references to `shadow-planner` and `shadow-telemetry` should be this doc and the new focused test until a future explicit integration ticket wires them in.

## Validation

Run:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/next-question-planner.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/question-card-registry.test.ts
npm run build
```
