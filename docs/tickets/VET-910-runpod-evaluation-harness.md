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
