# Wave 3 Freeze Report

Generated at: 2026-04-20T22:08:43.695Z
Source input: C:\pv-wave3-stack\data\benchmarks\dog-triage\gold-candidate
Unique case count: 226
High-risk cases requiring dual review: 129

## Freeze Strata

| Stratum | Cases | Dual-review required |
| --- | ---: | ---: |
| Emergency | 76 | 76 |
| Urgent | 26 | 26 |
| Common | 80 | 0 |
| Ambiguous | 17 | 0 |
| Contradictory | 4 | 4 |
| Low Information | 28 | 28 |
| Rare But Critical | 76 | 76 |

## Multimodal Slice Inputs

| File | Modality | Cases |
| --- | --- | ---: |
| breathing-effort.jsonl | breathing_effort | 7 |
| gait-analysis.jsonl | gait_analysis | 6 |
| gums-color.jsonl | gums_color | 6 |
| skin-lesion.jsonl | skin_lesion | 6 |
| stool-analysis.jsonl | stool_analysis | 6 |
| vomit-analysis.jsonl | vomit_analysis | 6 |

## Notes

- High-risk cases are pre-seeded with dual-review metadata, reviewer slots, disagreement status, and must-ask expectation scaffolding.
- Must-ask expectation IDs are seeded from existing benchmark expectation fields and still require veterinarian confirmation.
- This freeze remains pre-adjudication until independent clinical review is completed and disagreement cases are reconciled.

