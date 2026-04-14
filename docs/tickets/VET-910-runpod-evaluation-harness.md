# VET-910 - RunPod Evaluation Harness

## Goal

Create a dog-only benchmark harness that can score PawVital symptom-checker behavior against a versioned suite of benchmark cases.

## Why RunPod

RunPod is appropriate here because batch benchmark execution is embarrassingly parallel and can be run repeatedly against large case suites without coupling medical logic to the cloud job.

## Deliverables

- benchmark suite schema
- seed benchmark cases
- score report JSON output
- RunPod job manifest for batch evaluation

## Input Contract

- benchmark file: `data/benchmarks/dog-triage/*.json`
- app endpoint: `/api/ai/symptom-chat`
- env: `APP_BASE_URL`

## Metrics

- case pass rate
- mean case score
- emergency miss count
- expectation failure breakdown

## Done Criteria

- harness supports `--dry-run`
- harness supports live execution against a deployed app
- output report is machine-readable JSON
- manifest exists under `deploy/runpod/jobs/`

## Done Evidence

### Harness supports `--dry-run`
- `scripts/runpod-benchmark.mjs` — `--dry-run` flag runs without live app calls
- `npm run runpod:benchmark:dry` available

### Harness supports live execution against a deployed app
- `scripts/runpod-benchmark.mjs` — `APP_BASE_URL` env var enables live execution
- `npm run runpod:benchmark` runs against configured app

### Output report is machine-readable JSON
- Scorecard output: `data/benchmark/scorecard-EVAL-*.json`
- Gold benchmark: `data/benchmark/gold-benchmark-v1.jsonl` (575 cases)
- Additional harness: `scripts/eval-harness.ts` with per-category breakdowns
- `scripts/eval-harness.ts` is a simulated scorecard scaffold, not a live route-backed safety gate

### Manifest exists under `deploy/runpod/jobs/`
- `deploy/runpod/jobs/vet-910-benchmark-eval.json` — job manifest with command, env, inputs, outputs

### Additional deliverables
- **Schema:** `data/benchmarks/dog-triage/benchmark.schema.json`
- **Sample cases:** `data/benchmarks/dog-triage/sample-cases.json`
- **Gold candidate packs:** `data/benchmarks/dog-triage/gold-candidate/` (7 packs)
- **Adjudication schema:** `data/benchmarks/dog-triage/adjudication-record.schema.json`
- **Coverage matrix:** `data/benchmarks/dog-triage/coverage-matrix.json`
- **Failure taxonomy:** `data/benchmarks/dog-triage/failure-taxonomy.json`
- **Silent trial schema:** `data/benchmarks/dog-triage/silent-trial.schema.json`
- **Gold benchmark v1:** `data/benchmarks/dog-triage/gold-v1-enriched.jsonl`
- **Full benchmark:** `data/benchmark/gold-benchmark-v1.jsonl` (575 cases across 50 complaint families)
- **Evaluation harness:** `scripts/eval-harness.ts` (simulated Case Runner → Scorer → Scorecard architecture, not route-backed)
- **Benchmark generator:** `scripts/generate-benchmark-cases.ts`
- **Benchmark validator:** `scripts/validate-benchmark.ts` (575 cases validated)
- **npm scripts:** `eval:benchmark`, `eval:benchmark:dangerous`, `eval:benchmark:case`, `eval:benchmark:generate`, `eval:benchmark:validate`

## Status: COMPLETE

## Clarification

- `scripts/runpod-benchmark.mjs` is the live deployed-app benchmark path when `APP_BASE_URL` is configured
- `scripts/eval-harness.ts` is intentionally simulated and should not be interpreted as the live route-backed safety gate
