# Case State Engine — Qwen Implementation Notes

> **Ticket:** VET-1401Q
> **Date:** 2026-04-28
> **Author:** Qwen 3.6 Plus
> **Scope:** Pure TypeScript utilities + tests. Not wired into production flow.

---

## Files

| File | Purpose |
|------|---------|
| `src/lib/clinical-intelligence/case-state.ts` | Core `ClinicalCaseState` type, `createInitialClinicalCaseState()`, serialization helpers |
| `src/lib/clinical-intelligence/case-state-update.ts` | Pure state update functions (ask, answer, skip, red flag, signal, helpers) |
| `src/lib/clinical-intelligence/red-flag-status.ts` | Red flag query and resolution helpers |
| `tests/clinical-intelligence/case-state.test.ts` | Unit tests for all exported functions |

---

## Core Type: `ClinicalCaseState`

Tracks the full state of a dog symptom-check case:

- **`species`**: Always `"dog"` (validated on deserialization)
- **`activeComplaintModule`**: Which complaint family is active (e.g. `"gi"`, `"skin"`)
- **`explicitAnswers`**: Owner-provided facts keyed by answer field name
- **`redFlagStatus`**: Per-flag status with provenance (`source`, `evidenceText`, `updatedAtTurn`)
- **`clinicalSignals`**: AI-detected signals that do NOT become explicit answers
- **`concernBuckets`**: Scored differential concerns with evidence
- **`missingCriticalSlots`**: Slots still needed for safe triage
- **`askedQuestionIds` / `answeredQuestionIds` / `skippedQuestionIds`**: Question history
- **`currentUrgency`**: `"unknown" | "routine" | "same_day" | "urgent" | "emergency"`
- **`urgencyTrajectory`**: `"unknown" | "stable" | "worsening" | "improving"`
- **`nextQuestionReason`**: Why the next question is being asked

---

## Pure Functions

### Initialization

- `createInitialClinicalCaseState(module?)` — returns a clean state for a new dog case

### Question Tracking

- `recordAskedQuestion(state, questionId)` — idempotent
- `recordAnsweredQuestion(state, questionId, answerKey, value)` — writes to `explicitAnswers`, removes from `missingCriticalSlots`
- `recordSkippedQuestion(state, questionId)` — idempotent
- `hasQuestionBeenAskedOrAnswered(state, questionId)` — repeat-prevention guard

### Red Flags

- `updateRedFlagStatus(state, redFlagId, { status, source, evidenceText?, turn })` — positive flags are immutable (cannot be downgraded); positive emergency flags escalate `currentUrgency` to `"emergency"`
- `getRedFlagStatus(state, redFlagId)` — returns entry or undefined
- `isRedFlagPositive / isRedFlagNegative / isRedFlagUnknown` — boolean guards
- `getPositiveRedFlags / getUnknownRedFlags` — list helpers
- `hasAnyPositiveEmergencyRedFlags(state)` — true if any positive emergency flag exists
- `resolveUnknownRedFlags(state, ids, "negative" | "not_sure", turn)` — bulk resolution
- `computeRedFlagSummary(state)` — count totals by status

### Clinical Signals

- `addClinicalSignal(state, signal)` — adds or updates by `signal.id`; does NOT write to `explicitAnswers`

### Critical Slots

- `getUnknownCriticalSlots(state, requiredSlotIds)` — returns slots that are not answered, skipped, or resolved via red flag

### Serialization

- `serializeClinicalCaseState(state)` — `JSON.stringify`
- `deserializeClinicalCaseState(serialized)` — validates `species === "dog"`, restores all arrays/objects with safe defaults

---

## Rules Enforced

1. **Explicit owner answers become facts** — stored in `explicitAnswers` and tracked in `answeredQuestionIds`
2. **Clinical signals remain signals** — stored in `clinicalSignals` array; never written to `explicitAnswers`
3. **Unknown red flags stay unknown** — until explicitly asked or safely resolved
4. **Positive emergency red flags escalate urgency** — any positive flag from the canonical emergency list sets `currentUrgency` to `"emergency"`
5. **Negative answers do not override positive red flags** — once `"positive"`, a flag cannot be downgraded
6. **Asked/answered detection prevents repeats** — `hasQuestionBeenAskedOrAnswered()` guards against re-asking
7. **Serialization preserves all state** — round-trip through JSON without data loss

---

## Urgency Escalation Logic

Red flags mapped to emergency urgency (canonical list from `docs/emergency-redflag-map.md`):

- All 10 emergency families: respiratory, collapse, seizure, GDV, toxin, bleeding, heatstroke, anaphylaxis, urinary blockage, dystocia
- Any positive flag from this list sets `currentUrgency = "emergency"`
- Urgency trajectory is computed by comparing previous vs current urgency level, and remains `"unknown"` until urgency is actually known

---

## NOT Done (Out of Scope)

- No wiring into live symptom-check flow
- No API route changes
- No UI changes
- No planner cutover
- No clinical threshold changes
- No model/RAG changes

---

## Next Steps (Separate Ticket Required)

1. Wire `ClinicalCaseState` into the symptom-check session loop
2. Connect red flag inference to the clinical matrix
3. Integrate concern bucket scoring
4. Add persistence layer (session store or Supabase)
5. Build UI components for case state inspection (admin only)
