# Sidecar Deployment Runbook

This runbook is the operational guide for moving the Hugging Face sidecars from local/test usage into deployed environments. It is intentionally tied to the current code paths in the app and sidecar services so rollout decisions are based on the repo as it exists, not on outdated assumptions.

## Current Rollout Intent

- The Next.js app remains the production authority.
- NVIDIA + clinical matrix stay in charge for live diagnosis and triage.
- Hugging Face sidecars are introduced gradually:
  1. deployed
  2. health-checked
  3. run in shadow mode
  4. compared against the existing path
  5. only then considered for live promotion

### Current hosting reality

- `vision-preprocess-service` has now been validated as a standalone Vercel FastAPI deployment and is reachable at its production alias with working `/healthz` and `/infer` routes.
- `text-retrieval-service`, `image-retrieval-service`, `multimodal-consult-service`, and `async-review-service` currently fail Vercel deployment from their service directories because their Python dependency bundles are roughly `4.6 GB` to `5.3 GB`, far above Vercel's `500 MB` Lambda ephemeral storage ceiling.
- That means Phase 4 is now split:
  1. Vercel wiring for the app and the lightweight vision-preprocess sidecar
  2. alternative hosting for the four heavier model-backed sidecars
- a Docker-native alternative-host bundle now exists at [G:\MY Website\pawvital-ai\deploy\sidecars-gpu-host\README.md](G:\MY Website\pawvital-ai\deploy\sidecars-gpu-host\README.md) so the four heavy sidecars can be stood up behind one reverse proxy without changing the app contract

## Environment Matrix

### Next.js app runtime

These variables are consumed by app-side code such as [G:\MY Website\pawvital-ai\src\lib\hf-sidecars.ts](G:\MY Website\pawvital-ai\src\lib\hf-sidecars.ts), [G:\MY Website\pawvital-ai\src\lib\sidecar-observability.ts](G:\MY Website\pawvital-ai\src\lib\sidecar-observability.ts), and [G:\MY Website\pawvital-ai\src\lib\async-review-client.ts](G:\MY Website\pawvital-ai\src\lib\async-review-client.ts).

| Variable | Required | Purpose |
| --- | --- | --- |
| `HF_VISION_PREPROCESS_URL` | Yes for deployed sidecar usage | App-facing URL to `vision-preprocess-service` `/infer` |
| `HF_TEXT_RETRIEVAL_URL` | Yes for split retrieval | App-facing URL to `text-retrieval-service` `/search` |
| `HF_IMAGE_RETRIEVAL_URL` | Yes for split retrieval | App-facing URL to `image-retrieval-service` `/search` |
| `HF_MULTIMODAL_CONSULT_URL` | Yes for consult sidecar | App-facing URL to `multimodal-consult-service` `/consult` |
| `HF_ASYNC_REVIEW_URL` | Yes for async review sidecar | App-facing URL to `async-review-service` `/review` |
| `HF_SIDECAR_API_KEY` | Strongly recommended | Bearer token shared by the app when calling sidecars |
| `HF_VISION_PREPROCESS_TIMEOUT_MS` | Optional | App timeout for preprocess sidecar |
| `HF_TEXT_RETRIEVAL_TIMEOUT_MS` | Optional | App timeout for text retrieval sidecar |
| `HF_IMAGE_RETRIEVAL_TIMEOUT_MS` | Optional | App timeout for image retrieval sidecar |
| `HF_MULTIMODAL_CONSULT_TIMEOUT_MS` | Optional | App timeout for sync consult sidecar |
| `HF_ASYNC_REVIEW_TIMEOUT_MS` | Optional | App timeout for queue submission |
| `ASYNC_REVIEW_WEBHOOK_SECRET` | Recommended | Shared secret for the app async-review callback endpoint |
| `HF_SIDECAR_SHADOW_MODE` | Optional | Global shadow-mode master switch |
| `HF_SHADOW_VISION_PREPROCESS` | Optional | Service-specific shadow mode flag |
| `HF_SHADOW_TEXT_RETRIEVAL` | Optional | Service-specific shadow mode flag |
| `HF_SHADOW_IMAGE_RETRIEVAL` | Optional | Service-specific shadow mode flag |
| `HF_SHADOW_MULTIMODAL_CONSULT` | Optional | Service-specific shadow mode flag |
| `HF_SHADOW_ASYNC_REVIEW` | Optional | Service-specific shadow mode flag |
| `APP_BASE_URL` or `NEXT_PUBLIC_APP_URL` | Recommended for rollout checks | Base app URL used by verification scripts to hit `/api/ai/shadow-rollout` |

