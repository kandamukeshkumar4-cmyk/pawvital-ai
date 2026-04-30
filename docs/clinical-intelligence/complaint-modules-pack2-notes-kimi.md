# Complaint Module Definition Pack 2 — Kimi 2.6

## Purpose
This document describes the second complaint-specific module definitions for Respiratory, Seizure/Collapse/Neuro, and Urinary so that a future planner can select symptom-specific, emergency-first question sequences.

## Scope
- **Metadata/scaffold only.** These modules are not wired into the live symptom checker.
- No production behavior change.
- No API route changes.
- No UI changes.
- No planner cutover.
- No model/RAG changes.
- No emergency threshold changes.

## Design Principles
1. **Emergency first.** Every module begins with an `emergency_screen` phase that asks red-flag questions before lower-value characterization questions.
2. **Stop conditions.** Each module defines when to escalate to emergency, when enough information is gathered for a report, or when to continue asking questions.
3. **Question-card IDs only.** Modules reference question cards by ID; they do not duplicate raw question strings.
4. **No diagnosis/treatment language.** All text fields (triggers, aliases, safety notes) are checked for forbidden terms during validation.
5. **Urgency guidance + vet handoff only.** These modules guide the conversation toward safe triage and a structured handoff to a veterinarian. They do not diagnose or prescribe.

## Module Overview

### respiratory_distress
- **Triggers:** coughing, wheezing, sneezing, breathing difficulty, trouble breathing, choking, respiratory distress, labored breathing, gasping, etc.
- **Emergency screen:** Checks for breathing difficulty, gum color changes, collapse/weakness, and global emergency signs before asking about toxin exposure or timeline.
- **Key stop conditions:**
  - `respiratory_breathing_difficulty_or_collapse` → emergency
  - `respiratory_breathing_signal` → emergency
  - `respiratory_enough_for_report` → ready_for_report
- **Safety note:** Difficulty breathing or blue gums indicates a life-threatening emergency; escalate immediately.

### seizure_collapse_neuro
- **Triggers:** seizure, convulsion, twitching, shaking, collapse, fainted, unconscious, disoriented, circling, head tilt, neurological, tremor, etc.
- **Emergency screen:** Checks for seizure activity, collapse/weakness, gum color changes, and global emergency signs before asking about seizure duration and clustering.
- **Key stop conditions:**
  - `seizure_prolonged_or_collapse` → emergency
  - `seizure_neuro_signal` → emergency
  - `seizure_enough_for_report` → ready_for_report
- **Safety note:** Prolonged seizures or cluster seizures are a medical emergency; escalate immediately.

### urinary_obstruction
- **Triggers:** can't pee, not peeing, straining to pee, blood in urine, frequent urination, incontinence, urinary obstruction, etc.
- **Emergency screen:** Checks for urinary blockage, gum color changes, collapse/weakness, and global emergency signs before asking about straining and output changes.
- **Key stop conditions:**
  - `urinary_blockage_or_no_urine` → emergency
  - `urinary_obstruction_signal` → emergency
  - `urinary_enough_for_report` → ready_for_report
- **Safety note:** Inability to pass urine can become life-threatening within hours; escalate immediately.

## API

### `getComplaintModules(): ComplaintModule[]`
Returns all defined complaint modules (now six total).

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
npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack2.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-mvp.test.ts
npx eslint src/lib/clinical-intelligence/complaint-modules tests/clinical-intelligence/complaint-modules-pack2.test.ts
npm run build
```

## Integration Notes
- These modules are isolated definitions only.
- The planner will use `findComplaintModulesForText()` to select the appropriate module based on the owner complaint, then execute the `emergency_screen` phase first.
- Stop conditions will be evaluated after each owner response to determine whether to escalate, continue, or hand off.

## Files
- `src/lib/clinical-intelligence/complaint-modules/respiratory.ts`
- `src/lib/clinical-intelligence/complaint-modules/seizure-collapse.ts`
- `src/lib/clinical-intelligence/complaint-modules/urinary.ts`
- `src/lib/clinical-intelligence/complaint-modules/index.ts`
- `tests/clinical-intelligence/complaint-modules-pack2.test.ts`
- `docs/clinical-intelligence/complaint-modules-pack2-notes-kimi.md`
