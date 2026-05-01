# Heatstroke and Trauma Schema Readiness Guard (VET-1433Q)

**Agent:** Qwen 3.6 Plus  
**Branch:** qwen/vet-1433q-heat-trauma-schema-readiness-guard  
**Date:** 2026-05-01  
**Scope:** Validation guard only — no question cards, modules, red flags, signals, or runtime changes.

---

## 1. Purpose

This guard proves that `heatstroke_heat_exposure` and `trauma_bleeding_wound` cannot be considered fully ready until all required question cards, red flags, signals, and vet-knowledge metadata exist. It prevents future work from landing without complete schema alignment.

---

## 2. Canonical Registries Referenced

| Registry | File | Count |
|----------|------|-------|
| Complaint modules | `src/lib/clinical-intelligence/complaint-modules/index.ts` | 11 modules |
| Emergency red flags | `src/lib/clinical-intelligence/emergency-red-flags.ts` | 37 IDs |
| Clinical signals | `src/lib/clinical-intelligence/clinical-signal-detector.ts` | 14 patterns |
| Question cards | `src/lib/clinical-intelligence/question-card-registry.ts` | 19 cards |
| Complaint source map | `src/lib/clinical-intelligence/vet-knowledge/complaint-source-map.ts` | 11 entries |
| Coverage gap registry | `src/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry.ts` | 11 entries |
| Source gap plan | `src/lib/clinical-intelligence/vet-knowledge/source-gap-plan.ts` | 11 entries (derived) |

---

## 3. Readiness Requirements

### 3.1 heatstroke_heat_exposure

| Requirement | Status | Detail |
|-------------|--------|--------|
| Module registered | Present | `src/lib/clinical-intelligence/complaint-modules/heatstroke.ts` |
| Red flags present | All 6 present | `heatstroke_signs`, `brachycephalic_heat`, `collapse`, `breathing_difficulty`, `pale_gums`, `blue_gums` |
| Signals present | All 3 present | `possible_heat_stroke`, `possible_collapse_or_weakness`, `possible_breathing_difficulty` |
| Source-map entry | Present | Maps to `emergency` family, 6 red flags |
| Coverage-gap entry | Present | Status: `active`, source: `partial`, citation: `emergency_only` |
| Source-gap-plan entry | Present | Derived from coverage-gap |
| Question cards: heat_exposure_check | Present | Added by VET-1432K |
| Question cards: brachycephalic_breed_check | Present | Added by VET-1432K |
| Question cards: panting_excess_check | Present | Added by VET-1432K |

### 3.2 trauma_bleeding_wound

| Requirement | Status | Detail |
|-------------|--------|--------|
| Module registered | Present | `src/lib/clinical-intelligence/complaint-modules/trauma-bleeding.ts` |
| Red flags present | All 7 present | `large_blood_volume`, `wound_deep_bleeding`, `collapse`, `unresponsive`, `pale_gums`, `blue_gums`, `breathing_difficulty` |
| Signals present | All 5 present | `possible_trauma`, `possible_collapse_or_weakness`, `possible_pale_gums`, `possible_blue_gums`, `possible_breathing_difficulty` |
| Source-map entry | Present | Maps to `trauma`, `emergency`, `bleeding` families, 7 red flags |
| Coverage-gap entry | Present | Status: `active`, source: `partial`, citation: `emergency_only` |
| Source-gap-plan entry | Present | Derived from coverage-gap |
| Question cards: wound_characterization_check | Present | Added by VET-1432K |
| Question cards: bleeding_volume_check | Present | Added by VET-1432K |
| Question cards: trauma_mechanism_check | Present | Added by VET-1432K |

---

## 4. Missing Requirements Summary

### 4.1 Question cards

**None missing.** All 6 required question cards were added by VET-1432K:
- `heat_exposure_check`, `brachycephalic_breed_check`, `panting_excess_check` (heatstroke)
- `wound_characterization_check`, `bleeding_volume_check`, `trauma_mechanism_check` (trauma)

### 4.2 Red flags

**None missing.** All required red flags for both modules exist in `EMERGENCY_RED_FLAG_IDS`.

### 4.3 Clinical signals

**None missing.** All required signals for both modules exist in `SIGNAL_PATTERNS`.

### 4.4 Vet-knowledge metadata

**All present.** Both modules have source-map, coverage-gap, and source-gap-plan entries.

### 4.5 Coverage-gap metadata

**All present.** Both modules have coverage-gap entries with appropriate status and safety notes.

### 4.6 Source-gap-plan metadata

**All present.** Both modules have source-gap-plan entries derived from coverage-gap.

---

## 5. Guard Behavior

The test file validates:

1. Both modules are registered in `complaint-modules/index.ts`.
2. Both modules have vet-knowledge source-map entries.
3. Both modules have coverage-gap entries.
4. Both modules have source-gap-plan entries.
5. No orphaned metadata (entries without registered modules).
6. All referenced red flags exist in `EMERGENCY_RED_FLAG_IDS`.
7. All referenced signals exist in `SIGNAL_PATTERNS`.
8. All referenced question cards in emergency screen and all phases exist.
9. All required dedicated question cards are present (added by VET-1432K).
10. No proposed IDs are used without `proposed_` prefix.
11. No forbidden diagnosis/treatment language in any module or metadata text.
12. Both modules ARE ready: all red flags, signals, and question cards present.
13. All 11 registered modules have complete metadata coverage (source-map, coverage-gap, source-gap-plan).

---

## 6. Current Readiness Assessment

| Module | Red Flags | Signals | Vet-Knowledge | Coverage-Gap | Source-Gap-Plan | Question Cards | Ready? |
|--------|-----------|---------|---------------|--------------|-----------------|----------------|--------|
| heatstroke_heat_exposure | 6/6 | 3/3 | Present | Present | Present | 3/3 dedicated | **Yes** |
| trauma_bleeding_wound | 7/7 | 5/5 | Present | Present | Present | 3/3 dedicated | **Yes** |

Both modules now have dedicated question cards (added by VET-1432K) for characterize/discriminate/timeline phases, in addition to generic emergency screening cards.

---

## 7. Constraints

- **Guard only.** No runtime files modified.
- No new question cards added.
- No new complaint modules added.
- No new red flags added.
- No new clinical signals added.
- No changes to source maps, symptom-chat, triage-engine, clinical-matrix, symptom-memory, planner, emergency sentinel behavior, or RAG runtime.
- No diagnosis/treatment wording in any guard text.

---

*Guard complete. No runtime files modified.*