### Sidecar container/runtime variables

These are consumed by the service entrypoints under [G:\MY Website\pawvital-ai\services](G:\MY Website\pawvital-ai\services).

| Variable | Service(s) | Required | Purpose |
| --- | --- | --- | --- |
| `SIDECAR_API_KEY` | All | Recommended | Bearer auth gate on each sidecar |
| `STUB_MODE` | All | Optional | Enables non-model stub behavior |
| `SUPABASE_URL` | Text/Image retrieval | Required for live retrieval | Server-side Supabase base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Text/Image retrieval | Required for live retrieval | Server-side retrieval access key |
| `SUPABASE_TIMEOUT_SECONDS` | Text/Image retrieval | Optional | Supabase request timeout |
| `TEXT_MODEL_ENABLED` | Text retrieval | Optional | Enables BGE-based reranking |
| `TEXT_EMBED_MODEL_NAME` | Text retrieval | Optional | Embed model name |
| `TEXT_RERANK_MODEL_NAME` | Text retrieval | Optional | Cross-encoder reranker name |
| `TEXT_MODEL_MAX_CANDIDATES` | Text retrieval | Optional | Max candidate set for reranking |
| `IMAGE_MODEL_ENABLED` | Image retrieval | Optional | Enables BiomedCLIP reranking |
| `IMAGE_RETRIEVAL_MODEL_NAME` | Image retrieval | Optional | Image retrieval model name |
| `IMAGE_MODEL_MAX_ASSETS` | Image retrieval | Optional | Max image candidates for model scoring |
| `IMAGE_FETCH_TIMEOUT_SECONDS` | Vision/Image retrieval | Optional | Image/network timeout |
| `MAX_CALLBACK_RETRIES` | Async review | Optional | Review callback retry limit |
| `CALLBACK_RETRY_DELAY_SECONDS` | Async review | Optional | Initial callback retry delay |
| `MAX_SHADOW_HISTORY` | Async review | Optional | In-memory cap for shadow disagreement storage |

## Rollout Order

### Step 1: Deploy sidecars

Deploy each sidecar service with its own runtime and health endpoint.

Before any live RunPod pod create:

```bash
npm run runpod:plan
npm run runpod:provision:consult
npm run runpod:provision:review
```

Provision commands are dry-run by default and print the approved GPU, VRAM, cost, and latency budget for the role.

Then run the required throwaway rehearsal for each heavy role:

```bash
npm run runpod:rehearse:consult
npm run runpod:teardown:consult
npm run runpod:rehearse:review
npm run runpod:teardown:review
```

Only after those teardown steps succeed should a live create be attempted:

```bash
npm run runpod:provision:consult:confirm
npm run runpod:provision:review:confirm
```

Lifecycle follow-ups now live in the same toolchain:

```bash
npm run runpod:status
npm run runpod:start:consult
npm run runpod:stop:consult
npm run runpod:reconcile
npm run runpod:billing
```

Use `npm run runpod:reconcile:apply` only after reviewing the dry-run drift report.

Expected paths:
- `/healthz`
- `/infer`
- `/search`
- `/consult`
- `/review`

Current result:
- verified on Vercel: `vision-preprocess-service`
- blocked on Vercel footprint: `text-retrieval-service`, `image-retrieval-service`, `multimodal-consult-service`, `async-review-service`
- bridge path available now: `deploy/sidecars-gpu-host/docker-compose.yml` + `deploy/sidecars-gpu-host/Caddyfile`
- hard gate for `VET-1106`: `plans/SIDECAR_SIZING.md`
- approved starting topology for this wave: `consult_retrieval + async_review`

