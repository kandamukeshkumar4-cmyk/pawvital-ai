# Complaint Module Definition Pack (MVP) — Kimi 2.6

## Purpose
This document describes the first complaint-specific module definitions for Skin, GI, and Limping so that a future planner can select symptom-specific, emergency-first question sequences.

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

### skin_itching_allergy
- **Triggers:** itching, scratching, rash, allergy, hives, bumps, hair loss, hot spot, etc.
- **Emergency screen:** Checks for facial swelling, breathing difficulty, collapse/weakness, and gum color changes before asking about itch location.
- **Key stop conditions:**
  - `skin_facial_swelling_or_breathing` → emergency
  - `skin_repeated_vomiting_with_itching` → emergency
  - `skin_enough_for_report` → ready_for_report
- **Safety note:** Facial swelling with itching may indicate anaphylaxis; escalate immediately.

### gi_vomiting_diarrhea
- **Triggers:** vomiting, diarrhea, loose stool, not eating, retching, gagging, etc.
- **Emergency screen:** Checks for blood, water retention, bloat/retching, toxin exposure, collapse/weakness, and gum color.
- **Key stop conditions:**
  - `gi_blood_or_bloat` → emergency
  - `gi_toxin_or_foreign_body` → emergency
  - `gi_severe_dehydration` → emergency
  - `gi_enough_for_report` → ready_for_report
- **Safety note:** Bloody vomit or diarrhea requires emergency escalation.

### limping_mobility_pain
- **Triggers:** limping, lameness, not walking, favoring leg, stiffness, dragging leg, etc.
- **Emergency screen:** Checks weight-bearing status, trauma onset, collapse/weakness, and gum color before asking about limb location.
- **Key stop conditions:**
  - `limping_non_weight_bearing_or_trauma` → emergency
  - `limping_severe_pain` → emergency
  - `limping_fracture_suspicion` → emergency
  - `limping_enough_for_report` → ready_for_report
- **Safety note:** Complete non-weight-bearing after trauma suggests fracture; escalate immediately.

## API

### `getComplaintModules(): ComplaintModule[]`
Returns all defined complaint modules.

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
npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-mvp.test.ts
npm run lint
npm run build
```

## Integration Notes
- Codex GPT-5.4 will review and integrate these modules after the VET-1399 baseline is complete.
- The planner will use `findComplaintModulesForText()` to select the appropriate module based on the owner complaint, then execute the `emergency_screen` phase first.
- Stop conditions will be evaluated after each owner response to determine whether to escalate, continue, or hand off.

## Files
- `src/lib/clinical-intelligence/complaint-modules/types.ts`
- `src/lib/clinical-intelligence/complaint-modules/index.ts`
- `src/lib/clinical-intelligence/complaint-modules/skin.ts`
- `src/lib/clinical-intelligence/complaint-modules/gi.ts`
- `src/lib/clinical-intelligence/complaint-modules/limping.ts`
- `tests/clinical-intelligence/complaint-modules-mvp.test.ts`
- `docs/clinical-intelligence/complaint-modules-mvp-notes-kimi.md`
