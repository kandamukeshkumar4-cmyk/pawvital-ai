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

Expected paths:
- `/healthz`
- `/infer`
- `/search`
- `/consult`
- `/review`

### Step 2: Wire app envs

Set the app-side `HF_*` URLs to the deployed endpoints and set `HF_SIDECAR_API_KEY`.

Recommended first pass:
- configure all five URLs
- set `HF_SIDECAR_SHADOW_MODE=true`
- leave the service-specific flags unset unless selectively testing

### Step 3: Verify env and health

Run:

```bash
npm run verify:sidecars:env
npm run verify:sidecars:health
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

### Step 6: Compare before promotion

Review:
- service latency
- timeout rate
- fallback rate
- disagreement count
- whether shadow outputs are cleaner than the live fallback path

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
