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
