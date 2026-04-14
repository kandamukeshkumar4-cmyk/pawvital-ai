# GPU Host Sidecar Bundle

This bundle is the current alternative-host deployment path for PawVital's heavy Hugging Face sidecars.

Use it when:
- `vision-preprocess-service` can stay on Vercel
- `text-retrieval-service`, `image-retrieval-service`, `multimodal-consult-service`, and `async-review-service` are too large for Vercel's Python/Lambda limits
- you want one container-native host with a shared reverse proxy and subdomain routing
- you need the Docker-native bundle while the approved RunPod topology stays `consult_retrieval + async_review`

## What this bundle does

- runs the heavy four sidecars behind `Caddy`
- exposes each sidecar on its own subdomain while preserving the app's expected endpoint paths
- keeps the Next.js app contract unchanged

Subdomain mapping:
- `vision-preprocess.<domain>` -> `/infer`
- `text-retrieval.<domain>` -> `/search`
- `image-retrieval.<domain>` -> `/search`
- `multimodal-consult.<domain>` -> `/consult`
- `async-review.<domain>` -> `/review`

## Setup

1. Confirm `plans/SIDECAR_SIZING.md` still approves the `consult_retrieval + async_review` topology.
2. Preview the RunPod provisioning plan:

```bash
npm run runpod:plan
```

3. Rehearse the throwaway provision/teardown cycle before any live pod create:

```bash
npm run runpod:rehearse:consult
npm run runpod:teardown:consult
npm run runpod:rehearse:review
npm run runpod:teardown:review
```

4. Copy [G:\\MY Website\\pawvital-ai\\deploy\\sidecars-gpu-host\\sidecars.env.example](G:\MY Website\pawvital-ai\deploy\sidecars-gpu-host\sidecars.env.example) to `deploy/sidecars-gpu-host/sidecars.env`
5. Fill in:
- `SIDECAR_BASE_DOMAIN`
- `ACME_EMAIL`
- `SIDECAR_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
6. Start the bundle:

```bash
npm run compose:sidecars:gpu-host
```

7. Generate the app-facing `HF_*_URL` values:

```bash
npm run render:sidecars:host-envs -- --base-domain sidecars.example.com
```

8. Copy the rendered `HF_*_URL` values into `.env.local` or `.env.sidecars`
9. Push them to Vercel:

```bash
npm run sync:sidecars:vercel:apply
```

10. Verify:

```bash
npm run verify:sidecars:vercel
npm run verify:sidecars:readiness
npm run verify:sidecars:shadow
```

## Notes

- This bundle is the deployment bridge for `Phase 4`, not the final hosting verdict forever.
- Live RunPod provisioning is dry-run by default. Use `--confirm` only after the throwaway rehearsal has been provisioned and torn down successfully for that role.
- `multimodal-consult-service` and `async-review-service` still default to stub mode here until a real GPU-capable runtime is attached.
- If you only want the heavy four sidecars on this host, leave `HF_VISION_PREPROCESS_URL` pointed at the live Vercel deployment and ignore the rendered vision line.
