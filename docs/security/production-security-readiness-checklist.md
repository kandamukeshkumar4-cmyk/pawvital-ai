# Production Security Readiness Checklist

Use this checklist before deploying the private-tester security stack to
production.

## Release preconditions

- Emergency release gate is green and benchmark expectations are unchanged.
- `npm test`, `npm run build`, `npm audit`, and `npm audit --omit=dev` pass on
  the exact branch being deployed.
- The deployment target uses the canonical production hostname for owner-facing
  links and Stripe redirects.

## Required runtime configuration

### Canonical app URL

- `NEXT_PUBLIC_APP_URL`
  - Required in production.
  - Used by Stripe checkout and report/share link generation.
  - Must be the public HTTPS origin for the deployed app.
  - Do not rely on `VERCEL_URL` as the canonical production URL.

### Async review webhook protection

- `ASYNC_REVIEW_WEBHOOK_SECRET`
  - Required in production when `/api/ai/async-review` is enabled.
  - Used by:
    - `src/app/api/ai/async-review/route.ts`
    - `src/lib/async-review-client.ts`
  - Missing secret fails closed in production.

### Stripe secrets

- `STRIPE_SECRET_KEY`
  - Required for checkout and billing flows.
- `STRIPE_WEBHOOK_SECRET`
  - Required for webhook verification and persistence.
- `STRIPE_PRICE_ID`
  - Required if production should use a specific configured Stripe price.

### Supabase separation

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
  - Never reuse the anon key as a service-role key.
  - Service-role access is for trusted server-side flows only.
  - User-originated routes must still enforce ownership/auth checks before any
    service-role-backed write path executes.

### Rate limiting / abuse controls

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
  - Recommended for shared rate-limit state across instances.
  - If omitted, PawVital now falls back to a local in-memory limiter instead of
    failing open, but production should still provide Redis for consistent
    quota enforcement across replicas.

### Sidecar protection

- `HF_SIDECAR_API_KEY`
  - Required whenever secured sidecar routes are enabled.
- `HF_VISION_PREPROCESS_URL`
- `HF_TEXT_RETRIEVAL_URL`
- `HF_IMAGE_RETRIEVAL_URL`
- `HF_MULTIMODAL_CONSULT_URL`
- `HF_ASYNC_REVIEW_URL`
  - Set only for the services you actually run.

## Auth and session controls

- PawVital currently relies on Supabase Auth for owner sessions.
- This repo does not currently read a local `AUTH_SECRET`, `NEXTAUTH_SECRET`,
  or `SESSION_SECRET`.
- Production session/JWT rotation, cookie policy, and email auth settings must
  be configured in the Supabase project itself before private tester rollout.

## Storage requirements

- Create a private `journal-photos` storage bucket before enabling journal
  uploads.
- Verify bucket permissions only allow authenticated server-mediated access.
- Shared report links rely on database tables/RPC, not a public storage bucket.

## Secret hygiene

- Do not commit real values into `.env.example`, docs, tests, fixtures, or PR
  bodies.
- Use deployment-platform secrets for production values.
- Confirm logs and error responses do not echo raw keys, secrets, or private
  report content.

## Private tester deployment checks

1. Configure the required production env vars in the deployment target.
2. Confirm `NEXT_PUBLIC_APP_URL` matches the production domain exactly.
3. Trigger one authenticated checkout creation and verify redirects stay on the
   canonical domain.
4. Trigger one async-review request in production/staging and confirm missing or
   invalid secrets fail safely.
5. Verify outcome feedback, shared reports, and journal upload still require
   authenticated access/ownership.
6. Verify the `journal-photos` bucket exists and rejected uploads do not expose
   storage internals.
7. Verify admin-only pages remain protected with `ADMIN_OVERRIDE` disabled in
   production.
8. Re-run `npm audit --omit=dev` and `npm audit` in CI for the release branch.

## Fail-safe expectations

- Missing `NEXT_PUBLIC_APP_URL` blocks production Stripe checkout creation.
- Missing `ASYNC_REVIEW_WEBHOOK_SECRET` blocks production async-review queue
  access.
- Missing `STRIPE_WEBHOOK_SECRET` blocks webhook processing.
- Missing `SUPABASE_SERVICE_ROLE_KEY` prevents service-role server helpers from
  initializing.
