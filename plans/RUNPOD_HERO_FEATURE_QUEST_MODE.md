# RunPod Hero Feature Quest Mode

This plan is the Qoder-ready execution surface for the RunPod-backed portion of `VET-901`.

## Scope

These are the RunPod-specific tracks that can be executed without moving deterministic medical logic out of the app:

1. `VET-910` - benchmark evaluation harness
2. `VET-911` - silent-trial framework
3. `VET-915` - narrow model experiment pack
4. `VET-916` - multimodal dog-triage pilot

## Guardrails

- Deterministic triage remains the medical authority.
- RunPod jobs support evaluation, retrieval, extraction, reranking, and advisory multimodal analysis only.
- No RunPod model may directly own emergency disposition or diagnosis ranking without beating the deterministic baseline on the benchmark suite.
- Dog-only scope for this wave.

## Quest Order

### Quest 1 - VET-910

Build and run the benchmark harness against the deployed app.

Outputs:
- `data/benchmarks/dog-triage/benchmark.schema.json`
- `data/benchmarks/dog-triage/sample-cases.json`
- `scripts/runpod-benchmark.mjs`
- `deploy/runpod/jobs/vet-910-benchmark-eval.json`

Done when:
- the benchmark suite validates
- the harness can run in dry-run mode locally
- the harness can score live app responses when `APP_BASE_URL` is set

### Quest 2 - VET-911

Run shadow-mode and silent-trial reporting against live sidecar traffic.

Outputs:
- `data/benchmarks/dog-triage/silent-trial.schema.json`
- `scripts/report-phase5-shadow.mjs`
- `scripts/runpod-phase5-cycle.mjs`
- `deploy/runpod/jobs/vet-911-silent-trial.json`

Done when:
- a dry-run benchmark report exists
- a shadow rollout report can be generated
- adjudicated silent-trial records have a stable schema

### Quest 3 - VET-915

Run narrow-model experiments only where they can outperform the current baseline safely.

Targets:
- owner-language normalization
- symptom/entity extraction
- retrieval reranking
- urgency cue classification

Outputs:
- `docs/tickets/VET-915-runpod-narrow-model-pack.md`
- `data/runpod-experiments/narrow-model-pack.json`
- `deploy/runpod/jobs/vet-915-narrow-model-pack.json`

Done when:
- every experiment has a dataset contract
- every experiment has an offline metric
- every experiment has a rollback rule

### Quest 4 - VET-916

Pilot multimodal support for high-yield dog-only inputs.

Targets:
- gait and limping video
- breathing effort video
- gums / skin / stool / vomit photo support

Outputs:
- `docs/tickets/VET-916-runpod-multimodal-dog-triage-pilot.md`
- `data/runpod-experiments/multimodal-pilot.json`
- `deploy/runpod/jobs/vet-916-multimodal-pilot.json`

Done when:
- multimodal outputs are advisory-only
- benchmark cases exist for each pilot domain
- escalation still routes through deterministic rules

## How To Run

### Generate job manifests

```bash
node scripts/runpod-hero-job-manifests.mjs
```

### Validate the benchmark suite without live calls

```bash
node scripts/runpod-benchmark.mjs --dry-run
```

### Run the benchmark suite against a deployed app

```bash
APP_BASE_URL=https://pawvital-ai.vercel.app node scripts/runpod-benchmark.mjs
```

### Run the existing shadow-mode validation cycle

```bash
npm run phase5:cycle
npm run phase5:report
```

## Promotion Rule

RunPod-backed features may only move forward when:

- the benchmark score improves or stays neutral
- emergency recall does not regress
- unsafe downgrade count does not increase
- the feature remains advisory if it is multimodal or model-driven
