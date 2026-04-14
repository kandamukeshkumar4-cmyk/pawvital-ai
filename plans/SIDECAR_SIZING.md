# Sidecar Sizing Gate for VET-1106

This document is the hard prerequisite for `VET-1106`. It records the chosen heavy-sidecar topology, the memory and latency assumptions behind it, and the spend guardrails that must stay true before provisioning moves forward.

## Scope

- In scope:
  - `text-retrieval-service`
  - `image-retrieval-service`
  - `multimodal-consult-service`
  - `async-review-service`
- Out of scope:
  - `vision-preprocess-service`

`vision-preprocess-service` stays on its current Vercel path for this wave and is not part of the heavy-sidecar sizing verdict.

## Assumptions

- `text-retrieval-service` and `image-retrieval-service` may use model-backed ranking, but they do not need dedicated GPU residency to satisfy the current plan. They are sized as CPU-first services on the same host as the consult pod unless later measurements force a different choice.
- `multimodal-consult-service` runs `Qwen/Qwen2.5-VL-7B-Instruct`.
- `async-review-service` runs `Qwen/Qwen2.5-VL-32B-Instruct`.
- The gating rule is 20% VRAM headroom on every provisioned GPU:
  - 48 GB GPU => max steady-state target 38.4 GB
  - 80 GB GPU => max steady-state target 64.0 GB
- Sync-path latency budget for the primary route must stay below 6 seconds end to end.

## Working Memory Estimates

These are planning estimates, not acceptance evidence. `VET-1106` must measure live steady-state memory before the topology is declared production-ready.

| Service | Runtime assumption | Planned GPU usage | Planning estimate |
| --- | --- | --- | --- |
| `text-retrieval-service` | BGE-M3 + reranker on CPU | `0 GB VRAM` | `6-8 GB` host RAM |
| `image-retrieval-service` | BiomedCLIP ranking with cached metadata/assets | `0-2 GB VRAM` reserved as optional burst, planned CPU-first | `4-8 GB` host RAM |
| `multimodal-consult-service` | Qwen2.5-VL-7B quantized or 8-bit runtime | `18-24 GB VRAM` steady state target | fits on 48 GB GPU with headroom |
| `async-review-service` | Qwen2.5-VL-32B dedicated quantized runtime | `40-64 GB VRAM` steady state target | requires dedicated 80 GB GPU |

### Notes

- `Qwen2.5-VL-32B` in BF16 would not satisfy the 20% headroom rule on an 80 GB card. For this wave, the 32B service only passes sizing if the deployed runtime stays at or under `64 GB` steady state on the chosen GPU tier.
- The 7B consult service is allowed to share a host with retrieval because the retrieval services are planned CPU-first. If later profiling proves they need permanent GPU residency, the topology must be revisited before `VET-1106` proceeds.

## Topology Options Considered

### Rejected: one pod with all four heavy services

This option is rejected before provisioning.

Reasons:
- the 32B reviewer becomes a single point of failure for all heavy-sidecar traffic
- the blast radius is too large if one model load, cache volume, or driver issue destabilizes the host
- it creates unnecessary VRAM contention between an always-available 32B review lane and the sync consult lane
- it makes rollback and cost attribution harder

### Accepted planning topology: two pods

#### Pod A — `consult_retrieval`

- GPU: `RTX 6000 Ada 48 GB` baseline
- Services:
  - `text-retrieval-service`
  - `image-retrieval-service`
  - `multimodal-consult-service`
- GPU role:
  - `multimodal-consult-service` is the primary GPU consumer
  - retrieval services remain CPU-first in this phase

#### Pod B — `async_review`

- GPU: `A100 80 GB` baseline
- Upgrade path: `H100 80 GB` only if the A100 fails the async review latency or stability SLOs
- Services:
  - `async-review-service`

## Cost Projection

RunPod on-demand pricing was checked on the official pricing page on April 14, 2026:

- `RTX 6000 Ada 48 GB`: `$0.74/hr`
- `A100 PCIe 80 GB`: `$1.19/hr`
- `H100 PCIe 80 GB`: `$1.99/hr`

### Baseline daily cost

- Pod A `consult_retrieval` on RTX 6000 Ada: `$17.76/day`
- Pod B `async_review` on A100 PCIe 80 GB: `$28.56/day`
- Combined baseline: `$46.32/day`

### Upgrade daily cost if async review requires H100

- Pod A `consult_retrieval` on RTX 6000 Ada: `$17.76/day`
- Pod B `async_review` on H100 PCIe 80 GB: `$47.76/day`
- Combined upgraded total: `$65.52/day`

## Alert Thresholds

- Baseline operating ceiling for the chosen two-pod topology: `$50/day`
- Warning threshold: `$40/day`
- Critical threshold: `$50/day`
- Escalation threshold requiring operator action or pod stop decision: `$60/day`

If the async-review pod must move from A100 to H100, the ceiling must be recalculated before the upgrade is approved. Do not silently absorb the higher spend inside `VET-1106`.

## Sync-Path Latency Budget

The sync path includes the currently live Vercel-hosted vision preprocess lane plus the heavy-sidecar sync calls.

| Segment | Budget |
| --- | --- |
| vision preprocess call | `700 ms` |
| text retrieval call | `650 ms` |
| image retrieval call | `900 ms` |
| multimodal consult call | `2200 ms` |
| route orchestration and serialization | `600 ms` |
| network jitter and reserve | `750 ms` |
| **Total** | **`5800 ms`** |

### Async review note

`async-review-service` is not part of the sync-path latency sum. Its only sync obligation in the live route is queue submission, which should stay below `250 ms`. The long-running review execution happens out of band.

## Verdict

The current `consult_retrieval + async_review` topology is the only approved starting point for `VET-1106`, with the following conditions:

1. `consult_retrieval` uses a 48 GB GPU and keeps steady-state consult VRAM below `38.4 GB`.
2. `async_review` uses a dedicated 80 GB GPU and keeps steady-state review VRAM below `64 GB`.
3. Retrieval services stay CPU-first during this phase unless a separate measured sizing amendment approves GPU residency.
4. The measured sync path remains below the `5.8 s` budget above.
5. The dry-run plus throwaway provision/teardown rehearsal succeeds before live provisioning is allowed.

If any of those conditions fail during `VET-1106`, stop and amend `plans/VET-1100-world-class-completion-mega-ticket.md` before continuing.
