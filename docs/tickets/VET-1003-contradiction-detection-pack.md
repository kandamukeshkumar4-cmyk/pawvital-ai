# VET-1003 — Contradiction Detection Pack

**Branch:** `copilot/vet-1003-contradiction-detection-pack-v1`  
**PR Target:** `master`  
**Base Commit:** `5419f1d5dbfae01ba47c4fe7bc970ef173be2f32`  
**Author:** GitHub Copilot (Claude Sonnet 4.6)  
**Status:** Ready for review  

---

## Summary

This ticket establishes the contradiction detection fixture catalog and passing tests for the existing vision/text contradiction surface in `src/lib/symptom-chat/report-helpers.ts`.

No runtime logic is changed. No route wiring is added. This is a pure test-and-documentation ticket, intended to give VET-1002 (uncertainty wiring) and future tickets a stable, reviewable baseline of what "contradiction detected" means before any integration work begins.

---

## Problem

The codebase already has two exported functions that detect and act on contradictions:

| Function | Location |
|---|---|
| `deriveVisionContradictions` | `src/lib/symptom-chat/report-helpers.ts` |
| `shouldTriggerSyncConsult` | `src/lib/symptom-chat/report-helpers.ts` |

However, there were no unit tests for these functions and no fixture catalog documenting the full set of contradiction patterns (both text-level patterns from `docs/ood-guardrails.md` and vision/text patterns from the helper layer).

Without this baseline, future uncertainty-wiring work would have to infer the expected behavior from production code.

---

## Deliverables

### 1. `tests/fixtures/clinical/contradiction-cases.json`

A machine-readable catalog of all currently-documented contradiction patterns, organized into two categories:

| Category | Count | Source |
|---|---|---|
| `text_text` | 7 | `docs/ood-guardrails.md §1 Known Contradictions` |
| `vision_text` | 5 | `src/lib/symptom-chat/report-helpers.ts → deriveVisionContradictions` |

Each entry carries:
- `id` — unique, stable string ID for cross-referencing
- `contradiction_id` — semantic name of the pattern
- `category` — `text_text` or `vision_text`
- `resolution` — `clarify` | `escalate` | `take_worst_case`
- `future_uncertainty_reason` — always `conflicting_evidence` (maps to `UncertaintyReason` in `src/lib/clinical/uncertainty-contract.ts`)
- `future_conflicting_evidence_fields` — the specific data fields that will conflict
- `safe_next_step` — human-readable safe response if the contradiction fires
- `test_status` — `tested_in_report-helpers.vision-contradictions.test.ts` for vision cases, `documented_pending_export` for text cases

### 2. `tests/report-helpers.vision-contradictions.test.ts`

Tests for the existing exported contradiction surface. Coverage:

#### `deriveVisionContradictions`

| Pattern | Tests |
|---|---|
| vc-001: eye domain mismatch | true-positive, text-mentions-eye (negative), eye_discharge-symptom (negative) |
| vc-002: ear domain mismatch | true-positive, text-mentions-ear (negative), ear_scratching-symptom (negative) |
| vc-003: stool/vomit domain mismatch | true-positive, vomit in text (negative), diarrhea in text (negative), stool in text (negative) |
| vc-004: body region mismatch | true-positive, sides-agree (negative), no-direction-qualifier (negative), null-bodyRegion (negative) |
| vc-005: urgent severity without red flags | true-positive, red-flags-present (negative), analysis-says-urgent (negative), below-urgent-severity (negative) |
| baseline | consistent skin/wound inputs, null preprocess, normal severity |

#### `shouldTriggerSyncConsult`

| Scenario | Expected |
|---|---|
| Non-empty contradictions | `true` |
| No contradictions + low-risk signals | `false` |
| Low vision confidence | `true` |
| Owner says left / extracted answer says right | `true` (implicit lateral conflict) |
| Urgent severity | `true` |

#### Fixture catalog integrity

Tests that `contradiction-cases.json` has:
- ≥ 12 cases (7 text + 5 vision)
- All `future_uncertainty_reason` values equal `"conflicting_evidence"`
- All 7 documented text-text IDs present
- All 5 vision-text IDs present
- Unique IDs
- `gum_conflict` and `breathing_conflict` are `escalate` (safety-critical)

### 3. `docs/tickets/VET-1003-contradiction-detection-pack.md`

This document.

---

## Future Mapping: `conflicting_evidence` → Uncertainty Contract

> **Not wired in this ticket.** This section documents the intended downstream mapping for VET-1002 / VET-1005.

When uncertainty wiring is added, each detected contradiction should produce an `UncertaintyRule` resolution via `resolveUncertainty("conflicting_evidence", context)`:

```typescript
// src/lib/clinical/uncertainty-contract.ts — existing rule (not changed)
{
  reason: "conflicting_evidence",
  action: "re_ask",
  conditions: ["contradictory_answers"],
  safeNextStep: "Let me clarify - you mentioned earlier that...",
}
```

The per-contradiction `safe_next_step` strings in `contradiction-cases.json` are intended to become the per-contradiction override in that rule when the wiring ticket lands.

Visual contradiction patterns (vc-001 through vc-005) should additionally populate `VisionClinicalEvidence.contradictions[]` (the field already exists in the type, it is just always `[]` at the point VET-1003 is written).

---

## Text-Level Contradictions: Test Status

The 7 text-text contradiction patterns (`appetite_conflict`, `energy_conflict`, etc.) are documented in the fixture but **not yet exported** as testable functions. They are currently embedded in route-level logic in `src/app/api/ai/symptom-chat/route.ts` (Codex-owned).

Testing these patterns requires either:
1. Extraction into a new pure helper (e.g., `src/lib/symptom-chat/contradiction-helpers.ts`) — recommended for a future ticket
2. Integration-level testing of the route — heavier and out of scope here

The fixture entries for these cases carry `"test_status": "documented_pending_export"` to signal this gap to the VET-1002 / VET-1005 author.

---

## Acceptance Criteria

| Criterion | Status |
|---|---|
| Contradiction fixture catalog exists and is extensible | ✅ `tests/fixtures/clinical/contradiction-cases.json` |
| Tests pass against existing exported contradiction behavior | ✅ `tests/report-helpers.vision-contradictions.test.ts` |
| No runtime code paths changed | ✅ Zero edits to `src/` |
| Diff is small and reviewable | ✅ 3 new files, no edits |
| No Codex-owned files modified | ✅ Forbidden files untouched |

---

## Scope Boundaries

This ticket intentionally does **not**:
- Change any runtime logic
- Wire uncertainty contract reasoning
- Edit benchmark files or scripts
- Touch `src/app/api/ai/symptom-chat/route.ts`
- Touch anything under `src/lib/symptom-chat/`
- Touch `src/lib/clinical/uncertainty-contract.ts`
- Add CI workflow changes

---

## Diff Summary

```
tests/fixtures/clinical/contradiction-cases.json     (new, 12 cases)
tests/report-helpers.vision-contradictions.test.ts   (new, ~330 lines)
docs/tickets/VET-1003-contradiction-detection-pack.md (new, this file)
```

No existing files were modified.
