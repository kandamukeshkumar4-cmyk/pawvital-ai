# VET-911 - RunPod Silent-Trial Framework

## Goal

Measure sidecar and model-backed behavior in shadow mode before promotion.

## Existing Foundation

The repo already contains:

- `scripts/runpod-phase5-cycle.mjs`
- `scripts/report-phase5-shadow.mjs`
- `/api/ai/shadow-rollout`
- `/api/ai/sidecar-readiness`

This ticket formalizes the data contract around those surfaces for a hero-feature silent trial.

## Why RunPod

RunPod is used for the heavy sidecars and for large-batch analysis of shadow-mode outputs. The silent trial itself must still preserve deterministic app control.

## Deliverables

- silent-trial schema
- manifest for the shadow cycle
- reporting path for readiness + shadow summary

## Success Criteria

- shadow rollout summary exists for each cycle
- disagreement counts are tracked
- blocked/watch/ready status is explicit
- sidecar promotion remains gated by real evidence

## Done Evidence

### Shadow rollout summary exists for each cycle
- `scripts/report-phase5-shadow.mjs` — generates shadow reports
- `scripts/runpod-phase5-cycle.mjs` — runs Phase 5 shadow cycle
- `npm run phase5:report` and `npm run phase5:cycle` available
- `scripts/silent-trial.ts` — full silent trial framework with conversation reconstruction, benchmark matching (Jaccard similarity), shadow scoring, trend tracking

### Disagreement counts are tracked
- Silent trial script tracks disposition disagreements, question coverage gaps, red flag misses
- Shadow report includes failure modes and trends by date
- Output: `data/benchmark/shadow-SHADOW-*.json` with disagreement metrics

### Blocked/watch/ready status is explicit
- `scripts/report-phase5-shadow.mjs` produces per-service promotion status (ready/watch/blocked/insufficient_data)
- `/api/ai/shadow-rollout` app route exposes rollout summary
- `/api/ai/sidecar-readiness` exposes per-sidecar health and configuration status

### Sidecar promotion remains gated by real evidence
- Promotion rule enforced: "RunPod-backed features may only move forward when the benchmark score improves or stays neutral"
- Emergency recall must not regress
- Unsafe downgrade count must not increase
- Multimodal/features must remain advisory

### Additional deliverables
- **Silent trial schema:** `data/benchmarks/dog-triage/silent-trial.schema.json`
- **Manifest:** `deploy/runpod/jobs/vet-911-silent-trial.json`
- **Shadow scorecard:** `data/benchmark/shadow-SHADOW-2026-04-10-586.json` (50 simulated conversations)
- **npm scripts:** `eval:silent-trial`, `eval:silent-trial:7d`, `eval:silent-trial:30d`

## Status: COMPLETE
