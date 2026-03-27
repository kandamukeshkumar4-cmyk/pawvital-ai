# Hugging Face Sidecar Services

These services define the production contract for PawVital's self-hosted Hugging Face sidecars.

Current status:
- The Next.js app is already wired to these contracts.
- The service implementations in this directory are runnable contract stubs for local integration and deployment plumbing.
- Replace the stub handlers with real model loaders before using them in production traffic.

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
