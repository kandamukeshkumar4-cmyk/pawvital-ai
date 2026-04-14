# VET-1100 — World-Class Architecture Completion (Revised Execution Plan)

> Canonical execution spec for Phases 3 through 8.
> This file is the tracked source of truth that must stay aligned with `plans/DEVELOPMENT_ROADMAP.md`.

## Summary

- This docs-only prerequisite must land on `master` before any Phase 3 implementation branch opens.
- `plans/SIDECAR_SIZING.md` is a hard gate for `VET-1106`. If the chosen heavy-sidecar topology cannot preserve 20% VRAM headroom and a sync-path latency budget below 6 seconds, infrastructure work pauses and this plan must be amended before provisioning begins.
- Execution remains sequential: one ticket per branch, one PR per ticket, one review path per PR, no phase skips.
- `VET-1114` is split before Phase 8 implementation starts:
  - `VET-1114a` — forward dual-write and proposal-generation logic
  - `VET-1114b` — historical backfill and reconciliation

## Global Safety Rules

These rules are blocking for every sub-ticket:

1. `src/lib/triage-engine.ts` and `src/lib/clinical-matrix.ts` remain the medical authority.
2. `answered_questions`, `extracted_answers`, `unresolved_question_ids`, and `last_question_asked` remain protected deterministic state.
3. Compression remains narrative-only. No protected control-state mutation through summarization.
4. Shadow and telemetry data remain internal-only. No state-transition or service markers reach owner-facing payloads.
5. Deploy-sensitive tickets must fail closed on stale pod registry state, failed health checks, or failed env writes.
6. Every Phase 3 real-runtime sidecar must support `FORCE_FALLBACK=1` and test it before merge.
7. Rollback must stay explicit: single-commit revert for code, plus named teardown steps for infra.
8. Branch naming stays `codex/vet-11xx-<slug>-v1`.

## Phase Gates

- Before `VET-1101`: this plan, the roadmap ownership update, and the sizing doc must exist on `master`.
- Before `VET-1106`: `VET-1101` through `VET-1105` must be green locally with compose-up `/healthz` verification.
- Before `VET-1109`: readiness must show `>=95%` healthy samples over a rolling 24-hour window, sampled every 5 minutes, for at least 288 samples.
- Before any service is marked `ready` in `VET-1110`: the service must also pass the synthetic 2x baseline load test with the agreed p99 and error-rate ceilings.
- Before `VET-1111`: `VET-1102` must already be live in the branch set, because embedding regeneration must use the BGE-M3 runtime that Phase 3 ships.

## Sub-Ticket Sequence

### VET-1101 — vision-preprocess real runtime

- Keep the `/infer` contract unchanged.
- Add real Grounding DINO, SAM2, and Florence runtime behind the contract.
- Preserve the current heuristic bridge path as the explicit fallback on timeout, load failure, or malformed input.
- Required runtime kill switch: `FORCE_FALLBACK=1`.
- Verification:
  - service `pytest`
  - compose-up `/healthz`
  - focused app contract tests

### VET-1102 — text-retrieval BGE default-on

- Keep the `/search` contract unchanged.
- Make BGE-M3 embedding plus BGE reranker the default path over Supabase candidates.
- Preserve the lexical and domain-filter fallback path with explicit degraded reporting.
- Required runtime kill switch: `FORCE_FALLBACK=1`.
- Verification:
  - service `pytest`
  - `/healthz` shows model status
  - focused retrieval Jest/integration coverage

### VET-1103 — image-retrieval BiomedCLIP default-on

- Keep the `/search` contract unchanged.
- Make BiomedCLIP the default ranking path against cached live corpus assets.
- Preserve deterministic condition-label and caption fallback when the model or asset loading fails.
- Required runtime kill switch: `FORCE_FALLBACK=1`.
- Verification:
  - service `pytest`
  - warm cache on boot
  - focused retrieval Jest/integration coverage

### VET-1104 — multimodal-consult refactor then hardening

- Codex-owned. Update roadmap ownership before the branch opens.
- This ticket must land as two commits on one branch:
  1. pure move/rename refactor with zero behavior change
  2. hardening change set
- Target module set:
  - `app/config.py`
  - `app/auth.py`
  - `app/schemas.py`
  - `app/runtime.py`
  - `app/parsing.py`
  - `app/routes/consult.py`
  - `app/routes/compare_cases.py`
  - `app/routes/uncertainty.py`
  - thin `app/main.py`
- Preserve the current consult contract and advisory-only posture.
- Required runtime kill switch: `FORCE_FALLBACK=1`.
- Verification:
  - reviewers inspect the pure refactor commit separately
  - service `pytest`
  - focused app-side consult tests

### VET-1105 — async-review refactor then hardening

- Codex-owned. Update roadmap ownership before the branch opens.
- This ticket must land as two commits on one branch:
  1. pure move/rename refactor with zero behavior change
  2. hardening change set
- Target module set:
  - `app/config.py`
  - `app/auth.py`
  - `app/schemas.py`
  - `app/runtime.py`
  - `app/queue_state.py`
  - `app/callbacks.py`
  - `app/routes/review.py`
  - `app/routes/dead_letter.py`
  - `app/routes/shadow.py`
  - `app/routes/feedback.py`
  - `app/routes/intelligence.py`
  - `app/routes/calibration.py`
  - thin `app/main.py`
- Preserve queue, polling, dead-letter, disagreement, intelligence, and calibration surfaces.
- Required runtime kill switch: `FORCE_FALLBACK=1`.
- Verification:
  - reviewers inspect the pure refactor commit separately
  - service `pytest`
  - focused async-review route/client coverage

