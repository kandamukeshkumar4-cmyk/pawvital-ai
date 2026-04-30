# Complaint Module Definition Pack 3 — Kimi 2.6

## Purpose
This document describes the third complaint-specific module definitions for PawVital clinical intelligence.

## Scope
- **Metadata/scaffold only.** These modules are not wired into the live symptom checker.
- No production behavior change.
- No API route changes.
- No UI changes.
- No planner cutover.
- No model/RAG changes.
- No emergency threshold changes.

## Candidate Assessment

Before implementing, the following sources of truth were inspected:
- `src/lib/clinical-intelligence/question-card-registry.ts` — all registered question-card IDs
- `src/lib/clinical-intelligence/emergency-red-flags.ts` — all canonical red-flag IDs
- `src/lib/clinical-intelligence/clinical-signal-detector.ts` — all emitted signal IDs

### eye / vision / discharge
**Skipped.** No eye-specific question cards, red flags, or clinical signals exist in the current registry. Implementing this module would require inventing fake IDs, which violates the hard requirement to use only real IDs.

### ear / head tilt / balance
**Skipped.** No ear-specific question cards, red flags, or clinical signals exist in the current registry. Head tilt and circling are covered by the neuro signal `possible_neuro_emergency`, but there are no ear-specific question cards to form a meaningful ear/balance module. Implementing would require fake IDs.

### toxin / poisoning / exposure
**Implemented.** The registry contains:
- Question card: `toxin_exposure_check`
- Canonical red flags: `toxin_confirmed`, `rat_poison_confirmed`, `toxin_with_symptoms`, `collapse`, `vomit_blood`
- Signal: `toxin_exposure`
- Reusable cross-domain cards: `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`, `bloat_retching_abdomen_check`, `gi_vomiting_frequency`, `gi_blood_check`

## Design Principles
1. **Emergency first.** Every module begins with an `emergency_screen` phase that asks red-flag questions before lower-value characterization questions.
2. **Stop conditions.** Each module defines when to escalate to emergency, when enough information is gathered for a report, or when to continue asking questions.
3. **Question-card IDs only.** Modules reference question cards by ID; they do not duplicate raw question strings.
4. **No diagnosis/treatment language.** All text fields (triggers, aliases, safety notes) are checked for forbidden terms during validation.
5. **Urgency guidance + vet handoff only.** These modules guide the conversation toward safe triage and a structured handoff to a veterinarian. They do not diagnose or prescribe.

## Module Overview

### toxin_poisoning_exposure
- **Triggers:** ate chocolate, ate grapes, ate raisins, ate onions, ate garlic, xylitol, rat poison, rodenticide, antifreeze, mushrooms, cleaning products, chemicals, pills, medication, poison, toxic, toxin, swallowed something, got into, ingested
- **Emergency screen:** Checks for toxin exposure, global emergency signs, gum color changes, collapse/weakness, and bloat/retching before asking about GI symptoms.
- **Key stop conditions:**
  - `toxin_confirmed_or_symptoms` → emergency
  - `toxin_exposure_signal` → emergency
  - `toxin_enough_for_report` → ready_for_report
- **Safety note:** Known or suspected toxin exposure requires immediate veterinary attention regardless of current signs.

## API

### `getComplaintModules(): ComplaintModule[]`
Returns all defined complaint modules (now seven total).

### `getComplaintModuleById(id: string): ComplaintModule | undefined`
Returns a single module by ID.

### `findComplaintModulesForText(text: string): ComplaintModule[]`
Lexical matching against triggers and aliases. Returns all modules that match the input text.

### `getEmergencyScreenQuestionIdsForModule(moduleId: string): string[] | undefined`
Returns the emergency-screen question IDs for a given module.

### `validateComplaintModules(): Promise<ValidationResult>`
Async validation that checks:
- Unique module IDs
- Triggers and aliases present
- At least one emergency screen question per module
- Every referenced question ID exists in the question-card registry (if available)
- Stop conditions present
- Report fields present
- No diagnosis/treatment language
- Valid phase IDs
- Positive `maxQuestionsFromPhase`

## Validation
Run:
```bash
npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack3.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack2.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-mvp.test.ts
npx eslint src/lib/clinical-intelligence/complaint-modules tests/clinical-intelligence/complaint-modules-pack3.test.ts
npm run build
```

## Integration Notes
- These modules are isolated definitions only.
- The planner will use `findComplaintModulesForText()` to select the appropriate module based on the owner complaint, then execute the `emergency_screen` phase first.
- Stop conditions will be evaluated after each owner response to determine whether to escalate, continue, or hand off.

## Files
- `src/lib/clinical-intelligence/complaint-modules/toxin-exposure.ts`
- `src/lib/clinical-intelligence/complaint-modules/index.ts`
- `tests/clinical-intelligence/complaint-modules-pack3.test.ts`
- `docs/clinical-intelligence/complaint-modules-pack3-notes-kimi.md`
