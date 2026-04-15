# ICD-10 Coverage Audit

Date: 2026-04-14
Ticket: VET-1208

## Scope

- Audited `src/lib/icd-10-mapper.ts` against the canine diagnosis keys used in `clinical-matrix.ts`
- Ranked missing ICD-10 display mappings by benchmark frequency using `data/benchmark/gold-benchmark-v1.jsonl`
- Added the top 20 benchmark-driven canine gaps

## Method

1. Enumerated disease keys from `DISEASE_DB` in `src/lib/clinical-matrix.ts`
2. Enumerated currently mapped keys from `src/lib/icd-10-mapper.ts`
3. Counted missing diagnosis keys appearing in benchmark `likely_differentials` and `must_not_miss`
4. Prioritized by benchmark frequency first, then clinical urgency from the existing benchmark labels

## Findings

- `DISEASE_DB` keys audited: 27
- Existing ICD-10 disease mappings before this ticket: 46
- Existing ICD-10 codes before this ticket: 52
- Direct `DISEASE_DB` gaps before this ticket: 14
- Benchmark-exposed canine diagnosis gaps were broader because the benchmark uses several aliases and higher-level labels not present as exact mapper keys
- Each VET-1208 addition contributed one display mapping, bringing the mapper totals to 66 diseases and 72 codes after this pass

## Top 20 Benchmark Gaps Added

| Rank | Disease key | Benchmark mentions | Mapping added |
|---|---|---:|---|
| 1 | `pain_general` | 66 | `R52` |
| 2 | `allergic_dermatitis` | 65 | `L23.9` |
| 3 | `heart_failure` | 54 | `I50.9` |
| 4 | `ccl_rupture` | 40 | `S83.51` |
| 5 | `pyometra` | 36 | `N71.9` |
| 6 | `seizure_disorder` | 34 | `G40.9` |
| 7 | `ivdd` | 30 | `M51.9` |
| 8 | `skin_mass` | 28 | `R22.9` |
| 9 | `cognitive_dysfunction` | 26 | `F03.90` |
| 10 | `pleural_effusion` | 25 | `J90` |
| 11 | `bloat` | 25 | `K56.69` |
| 12 | `oral_tumor` | 25 | `D49.0` |
| 13 | `dystocia` | 24 | `O66.9` |
| 14 | `hypoglycemia` | 23 | `E16.2` |
| 15 | `urinary_infection` | 23 | `N39.0` |
| 16 | `sudden_acquired_retinal_degeneration` | 22 | `H53.9` |
| 17 | `heat_stroke` | 22 | `T67.0` |
| 18 | `ear_infection_bacterial` | 20 | `H60.9` |
| 19 | `urinary_stones` | 20 | `N21.9` |
| 20 | `megaesophagus` | 20 | `K22.89` |

## Notes

- These mappings remain reference-only display/reporting aids. They do not alter deterministic triage logic.
- Alias-style additions such as `bloat`, `ivdd`, `urinary_infection`, and `urinary_stones` were intentionally added because benchmark and report labels do not always match the canonical mapper key exactly.
- Lower-frequency gaps such as `impa`, `osteoarthritis`, `foreign_body`, `laceration`, and `autoimmune_skin` remain candidates for a follow-on pass if broader reporting coverage is needed.