### Step 2: Wire app envs

Set the app-side `HF_*` URLs to the deployed endpoints and set `HF_SIDECAR_API_KEY`.

Recommended first pass:
- configure the URLs that are actually deployed and reachable
- set `HF_SIDECAR_SHADOW_MODE=true`
- leave the service-specific flags unset unless selectively testing

When the real sidecar endpoint URLs are present locally in `.env.sidecars`, `.env.local`, or `.env`, preview the Vercel sync with:

```bash
npm run sync:sidecars:vercel
```

This diff preview touches only the four heavy-sidecar `HF_*_URL` vars and intentionally leaves `HF_VISION_PREPROCESS_URL` unchanged.

Then apply it with:

```bash
npm run sync:sidecars:vercel:apply
```

Apply mode requires the diff preview in the same invocation and writes both preview and production targets.

If the heavy sidecars are being exposed behind one subdomain-based reverse proxy, generate the app-facing `HF_*_URL` values first with:

```bash
npm run render:sidecars:host-envs -- --base-domain sidecars.example.com
```

### Step 3: Verify env and health

Run:

```bash
npm run verify:sidecars:env
npm run runpod:health
npm run verify:sidecars:health
npm run verify:sidecars:readiness
npm run verify:sidecars:shadow
npm run verify:sidecars:vercel
npm run verify:corpus:live
npm run sync:sidecars:vercel
```

Use strict mode when promoting:

```bash
npm run verify:sidecars:strict
```

Strict mode should pass before promotion out of shadow mode.

### Step 4: Confirm app compatibility

The app should still:
- build successfully
- pass targeted sidecar contract tests
- preserve the NVIDIA fallback path when any sidecar is unavailable

Minimum checks:

```bash
node node_modules/jest/bin/jest.js --runInBand tests/hf-sidecars.test.ts tests/async-review.route.test.ts
npm run build
```

### Step 5: Run shadow mode

Enable either:
- `HF_SIDECAR_SHADOW_MODE=true`

or a targeted shadow flag such as:
- `HF_SHADOW_TEXT_RETRIEVAL=true`

In shadow mode:
- the sidecar runs
- the result is logged into observability
- the fallback/live path still drives the app response
- the guarded `/api/ai/shadow-rollout` route can be checked with `npm run verify:sidecars:shadow` to confirm the app can summarize rollout readiness from a real session payload
- the guarded `/api/ai/sidecar-readiness` route can be checked with `npm run verify:sidecars:readiness` to confirm the app can summarize env wiring and live sidecar health from the deployed app boundary

### Step 5.5: Confirm curated corpus readiness

Before turning live retrieval on for production-sensitive image paths, run:

```bash
npm run verify:corpus:live
```

This check confirms that the live corpus registry points at real on-disk dataset folders and highlights any mapped-but-empty image sources that still need curation or ingestion.

### Step 5.6: Confirm Vercel production env wiring

Before declaring Phase 4 complete, run:

```bash
npm run verify:sidecars:vercel
```

This audit checks whether Vercel production has the expected `HF_*` sidecar URLs and at least one debug-route auth secret (`HF_SIDECAR_API_KEY` or `ASYNC_REVIEW_WEBHOOK_SECRET`).

### Step 6: Compare before promotion

Review:
- service latency
- timeout rate
- fallback rate
- disagreement count
- whether shadow outputs are cleaner than the live fallback path
- whether the guarded debug routes are reachable without `401` once secrets are aligned

Use the observability fields stored in session memory and the final report system snapshot.

## Promotion Rules

Do not promote a sidecar out of shadow mode until all of the following are true:

1. `/healthz` stays healthy
2. the app contract tests pass
3. timeouts are acceptable for that service role
4. fallback rate is low enough to be operationally useful
5. the shadow output is at least as good as the current live path

## Rollback Rules

If a deployed sidecar is unstable:

1. turn off its shadow flag or unset its URL
2. rerun:

```bash
npm run verify:sidecars:env
```

3. confirm the app is still on the NVIDIA + matrix fallback path

Rollback is safe because the app code already degrades gracefully when sidecars fail or are unconfigured.
