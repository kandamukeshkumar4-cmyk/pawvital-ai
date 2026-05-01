# Heatstroke and Trauma Question Card Implementation (VET-1432K)

**Agent:** Kimi 2.6  
**Branch:** `kimi/vet-1432k-heat-trauma-question-cards`  
**Date:** 2026-05-01  
**Scope:** Add 7 real question cards to unblock future `heatstroke_heat_exposure` and `trauma_bleeding_wound` module work.

---

## 1. Cards Added

| # | Card ID | Phase | Answer Type | Complaint Families |
|---|---------|-------|-------------|-------------------|
| 1 | `heat_exposure_check` | history | boolean | emergency, heat, respiratory |
| 2 | `brachycephalic_breed_check` | history | boolean | emergency, heat, respiratory |
| 3 | `panting_excess_check` | emergency_screen | boolean | emergency, heat, respiratory |
| 4 | `trauma_mechanism_check` | history | choice | emergency, trauma, musculoskeletal |
| 5 | `wound_characterization_check` | characterize | choice | emergency, trauma, skin, wound |
| 6 | `bleeding_volume_check` | emergency_screen | choice | emergency, trauma, wound |
| 7 | `laceration_depth_check` | discriminate | choice | emergency, trauma, wound |

**Registry size:** 19 → 26 question cards.

---

## 2. File Changes

### New files
- `src/lib/clinical-intelligence/question-cards/heat-trauma.ts` — card definitions
- `tests/clinical-intelligence/heat-trauma-question-cards.test.ts` — implementation validation
- `tests/clinical-intelligence/redflag-signal-gap-contract.test.ts` — copied from VET-1430Q for contract validation
- `docs/clinical-intelligence/heat-trauma-question-cards-kimi.md` — this document

### Modified files
- `src/lib/clinical-intelligence/question-card-registry.ts` — import and register 7 new cards

### Protected files (not touched)
- `emergency-red-flags.ts` — no new red flags added
- `clinical-signal-detector.ts` — no new signals added
- `complaint-modules/index.ts` — no new modules added
- `symptom-chat/`, `triage-engine.ts`, `clinical-matrix.ts`, `symptom-memory.ts`, `planner/` — untouched
- `vet-knowledge/` retrieval, RAG, citation runtime — untouched

---

## 3. Schema Compliance Summary

| Check | Status |
|-------|--------|
| ownerText on every card | Pass |
| shortReason on every card | Pass |
| skipIfAnswered array on every card | Pass |
| sourceIds with ≥1 entry on every card | Pass |
| Emergency-screen cards have urgencyImpact = 3 | Pass (`panting_excess_check`, `bleeding_volume_check`) |
| ownerAnswerability ≥ 2, or safetyNotes if < 2 | Pass (`laceration_depth_check` = 2 with safetyNotes) |
| Choice cards have allowedAnswers | Pass (4 choice cards) |
| No diagnosis/treatment language | Pass |
| screensRedFlags reference only existing canonical flags | Pass |
| Registry validation passes | Pass |

---

## 4. Red Flag References

All `screensRedFlags` on new cards reference **existing** canonical red flags only:

| Card | Referenced Red Flags | Exists in canonical list? |
|------|---------------------|---------------------------|
| `brachycephalic_breed_check` | `brachycephalic_heat` | Yes |
| `panting_excess_check` | `heatstroke_signs` | Yes |
| `bleeding_volume_check` | `large_blood_volume`, `wound_deep_bleeding` | Yes |

No proposed/red-flag-only dependencies are referenced in `screensRedFlags`. All red flags are already present in `EMERGENCY_RED_FLAG_IDS`.

---

## 5. Module Readiness Status

**Not changed.** The following modules remain **blocked** because no complaint-module files were added:

| Module | Previous Blocker | Current Blocker |
|--------|-----------------|-----------------|
| `heatstroke_heat_exposure` | missing question cards | **still missing module file** |
| `trauma_bleeding_wound` | missing question cards | **still missing module file** |
| `wound_skin_overlap` | missing question cards | **still missing module file** |

The question-card schema is now **ready** to support these modules, but the modules themselves are not yet implemented. This is intentional per hard scope.

---

## 6. Validation Results

- `heat-trauma-question-cards.test.ts` — 10 suites, all pass
- `question-card-registry.test.ts` — 15 tests, all pass
- `complaint-module-registry-gap-audit.test.ts` — 45 tests, all pass
- `redflag-signal-gap-contract.test.ts` — all pass
- `npm run build` — successful

---

## 7. Recommendations for Next Sprint

1. **Implement `heatstroke_heat_exposure` complaint module** — question cards, red flags, and signals are all in place.
2. **Implement `trauma_bleeding_wound` complaint module** — question cards, red flags, and signals are all in place.
3. **Consider `wound_characterization_check` and `bleeding_volume_check` reuse** — these cards are designed to serve both a standalone trauma module and reduce overlap with the existing `skin_itching_allergy` module.

---

*Implementation complete. No runtime files modified. No modules added.*
