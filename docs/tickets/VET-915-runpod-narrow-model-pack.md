# VET-915 - RunPod Narrow Model Pack

## Goal

Use RunPod for narrow, testable models that improve specific subproblems without taking over triage.

## Candidate Experiments

1. owner-language normalization
2. symptom/entity extraction
3. retrieval reranking
4. urgency cue classification

## Rules

- no end-to-end diagnosis model
- no direct replacement of deterministic emergency logic
- every experiment needs a benchmark and rollback rule

## Required Inputs

- labeled benchmark slices
- held-out validation set
- baseline comparison from the current app

## Done Criteria

- experiment config is versioned
- manifest is generated
- offline metric and acceptance threshold are defined

## Done Evidence

### Experiment config is versioned
- `data/runpod-experiments/narrow-model-pack.json` — version `2026-04-10`, contains all 4 experiments with dataset paths, metrics, thresholds, and rollback rules

### Manifest is generated
- `deploy/runpod/jobs/vet-915-narrow-model-pack.json` — RunPod job manifest with GPU recommendations, env requirements, input/output specs
- `deploy/runpod/narrow-helper/job-manifest.yaml` — Deployment manifest for narrow model pack pod

### Offline metric and acceptance threshold are defined
| Experiment | Metric | Threshold | Rollback Rule |
|-----------|--------|-----------|---------------|
| owner-language-normalization | exact_match | 0.90 | Do not promote if emergency or red-flag phrasing recall regresses |
| symptom-entity-extraction | macro_f1 | 0.88 | Do not promote if protected control-state fields need model output |
| retrieval-reranking | ndcg_at_10 | 0.85 | Do not promote if deterministic emergency logic changes behavior |
| urgency-cue-classification | emergency_recall | 0.97 | Do not promote if false reassurance increases |

### Additional deliverables
- **Dataset slices created:**
  - `data/runpod-experiments/datasets/owner-language-normalization.json` (30 examples)
  - `data/runpod-experiments/datasets/symptom-entity-extraction.json` (30 examples)
  - `data/runpod-experiments/datasets/retrieval-reranking.json` (15 examples)
  - `data/runpod-experiments/datasets/urgency-cue-classification.json` (35 examples)
- **Held-out validation split:** `data/runpod-experiments/validation-split.json` (20% held out per experiment)
- **Provisioning script:** `scripts/runpod-provision-narrow.mjs` (health, wire, stop, provision)
- **vLLM server:** `services/narrow-model-pack/server.py` (FastAPI serving 4 text models)
- **Pod registry entry:** `deploy/runpod/pods.json` — narrow_model_pack entry added
- **npm scripts:** `runpod:provision:narrow`, `runpod:provision:narrow:force`, `runpod:narrow:health`, `runpod:narrow:wire`, `runpod:stop:narrow`

## Status: COMPLETE
