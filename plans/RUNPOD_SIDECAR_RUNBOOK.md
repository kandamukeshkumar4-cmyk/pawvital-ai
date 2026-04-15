# RunPod Sidecar Promotion Runbook

## VET-1203 live split defaults

The first live promotion wave starts at `5%` for these supplemental sidecars:

- `vision-preprocess-service`
- `text-retrieval-service`
- `image-retrieval-service`
- `multimodal-consult-service`

`async-review-service` stays `shadow_only` with `live_split_pct=0`.

Registry defaults live in [src/lib/sidecar-service-registry.json](/G:/MY Website/pawvital-ai-wave2-codex/src/lib/sidecar-service-registry.json:1). Runtime env overrides always win.

## Instant rollback

Set the matching Vercel env to `0` and redeploy:

- `SIDECAR_LIVE_SPLIT_VISION_PREPROCESS=0`
- `SIDECAR_LIVE_SPLIT_TEXT_RETRIEVAL=0`
- `SIDECAR_LIVE_SPLIT_IMAGE_RETRIEVAL=0`
- `SIDECAR_LIVE_SPLIT_MULTIMODAL_CONSULT=0`

This is fail-closed. A zero override disables live traffic immediately without a code revert.

## Verification after change

1. Check [src/app/api/ai/shadow-rollout/route.ts](/G:/MY Website/pawvital-ai-wave2-codex/src/app/api/ai/shadow-rollout/route.ts:1) or call `/api/ai/shadow-rollout` and confirm promoted services report non-zero `effective_live_split_pct`.
2. Confirm `/api/ai/sidecar-readiness` still reports all promoted services healthy.
3. Watch sidecar observations for unexpected `error` or `timeout` spikes.
4. If p95 or fallback behavior regresses, set the affected `SIDECAR_LIVE_SPLIT_*` env to `0`.

## Safety notes

- Promotion only affects supplemental HF sidecars. Deterministic clinical routing stays untouched.
- Any promoted-sidecar failure must fall back silently to the existing primary path.
- Shadow mode can still run independently of live split. `0%` live does not disable shadow sampling.
