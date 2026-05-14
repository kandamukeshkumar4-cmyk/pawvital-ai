# VET-1489C Shadow Model Readout Prep

## Production

- Production commit: `2b4249f535762d4207be018c769e2b69674edbe4`
- Deployment ID: `dpl_CytjMQn2TEsquS36x3tmqZ5Tnwo8`
- Deployment alias: `https://pawvital-ai.vercel.app`
- Deployment status: `Ready`
- GitHub master status: `success`

## Flags

- `SECOND_OPINION_EXTRACTOR=shadow`
- `GROK_FINAL_SAFETY=shadow`
- `GROK_FINAL_REPORT=off`
- `MODEL_ROUTER_VERSION=v1`
- `XAI_GROK_FINAL_SAFETY_MODEL=grok-4.3`
- `XAI_GROK_FINAL_REPORT_MODEL=grok-4.3`

These match the expected VET-1488 shadow rollout config.

## Secret Presence

- `XAI_API_KEY`: missing
- `GROK_API_KEY`: missing

Because both xAI secret names are missing in Vercel production, Grok final
safety shadow cannot collect real verifier outputs right now. The current
production setup only exercises deterministic fallback and missing-provider
paths for the Grok shadow stream.

## Shadow Capability

### Second-opinion shadow

- Real shadow calls can run if the existing NVIDIA-backed second-opinion path is
  configured in production.
- Owner-visible output must remain unchanged.
- Expected observable outcomes:
  - `second_opinion_used`
  - `second_opinion_failed`
  - `second_opinion_rejected`

### Grok final-safety shadow

- Real shadow calls cannot run until one valid server-only xAI key is present.
- Current observable outcomes are limited to internal fallback/failure telemetry.
- Expected observable outcomes in the current missing-secret state:
  - `grok_safety_failed`
  - `final_safety_fallback`
- Expected observable outcomes after a real xAI secret is added:
  - `grok_safety_used`
  - `grok_safety_failed`
  - `missed_red_flag_detected`
  - `report_claim_removed`
  - `final_safety_fallback`

## Owner-Visible Safety

- Telemetry events are internal only.
- Sidecar/debug markers stay out of owner-facing payloads.
- Model fallback reasons stay internal only.
- `GROK_FINAL_REPORT` remains off.

The internal-only guarantee is covered by the telemetry gate tests and the
existing shadow rollout docs:

- `tests/symptom-chat.telemetry-gate.test.ts`
- `docs/clinical-intelligence/repeat-loop-hallucination-telemetry-gate-codex.md`
- `docs/clinical-intelligence/shadow-model-rollout-config-codex.md`

## Auth And Private-Tester Env Drift

Observed in the pulled production env:

- `NEXT_PUBLIC_SUPABASE_URL` points at the active `gswjpmgxidofwmjngavh` host,
  but the stored value includes a trailing newline character.
- `SUPABASE_URL` still points at the stale
  `cvkdmbgujgcfuqtqgtxv.supabase.co` host.
- `NEXT_PUBLIC_PRIVATE_TESTER_MODE` and `PRIVATE_TESTER_MODE` pull as `false`
  with trailing newline characters.
- `NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY=1` and
  `PRIVATE_TESTER_INVITE_ONLY=1`.
- `NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS=1` and
  `PRIVATE_TESTER_FREE_ACCESS=1`.
- `NEXT_PUBLIC_PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=0` and
  `PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=0`.

This drift does not change the shadow-model verdict by itself, but it is real
production env hygiene debt and should be cleaned before broader rollout
confidence claims.

## Validation

- telemetry gate: PASS
- model router and budget: PASS
- symptom-chat route suite: PASS
- build: PASS
- dangerous benchmark: PASS
- release gate: PASS

## Readout Start Condition

Start the 48-72h shadow readout only when all of the following are true:

- production alias is `Ready`
- production commit matches current `master`
- `SECOND_OPINION_EXTRACTOR=shadow`
- `GROK_FINAL_SAFETY=shadow`
- `GROK_FINAL_REPORT=off`
- `MODEL_ROUTER_VERSION=v1`
- at least one valid server-only xAI key exists:
  - `XAI_API_KEY`, or
  - `GROK_API_KEY`
- dangerous benchmark passes
- release gate passes
- no owner-visible telemetry leakage is observed

## Readout Hold Condition

Hold the readout if any of the following are true:

- both `XAI_API_KEY` and `GROK_API_KEY` are missing
- Grok shadow is expected but only deterministic fallback is executing
- fallback rate cannot be separated from missing-secret behavior
- required internal telemetry events are missing
- unsafe downgrade count is greater than `0`
- emergency recall regresses
- owner-visible telemetry/debug leakage appears
- budget-cap behavior is unclear
- production env drift undermines rollout confidence

## Current Decision

Do not start the 48-72h Grok shadow readout window yet.

Current hold reasons:

1. `XAI_API_KEY` is missing in Vercel production.
2. `GROK_API_KEY` is missing in Vercel production.
3. Grok final-safety shadow cannot collect real verifier outputs.
4. Any current Grok shadow telemetry would be dominated by missing-secret
   fallback behavior rather than real model comparison data.
5. Production auth env drift is still present in `SUPABASE_URL` and in several
   newline-tainted public/private tester flag values.

## Required Next Step

Add the correct server-only xAI secret to Vercel production:

- `XAI_API_KEY`, or
- `GROK_API_KEY`

After that:

1. redeploy production
2. repull production env
3. rerun this gate
4. only then start the 48-72h Grok shadow readout window

## Notes

- Shadow only.
- No live model promotion.
- No runtime clinical behavior change.
- No Grok final report.
- No secret values are recorded in this document.
