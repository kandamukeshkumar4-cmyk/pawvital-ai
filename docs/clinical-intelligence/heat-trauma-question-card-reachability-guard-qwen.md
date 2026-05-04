# Heat / Trauma Question-Card Reachability Guard (VET-1435Q)

**Agent:** Qwen 3.6 Plus
**Branch:** `qwen/vet-1435q-heat-trauma-question-card-reachability-guard`
**Date:** 2026-05-04
**Scope:** Validation guard only. No runtime files, complaint modules, red flags, signals, or planner wiring changed.

---

## 1. Purpose

This guard locks the specific reachability regression that surfaced after the heat/trauma question-card landing work:

- Answering `heat_exposure_check` must **not** suppress `brachycephalic_breed_check` when heat risk still matters.
- Answering `wound_characterization_check` must **not** suppress `laceration_depth_check` when wound-depth context still matters.

The guard is intentionally validation-only. It proves the current schema stays reachable through the planner candidate filter without changing planner runtime behavior.

---

## 2. Why a Separate Guard Exists

The original heat/trauma implementation test already carried a few inline reachability assertions, but VET-1436C needed a standalone validation artifact that could be reviewed and landed independently.

This file gives that dedicated contract:

1. Reachability is checked against real `ClinicalCaseState` data.
2. Candidate inclusion is checked through `filterAnsweredOrAskedQuestions(...)`, which is the current suppression path used by the planner.
3. Heat/trauma readiness is re-verified across canonical red flags, clinical signals, and vet-knowledge metadata.

---

## 3. Guard Coverage

### 3.1 Reachability scenarios

The test file builds live case-state scenarios and asserts that these cards remain in the candidate pool:

- `brachycephalic_breed_check` after `heat_exposure_check` is answered in active heat-risk context
- `laceration_depth_check` after `wound_characterization_check` is answered in active trauma context

The guard also confirms the answered predecessor is excluded while the dependent follow-up remains available.

### 3.2 Emergency-screen contract

The guard pins:

- `panting_excess_check` => `phase = emergency_screen`, `urgencyImpact = 3`
- `bleeding_volume_check` => `phase = emergency_screen`, `urgencyImpact = 3`

### 3.3 Canonical red-flag linkage

The guard checks that every `screensRedFlags` entry on the 7 heat/trauma cards still resolves to an existing canonical red flag in `EMERGENCY_RED_FLAG_IDS`.

It also rechecks readiness-level red-flag coverage for:

- `heatstroke_heat_exposure`
- `trauma_bleeding_wound`

### 3.4 Clinical-signal and vet-knowledge readiness

The guard proves there are no missing readiness dependencies by asserting:

- required heat/trauma signals are still detectable from owner-language phrases
- complaint modules still exist
- complaint source-map entries still exist
- coverage-gap entries still exist
- source-gap-plan entries still exist
- heat metadata still maps to `["emergency"]`
- trauma metadata still maps to `["trauma", "emergency", "bleeding"]`
- both modules still remain `partial` source coverage with `emergency_only` owner-visible citation coverage and `high` source-gap priority

---

## 4. Important Implementation Detail

Current planner suppression is driven by answered IDs and `skipIfAnswered`.

This matters because the guard is validating the actual failure mode:

- if a future edit reintroduces `heat_exposure_check` into `brachycephalic_breed_check.skipIfAnswered`, this guard fails
- if a future edit reintroduces `wound_characterization_check` into `laceration_depth_check.skipIfAnswered`, this guard fails

The guard does **not** claim the planner fully reasons over `askIfAny` or `askIfAll`; it only validates the current reachable-candidate contract.

---

## 5. Files Added

- `tests/clinical-intelligence/heat-trauma-question-card-reachability-guard.test.ts`
- `docs/clinical-intelligence/heat-trauma-question-card-reachability-guard-qwen.md`

---

## 6. Constraints Held

- Validation-only guard
- No runtime files touched
- No question-card implementation edits
- No complaint-module edits
- No new red flags
- No new clinical signals
- No planner runtime wiring changes
- No symptom-chat, triage-engine, clinical-matrix, symptom-memory, RAG, UI, env, Vercel, RunPod, or workflow changes

---

## 7. Validation Commands

Required validation for this ticket:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/heat-trauma-question-card-reachability-guard.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/heat-trauma-question-cards.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/heat-trauma-schema-readiness-guard.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/redflag-signal-gap-contract.test.ts
npm run build
```

This ticket adds only the new standalone guard and its note document.
