# Complaint Module Registry Gap Audit — Kimi Packaging

Date audited: May 1, 2026

## Scope

This audit is a packaging-only snapshot of the live complaint-module and vet-knowledge registry state on `origin/master`. It does not add complaint modules, question cards, runtime wiring, or clinical logic changes.

Surfaces reviewed:
- `src/lib/clinical-intelligence/complaint-modules/index.ts`
- `src/lib/clinical-intelligence/vet-knowledge/complaint-source-map.ts`
- `src/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry.ts`
- `src/lib/clinical-intelligence/vet-knowledge/source-gap-plan.ts`

## Summary

- Registered complaint modules: `11`
- Complaint modules represented in all three vet-knowledge registries: `11 / 11`
- Source coverage distribution:
  - `2` strong
  - `8` partial
  - `1` missing
- Owner-visible citation coverage distribution:
  - `2` available
  - `8` emergency_only
  - `1` missing
- Gap priority distribution:
  - `1` critical
  - `8` high
  - `2` not_needed

Audit conclusion:
- The current risk is not missing registry linkage. Every complaint module is mapped in the complaint source map, coverage-gap registry, and source-gap plan.
- The remaining gap is content completeness. `urinary_obstruction` is the only module still marked `missing` for both source coverage and owner-visible citation coverage.
- Eight modules remain operationally mapped but still depend on partial or emergency-only coverage rather than complaint-specific, complete source support.

## Module Matrix

| Module ID | Source coverage | Owner-visible citations | Gap priority | Notes |
| --- | --- | --- | --- | --- |
| `skin_itching_allergy` | `partial` | `emergency_only` | `high` | Missing dedicated dermatology and allergy-differentiation support. |
| `gi_vomiting_diarrhea` | `strong` | `available` | `not_needed` | No current registry gap. |
| `limping_mobility_pain` | `partial` | `emergency_only` | `high` | Missing musculoskeletal and orthopedic triage support. |
| `respiratory_distress` | `strong` | `available` | `not_needed` | No current registry gap. |
| `seizure_collapse_neuro` | `partial` | `emergency_only` | `high` | Missing dedicated neurology and seizure guidance support. |
| `urinary_obstruction` | `missing` | `missing` | `critical` | Missing urinary or renal source coverage and missing owner-visible citation support. |
| `toxin_poisoning_exposure` | `partial` | `emergency_only` | `high` | Missing toxicology and poison-control source support. |
| `bloat_gdv` | `partial` | `emergency_only` | `high` | Missing breed-risk and follow-on reference support. |
| `collapse_weakness` | `partial` | `emergency_only` | `high` | Missing collapse differential, cardiac emergency, and metabolic crisis support. |
| `heatstroke_heat_exposure` | `partial` | `emergency_only` | `high` | Missing dedicated heatstroke, brachycephalic risk, and cooling-protocol support. |
| `trauma_bleeding_wound` | `partial` | `emergency_only` | `high` | Missing trauma, bleeding-severity, and wound-risk support. |

## Exact Audit Findings

1. Registry isolation is clean.
All `11` complaint modules have entries in:
- complaint source map
- coverage-gap registry
- source-gap plan

2. The only critical registry gap is `urinary_obstruction`.
This module is the only one marked:
- `sourceCoverage: "missing"`
- `ownerVisibleCitationCoverage: "missing"`
- `priority: "critical"`
- `citationIntent: "none"`

3. The strongest current coverage is limited to two modules.
Only these modules currently reach `strong` source coverage with `available` owner-visible citations:
- `gi_vomiting_diarrhea`
- `respiratory_distress`

4. The remaining mapped modules are still gap-bearing.
These modules are linked across the registries but remain `partial` with `emergency_only` owner-visible citation coverage:
- `skin_itching_allergy`
- `limping_mobility_pain`
- `seizure_collapse_neuro`
- `toxin_poisoning_exposure`
- `bloat_gdv`
- `collapse_weakness`
- `heatstroke_heat_exposure`
- `trauma_bleeding_wound`

## Packaging Notes

- This audit adds documentation plus a read-only regression test only.
- No protected runtime clinical files were modified.
- No complaint-module runtime behavior changed.
