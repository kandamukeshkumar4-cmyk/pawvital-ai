# VET-1440Q Shadow Planner Fixture Alignment Guard

## Scope

This ticket adds a validation-only guard for the merged shadow planner scenario fixture pack.

Files added:

- `tests/clinical-intelligence/shadow-planner-fixture-alignment-guard.test.ts`
- `docs/clinical-intelligence/shadow-planner-fixture-alignment-guard-qwen.md`

No planner behavior, complaint-module behavior, question-card definitions, runtime routes, UI, infrastructure, environment, or workflow files are changed.

## What The Guard Proves

The guard checks the merged scenario fixture pack against the merged clinical-intelligence scaffold:

- every `expectedComplaintModuleId` exists in the complaint-module registry
- every `acceptableFirstQuestionId` exists in the question-card registry
- `detectShadowComplaintModuleId()` maps each fixture `ownerText` to the expected complaint module
- emergency-preferred fixtures still produce emergency-screen planned questions when emergency candidates are available
- question IDs already marked asked or answered are not selected again
- shadow telemetry remains internal-only with `ownerFacingImpact = "none"`
- fixture text does not contain diagnosis or treatment instructions

## Why This Exists

The scenario pack is intended for old-vs-shadow planner evaluation. This guard prevents drift between three independently merged surfaces:

- owner-language fixture text
- complaint-module adapter detection
- registered question-card IDs used as acceptable first-card candidates

If future planner or registry work changes those surfaces, this guard should fail with the fixture case ID and the mismatched module, question, or red-flag behavior.

## Validation

Run:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-fixture-alignment-guard.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-complaint-integration.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-pack.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/question-card-registry.test.ts
npm run build
```
