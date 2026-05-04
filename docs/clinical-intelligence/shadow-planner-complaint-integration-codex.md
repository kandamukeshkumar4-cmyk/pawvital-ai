# VET-1437C: Shadow Planner Complaint-Module Integration Adapter

## Goal

Provide a pure shadow-only adapter that:

- detects the active complaint module from owner text
- derives planner-friendly module context from that detected module
- calls the existing next-question planner without wiring into runtime routes
- builds shadow comparison and telemetry records for internal evaluation only

This ticket does not change live owner-facing question selection.

## Files

- `src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts`
- `tests/clinical-intelligence/shadow-planner-complaint-integration.test.ts`
- `docs/clinical-intelligence/shadow-planner-complaint-integration-codex.md`

## Adapter Contract

`buildShadowPlannerComplaintIntegration()`

Input:

- `ownerText`
- `caseState`
- `existingQuestionId`

Output:

- `activeComplaintModuleId`
- `plannerActiveComplaintModule`
- `plannerResult`
- `comparison`
- `telemetry`

## Detection Behavior

The adapter uses the existing complaint-module matcher first.

Required mappings covered in this ticket:

- heat exposure text -> `heatstroke_heat_exposure`
- trauma and bleeding text -> `trauma_bleeding_wound`
- urinary straining text -> `urinary_obstruction`

## Planner Context

The planner currently scores against question-card complaint families rather than
full complaint-module IDs.

The adapter therefore maps detected module IDs into planner-family context:

- `heatstroke_heat_exposure` -> `heat`
- `trauma_bleeding_wound` -> `trauma`
- `urinary_obstruction` -> `urinary`

The full detected complaint-module ID is preserved in shadow telemetry so
internal analysis can compare detection and planning context.

## Safety Guarantees

- Shadow-only utility layer.
- No symptom-chat route wiring.
- No triage-engine changes.
- No clinical-matrix changes.
- No symptom-memory changes.
- No emergency sentinel changes.
- No RAG, UI, env, Vercel, RunPod, or workflow edits.
- No question-card, red-flag, clinical-signal, or complaint-module additions.
- Shadow telemetry remains `ownerFacingImpact = "none"`.

## Behavior Notes

- The adapter calls `planNextClinicalQuestion()` with module-derived planner
  context only.
- If the planner returns a fallback such as `emergency_handoff`, the adapter
  preserves that fallback and does not synthesize a lower-urgency planned
  question.
- Any planned question included in the shadow comparison must resolve through
  the registered question-card registry.
- Asked, answered, and skipped question IDs are passed through to the existing
  planner and to shadow comparison building.

## No-Runtime-Wiring Proof

- The new adapter is not imported by `src/app/api/ai/symptom-chat/route.ts`.
- No live planner call sites were changed.
- No owner-facing UI or route payloads were changed.
- The new code is exercised only by its focused test plus existing planner,
  registry, and complaint-module validation suites.

## Validation

Run:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-complaint-integration.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/next-question-planner.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/question-card-registry.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-heat-trauma-pack.test.ts
npm run build
```