### VET-1106 — GPU host provisioning

- Blocked until `plans/SIDECAR_SIZING.md` passes.
- Use the existing RunPod and GPU-host bundle as the base; do not create a parallel infra path.
- The PR must document the chosen pod topology with VRAM math and cost math.
- A full dry-run and throwaway provision/teardown rehearsal is required before live provisioning is allowed.
- Verification:
  - dry-run output
  - throwaway rehearsal logs
  - updated runbook references

### VET-1107 — Vercel env sync and verification

- Extend the existing env-sync flow instead of adding duplicate tooling.
- Add a required `--diff` preview before any write.
- Write only the four heavy-sidecar `HF_*_URL` vars and preserve the live vision URL.
- Verification:
  - env diff
  - write result
  - `/api/ai/sidecar-readiness` confirms `configured=5` and `healthy=5`

### VET-1108 — lifecycle, reconcile, and billing audit

- Extend lifecycle tooling with:
  - `status`
  - `start`
  - `stop`
  - `teardown`
  - `reconcile`
  - billing audit
- `reconcile` must diff RunPod truth against `deploy/runpod/pods.json` and resolve drift explicitly.
- Verification:
  - lifecycle command coverage
  - stale-pod simulation
  - billing report output

### VET-1109 — shadow sampling activation

- Shadow sampling policy is explicit:
  - 100% of `high` and `emergency` cases
  - 5% of routine traffic by deterministic case hash
  - env override allowed for the routine rate
- Routine shadow sampling must auto-disable if:
  - primary-path overhead exceeds `+50ms p95` over a rolling 15-minute window, or
  - shadow error rate exceeds 20%
- Shadow calls remain non-blocking and must not alter case memory or user-visible output.
- Verification:
  - shadow route tests
  - readiness route tests
  - live shadow report

### VET-1110 — promotion thresholds and load validation

- Externalize promotion thresholds from `src/lib/shadow-rollout.ts`.
- Align the reporting script to the real summary shape the route emits.
- No service can reach `ready` until it also passes a synthetic load test at 2x baseline RPS with explicit p99 and error-rate ceilings.
- Verification:
  - summary tests
  - load-test report
  - policy doc update

### VET-1111 — dog-only corpus reindex

- Hard dependency: `VET-1102`.
- The first commit regenerates embeddings with the shipped BGE-M3 runtime.
- The second commit performs deterministic domain backfill and corpus cleanup.
- The reindex must be idempotent and resumable with batch checkpoints and a resume flag.
- Verification:
  - `verify:corpus:live`
  - resume-from-checkpoint test
  - before/after counts

### VET-1112 — retrieval quality harness

- Add a fixed canine retrieval harness and baseline snapshots.
- Compare pre-reindex and post-reindex results for both text and image retrieval.
- Verification:
  - 20 canonical scenarios
  - stored baseline artifacts

### VET-1113 — emergency UX polish

- Presentation-only changes. No triage-logic or threshold changes.
- Improve emergency surfacing, one-tap vet handoff, and urgent-case PDF/share formatting.
- Clinical-reviewer sign-off is required before merge.

### VET-1114a — forward dual-write and proposal logic

- Keep the current `symptom_checks.ai_response` write.
- Add forward dual-write into structured storage for all new outcome feedback.
- Add proposal-generation logic, but keep the output observational only.
- Clinical-reviewer review is required before merge because the proposal algorithm touches medical decision space.

### VET-1114b — historical backfill

- Historical backfill is its own rollback unit.
- Must support dry-run, checkpointing, resumability, and reversible migration steps.
- No automatic threshold application is allowed.

### VET-1115 — admin review dashboard and PR draft flow

- Extend the existing admin dashboard and admin auth path.
- Surface threshold proposals, reviewer notes, and draft-PR generation.
- Generated PRs stay draft-only and must require:
  - one human engineer approval
  - one clinical-reviewer approval
- No ticket in this wave may apply threshold changes directly from the UI.

## Public Interfaces

- Keep stable:
  - all five sidecar endpoint paths
  - `HF_*_URL` app env vars
  - bearer-auth contract
  - app-side sidecar types in `src/lib/clinical-evidence.ts`
- Additive envs only:
  - `FORCE_FALLBACK=1` for each real-runtime sidecar
  - shadow sampling envs for routine sampling override and emergency-only fallback behavior
- Keep `/api/ai/sidecar-readiness` and `/api/ai/shadow-rollout` as the single rollout/debug surfaces.

## Test Plan

- Phase 3:
  - service-level `pytest`
  - compose-up `/healthz`
  - focused Jest contract coverage for `hf-sidecars`, retrieval, and async review
- Phase 4:
  - dry-run
  - diff preview
  - live env verification
  - lifecycle rehearsal
  - rollback drill evidence in PR
- Phase 5:
  - shadow route tests
  - readiness route tests
  - live shadow reporting
  - 2x baseline synthetic load test
- Phase 6:
  - `verify:corpus:live`
  - deterministic reindex resume testing
  - retrieval baseline diffs
- Phase 8:
  - route tests for forward dual-write
  - dry-run backfill validation
  - proposal-generation tests
  - admin auth tests
  - PR-draft approval-path verification

## Definition of Done

The world-class path is complete only when all of the following are true:

- real Hugging Face sidecars replace the current stub-first runtime
- production env wiring is complete
- shadow mode has been run and evaluated with promotion gates
- live retrieval uses the curated dog-only and domain-safe corpus
- urgent image cases route correctly with evidence and fallback behavior
- outcome feedback is not just captured, but actively used to generate reviewable improvement proposals
