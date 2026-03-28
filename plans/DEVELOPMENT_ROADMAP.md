# PawVital Veterinary Analyzer Development Roadmap

This document is the single source of truth for the architecture path, phase order, and current delivery status. It should be updated after each meaningful task so the project stays anchored to a visible roadmap instead of drifting through ad hoc changes.

## Final Target Architecture

### Real-time diagnostic spine
- `route.ts` remains the live orchestrator
- `clinical-matrix.ts` remains the sole controller for urgency, next-question selection, and differential ordering
- NVIDIA path stays primary for live production traffic:
  - `Qwen 3.5 122B` for extraction
  - `Llama 3.3 70B` for phrasing
  - `Nemotron Super 49B v1.5` for verifier gating
  - `Llama 3.2 11B / 90B / Kimi` for current vision tiers
  - `Nemotron Ultra 253B` for final diagnosis
  - `GLM-5` for safety
  - `MiniMax` for memory compression

### Hugging Face sidecar layer
- `vision-preprocess-service`
  - Grounding DINO
  - SAM2.1
  - Florence-2
- `text-retrieval-service`
  - BGE-M3
  - BGE-Reranker-v2-M3
- `image-retrieval-service`
  - BiomedCLIP
- `multimodal-consult-service`
  - Qwen2.5-VL-7B-Instruct
- `async-review-service`
  - Qwen2.5-VL-32B-Instruct

### Persistent evidence and feedback layer
- structured case memory
- evidence chain
- service telemetry
- shadow comparisons
- outcome feedback capture

### Product and safety layer
- emergency escalation UX
- vet handoff summary
- retrieval-backed reporting
- confidence calibration
- graceful fallback when sidecars fail or time out

## Phase Plan

| Phase | Goal | Status |
| --- | --- | --- |
| 0 | Architecture decisions, docs, service scaffolding, review-agent setup | Complete |
| 1 | App-side sidecar contracts, async review queue, evidence architecture | Complete |
| 2 | Curated live corpus rules, observability, shadow mode hooks, emergency/report UX, outcome feedback capture | Complete |
| 3 | Replace stub HF sidecars with real model-serving implementations | In progress |
| 4 | Deploy sidecars and wire production environment variables | Not started |
| 5 | Run shadow mode with telemetry and compare sidecars against current production path | Not started |
| 6 | Reindex curated dog-only/domain-tagged corpus and verify live retrieval behavior | Not started |
| 7 | Expand emergency UX and vet workflow polish | In progress |
| 8 | Use real outcome feedback to improve thresholds, retrieval quality, and ambiguity handling | Partially started |

## What Is Completed

### Phase 0 complete
- world-class architecture planning docs created
- HF sidecar services scaffolded with Docker and FastAPI contracts
- review-agent configs added under `.codex/agents`
- app-side evidence architecture established

### Phase 1 complete
- symptom checker route wired to sidecar contracts
- async review endpoint added
- evidence chain generation added
- retrieval split into text and image service paths
- sidecar response validation and retry logic added

### Phase 2 complete
- curated live retrieval policy added
  - dog-only filtering
  - live domain filtering
  - mixed/noisy sources kept out of live retrieval
- sidecar observability added
  - latency
  - outcome
  - timeout/fallback notes
  - shadow comparison capture
- vet handoff summary added to reports
- emergency CTA and emergency handoff UI added
- outcome feedback API and UI added
- report storage IDs and feedback linkage added

## Current Position

The codebase is now in active `Phase 3`.

That means:
- the Next.js application is now architecturally ready for the world-class path
- the route, memory model, retrieval, evidence, and UI layers are already prepared for sidecar-backed operation
- working first-pass implementations now exist for all five HF sidecars
- shared app contracts now distinguish sync consults from async review queue submission
- the main unfinished work is deepening real model runtime coverage, deployment wiring, and shadow-mode validation

## What Is Live In The Repo Right Now

### Production app path
- sidecar-aware routing
- evidence-chain-aware reporting
- curated live corpus filtering
- shadow-mode plumbing
- emergency report UX
- outcome feedback capture

### Not yet truly live
- real Grounding DINO, SAM2.1, Florence-2 inference
- production-deployed BGE-M3 retrieval service
- production-deployed BiomedCLIP image retrieval service
- production-deployed Qwen2.5-VL synchronous consult service
- production-deployed Qwen2.5-VL async review worker

### Phase 3 in progress
- `vision-preprocess-service`
  - bearer auth validation
  - base64/URL image decoding
  - heuristic domain/body-region inference
  - image quality scoring
  - lesion-focused crop generation for obvious inflamed skin regions
- `text-retrieval-service`
  - bearer auth validation
  - live Supabase-backed candidate retrieval via knowledge corpus
  - deterministic lexical reranking
  - optional BGE-M3 semantic rerank
  - optional BGE reranker cross-encoder scoring
  - dog-only and requested-domain filtering
- `image-retrieval-service`
  - bearer auth validation
  - live Supabase-backed asset lookup against curated corpus metadata
  - domain-aware source filtering
  - deterministic condition-label and caption scoring
  - optional BiomedCLIP reranking over candidate assets
- `multimodal-consult-service`
  - real Qwen2.5-VL-7B service implementation merged from MiniMax branch
  - strict bearer auth and stub/production mode hardening
- `async-review-service`
  - real Qwen2.5-VL-32B service implementation merged from MiniMax branch
  - deterministic review IDs and explicit queue submission contract

## Immediate Next Tasks

### Phase 3: Replace stubs with real sidecars
1. Implement `vision-preprocess-service` with real model loaders and inference flow.
2. Implement `text-retrieval-service` with embeddings + reranking over the local corpus.
3. Implement `image-retrieval-service` with BiomedCLIP over curated dog-only assets.
4. Implement `multimodal-consult-service` with Qwen2.5-VL-7B.
5. Implement `async-review-service` with Qwen2.5-VL-32B batch-style review.

