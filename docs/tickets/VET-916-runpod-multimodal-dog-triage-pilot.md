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
