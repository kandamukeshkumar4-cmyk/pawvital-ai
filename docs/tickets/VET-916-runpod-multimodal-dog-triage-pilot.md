# VET-916 - RunPod Multimodal Dog Triage Pilot

## Goal

Pilot advisory multimodal support for the highest-yield dog-only inputs.

## Pilot Domains

1. gait / limping video
2. breathing-effort video
3. gums / skin / stool / vomit image support

## Clinical Rule

Multimodal outputs remain advisory and never bypass deterministic escalation logic in the app.

## Why RunPod

These workloads are GPU-heavy and operationally fit RunPod better than Vercel-hosted execution.

## Deliverables

- experiment config
- manifest
- benchmark slice for each pilot domain

## Done Criteria

- every pilot domain has a benchmark slice
- every pilot domain defines a failure mode
- outputs are advisory-only and measurable

## Done Evidence

### Every pilot domain has a benchmark slice

| Domain | Slice File | Cases | Breeds Covered |
|--------|-----------|-------|----------------|
| gait/limping | `data/benchmarks/dog-triage/multimodal-slices/gait-analysis.jsonl` | 6 | Labrador, Dachshund, Rottweiler, Golden Retriever, French Bulldog, Corgi |
| breathing-effort | `data/benchmarks/dog-triage/multimodal-slices/breathing-effort.jsonl` | 7 | Bulldog, Labrador, Beagle, German Shepherd, Husky, Cavalier KC, Pug |
| gums-color | `data/benchmarks/dog-triage/multimodal-slices/gums-color.jsonl` | 6 | German Shepherd, Pit Bull, Labrador, French Bulldog, Beagle, Golden Retriever |
| skin-lesion | `data/benchmarks/dog-triage/multimodal-slices/skin-lesion.jsonl` | 6 | Golden Retriever, Pit Bull, Boxer, Poodle, Bulldog, German Shepherd |
| stool-analysis | `data/benchmarks/dog-triage/multimodal-slices/stool-analysis.jsonl` | 6 | Pit Bull (puppy), Beagle, Labrador, German Shepherd, Great Dane, Husky |
| vomit-analysis | `data/benchmarks/dog-triage/multimodal-slices/vomit-analysis.jsonl` | 6 | German Shepherd, Poodle, Labrador, Golden Retriever (puppy), Pug, Rottweiler |

All cases include:
- Real clinical descriptions (no placeholder URLs)
- Breed context with risk modifiers
- Expected symptoms and disposition
- urgency_tier classification
- advisory_only flag set to true

### Every pilot domain defines a failure mode

| Pilot | Failure Modes | Critical Count |
|-------|--------------|----------------|
| gait-lameness-video | missing_ivdd_emergency, missing_osteosarcoma_risk, false_reassurance_chronic_limp, over_escalation_minor_limp | 1 critical |
| breathing-effort-video | missing_brachycephalic_crisis, false_reassurance_respiratory, missing_gdv_breathing_sign, missing_cardiac_cough | 3 critical |
| photo-support-high-yield-domains | missing_cyanosis_gums, missing_mast_cell_risk, missing_melena_stool, missing_hematemesis_vomit, missing_parvo_puppy_stool, false_reassurance_anaphylaxis | 4 critical |

Each failure mode has:
- Unique ID and description
- Severity classification (critical/high/medium)
- Specific metric and threshold
- Rollback rule

### Outputs are advisory-only and measurable

- All benchmark cases have `"advisory_only": true`
- Experiment config includes `"safety_rule"` per pilot domain
- Measurable via: emergency_recall, unsafe_downgrade_rate, breed_risk_flag_recall, over_escalation_rate
- Promotion rule from plan: "RunPod-backed features may only move forward when the benchmark score improves or stays neutral"

### Additional deliverables
- **Experiment config:** `data/runpod-experiments/multimodal-pilot.json` (with per-domain failure modes)
- **Job manifest:** `deploy/runpod/jobs/vet-916-multimodal-pilot.json`
- **Deployment configs:** `deploy/runpod/multimodal-pilot/` (per-domain configs + job manifest)
- **Pilot script:** `scripts/multimodal-triage-pilot.mjs` (demo + live mode)
- **Documentation:** `docs/multimodal-triage-pilot.md`
- **npm scripts:** `multimodal:demo`, `multimodal:live`, `multimodal:temporal`
- **Breed risk modifiers:** 8 breeds with wound-specific risk multipliers in pilot script

## Status: COMPLETE
