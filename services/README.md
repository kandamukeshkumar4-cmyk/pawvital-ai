# Hugging Face Sidecar Services

These services define the production contract for PawVital's self-hosted Hugging Face sidecars.

Current status:
- The Next.js app is already wired to these contracts.
- The service implementations in this directory now provide first-pass runnable sidecar behavior.
- Some services still use heuristic or optional model-backed fallbacks, so production rollout should go through shadow mode first.

Services:
- `vision-preprocess-service` on `:8080` -> `/infer`
- `text-retrieval-service` on `:8081` -> `/search`
- `image-retrieval-service` on `:8082` -> `/search`
- `multimodal-consult-service` on `:8083` -> `/consult`
- `async-review-service` on `:8084` -> `/review`

Run locally:

```bash
docker compose -f docker-compose.sidecars.yml up --build
```

Then point the app to the matching endpoint URLs in `.env.sidecars.example`.

Deployment-readiness verification:

```bash
npm run verify:sidecars:env
npm run verify:sidecars:health
npm run verify:sidecars:readiness
npm run verify:sidecars:shadow
npm run verify:corpus:live
```

Use `npm run verify:sidecars:strict` when you want warnings such as stub mode or missing sidecar URLs to fail the check.

See the full rollout procedure in [G:\MY Website\pawvital-ai\plans\SIDECAR_DEPLOYMENT_RUNBOOK.md](G:\MY Website\pawvital-ai\plans\SIDECAR_DEPLOYMENT_RUNBOOK.md).