### Phase 4: Deployment and production wiring
1. Deploy the sidecars to GPU-backed infrastructure.
2. Set production env vars.
3. Verify service health and contract compatibility.

### Phase 5: Shadow mode rollout
1. Run sidecars in shadow mode first.
2. Track disagreement, latency, timeout, and fallback rates.
3. Promote only when quality and latency clear thresholds.

### Phase 6: Corpus activation
1. Reindex the live corpus with dog-only/domain metadata.
2. Validate that only live-safe assets are returned to the production route.
3. Compare retrieval quality before and after reindex.

### Phase 7: Emergency workflow polish
1. Make ER escalation even more obvious in UI.
2. Improve one-tap handoff flow.
3. Refine vet handoff formatting for real clinic usage.

### Phase 8: Learning loop
1. Collect real outcome feedback volume.
2. Analyze which thresholds should change.
3. Feed findings back into retrieval and ambiguity handling.

## Parallel Execution Split

To move faster without breaking `master`, parallel work should follow explicit file ownership.

### Current checkpoint

- We are in active `Phase 3`.
- MiniMax M2.7 does not have a newer remote push beyond the already merged branch `origin/minimax/phase3-multimodal-async-services`.
- The shared integration layer has started moving from scaffolding into validated contracts:
  - sync consult stays on `multimodal-consult-service`
  - async review now has an explicit queue submission contract
  - retrieval sidecars now support optional model-backed reranking with deterministic fallback
- App-level smoke coverage now exercises all five sidecar contracts through `hf-sidecars.ts` and the async review route.
- Phase 4 prep now has an executable deployment-readiness script for sidecar env and `/healthz` verification.
- Phase 4 verification now also has a dedicated shadow-route probe command for checking the guarded app-side rollout summary path.
- Phase 4 now also has a deployment runbook covering env ownership, rollout order, shadow-mode promotion, and rollback.
- Shadow-mode verification now has a session-level rollout summary helper that turns sidecar observations into per-service promotion status (`ready`, `watch`, `blocked`, `insufficient_data`).
- The next fastest path is to finish app integration, then deploy and shadow the sidecars instead of expanding architecture again.

### Strength-aligned ownership

#### Codex ownership
- `src/lib/vision-preprocess.ts`
- `src/lib/text-retrieval-service.ts`
- `src/lib/image-retrieval-service.ts`
- `src/lib/live-corpus.ts`
- `src/lib/knowledge-retrieval.ts`
- sidecar contract integration in the app
- retrieval verification, curated-corpus reindex, shadow-mode retrieval comparisons
- deployment wiring, integration testing, and production verification

#### MiniMax M2.7 ownership
- `src/lib/multimodal-consult.ts`
- `src/lib/async-review-client.ts`
- review prompts, disagreement-analysis logic, and long-context case comparison behavior
- outcome-feedback mining and shadow-review summarization
- any service-layer reasoning policies for multimodal consult and async review

#### Shared-but-sequenced ownership
- `src/lib/hf-sidecars.ts`
- `src/app/api/ai/symptom-chat/route.ts`
- `plans/DEVELOPMENT_ROADMAP.md`
- production env wiring and deployment config

Shared files should only be changed by one agent at a time after pulling latest `master`.

### Push protocol

When two agents are both pushing directly to `master`, use this order every time:

1. `git pull --rebase origin master` before starting work
2. avoid editing files owned by the other agent
3. `git pull --rebase origin master` again right before push
4. push only after local tests/build for the touched area pass
5. update this roadmap if the phase status or ownership changed

### Lead coordination protocol

After every completed task, Codex should act as the lead coordinator and do all of the following before moving to the next task:

1. verify the completed work locally with the smallest relevant test/build checks
2. sync with `master` and confirm the working tree is clean
3. check GitHub for any new MiniMax M2.7 branch, push, or PR activity
4. review any MiniMax-delivered changes before touching shared files
5. update `Current checkpoint`, `Current Position`, and phase notes in this roadmap if status changed
6. publish the next task split:
   - what Codex handles next
   - what MiniMax M2.7 handles next
   - which files remain shared/blocked
7. only then start the next implementation task

### Default reporting format after each task

Every post-task status update should answer these questions clearly:

- what was just completed
- what phase we are in now
- whether MiniMax M2.7 has pushed anything new
- what Codex will do next
- what MiniMax M2.7 should do next
- whether any shared file is temporarily locked

### Recommended next split

To accelerate Phase 3 right now:

1. Codex picks up:
   - finish shared app integration in `src/lib/hf-sidecars.ts` and `src/app/api/ai/symptom-chat/route.ts`
   - add service smoke/contract verification for all five sidecars
   - continue promoting `vision-preprocess-service` toward real model-backed inference
   - retrieval-side verification and curated-corpus validation
2. MiniMax M2.7 picks up:
   - improve `multimodal-consult-service` output quality and prompt discipline
   - improve `async-review-service` persistence/retry/callback behavior
   - shadow disagreement review prompts and outcome-analysis logic
3. After both land:
   - Codex handles deployment verification, shadow-mode checks, and roadmap status updates

## Definition Of Done For The World-Class Path

The architecture is considered complete only when all of the following are true:
- real HF sidecars replace the stubs
- production env wiring is complete
- shadow mode has been run and evaluated
- live retrieval uses the curated dog-only/domain-safe corpus
- urgent image cases route correctly with evidence and fallback behavior
- outcome feedback is not just captured, but actively used for improvement

## Update Rule

After every meaningful implementation task:
- update the current phase status
- move completed items from "Immediate Next Tasks" into "What Is Completed"
- keep the current position line accurate
