# Plan 03 — Rate Limiting Must Not Fail Open in Production

## Goal

`checkRateLimit` in `src/lib/rate-limit.ts` returns unconditional success when a limiter is `null`, and every limiter is `null` whenever the Upstash env vars are unset — including in production. The library already contains a working in-process fallback limiter (`runLocalFallbackLimiter`) with per-scope configs registered via `registerFallbackConfig`, but today that fallback only engages when Redis is configured *and* errors at call time. This plan makes the production-with-no-Redis case use the in-process fallback limiter instead of granting unlimited requests, while keeping dev/demo (non-production) behavior exactly as permissive as today.

## Why

A production deployment that forgets (or loses) `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` silently runs with **zero** rate limiting on every AI route — cost exposure and abuse exposure with no signal. The fix reuses code that already exists and is already tested.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- src/lib/rate-limit.ts tests/rate-limit.test.ts tests/rate-limit-failover-harness.test.ts
```

If the output is non-empty for files this plan edits beyond what the plan describes, **STOP and report**.

## Current state (real code, verified at the stamp commit)

### 1. Limiters are null when Upstash env is unset

`src/lib/rate-limit.ts` lines 10–23:

```typescript
const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

const isConfigured =
  !!redisUrl &&
  !!redisToken &&
  redisUrl.startsWith("https://");

const redis = isConfigured
  ? new Redis({
      url: redisUrl!,
      token: redisToken!,
    })
  : null;
```

Each limiter passes `null` through when `redis` is null — e.g. lines 64–79:

```typescript
/** Symptom chat: 30 requests per minute per user */
export const symptomChatLimiter = registerFallbackConfig(
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "rl:symptom-chat",
        analytics: true,
      })
    : null,
  {
    limit: 30,
    scope: "symptom-chat",
    windowMs: DEFAULT_FALLBACK_WINDOW_MS,
  }
);
```

Note: `registerFallbackConfig` (lines 44–52) only records the config when the limiter object exists:

```typescript
function registerFallbackConfig<T extends object>(
  limiter: T | null,
  config: RateLimitFallbackConfig
): T | null {
  if (limiter) {
    limiterFallbackConfigs.set(limiter, config);
  }
  return limiter;
}
```

(`limiterFallbackConfigs` is a `WeakMap<object, ...>` — line 41 — so it cannot key on `null`. The unconfigured path therefore cannot reuse the WeakMap as-is; see step 2.)

### 2. The fail-open line

`src/lib/rate-limit.ts` lines 202–206:

```typescript
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitResult> {
  if (!limiter) return { success: true }; // No-op in dev/demo
```

### 3. The existing in-process fallback (already engaged on Redis call-time errors)

`src/lib/rate-limit.ts` lines 162–200 (`runLocalFallbackLimiter`) — counts per `scope:identifier` in a module-level `Map`, enforces `config.limit` per `config.windowMs`, returns `{ success: false, reset, remaining: 0 }` when exceeded and `{ success: true, degraded: true, reason: "redis_unavailable" }` otherwise.

### 4. Existing tests that must keep passing

- `tests/rate-limit.test.ts`
- `tests/rate-limit-failover-harness.test.ts`

There is also a harness script: `npm run verify:rate-limit:failover` (package.json: `"verify:rate-limit:failover": "node scripts/run-rate-limit-failover-harness.cjs"`).

## Steps

1. **Baseline.**
   - Gate: `npm test -- --runTestsByPath tests/rate-limit.test.ts tests/rate-limit-failover-harness.test.ts` → all pass, exit 0.

2. **Make the unconfigured-production path use the local fallback.** Because limiters are `null` when unconfigured, the per-scope config must be reachable without a limiter object. The smallest change consistent with the existing structure:
   - Change `registerFallbackConfig` callers' data flow so that the scope config is recoverable for null limiters. Recommended approach: keep the existing API but additionally key configs by **scope name** in a plain `Map<string, RateLimitFallbackConfig>` populated inside `registerFallbackConfig` regardless of whether `limiter` is null, and change `checkRateLimit`'s signature usage so the null-limiter path can find a config. Since `checkRateLimit(limiter, identifier)` receives only the (null) limiter, the cleanest mechanical option is to have `registerFallbackConfig` return a sentinel: when `limiter` is null **and** `process.env.NODE_ENV === "production"`, you cannot decide at module load time in a testable way — so instead implement the decision inside `checkRateLimit`:

   ```typescript
   if (!limiter) {
     if (process.env.NODE_ENV === "production") {
       logRateLimitNotConfiguredOnce(); // one-time console.warn, copy the throttle pattern of logRateLimitFailure (lines 138-152)
       return runLocalFallbackLimiterForScope(identifier);
     }
     return { success: true }; // No-op in dev/demo
   }
   ```

   where `runLocalFallbackLimiterForScope` reuses the body of `runLocalFallbackLimiter` with a default config (`DEFAULT_FALLBACK_LIMIT = 30`, `DEFAULT_FALLBACK_WINDOW_MS = 60_000`, scope `"default"` — these constants already exist at lines 26–27). Per-scope precision for null limiters is a nice-to-have; if wiring per-scope configs through requires changing every route's call signature, use the default config and note it. Do NOT change `checkRateLimit`'s public signature — 15+ routes call it.
   - Gate: `npx tsc --noEmit` → exit 0, no output.

3. **Add tests for the prod-unset path** in `tests/rate-limit.test.ts` (follow its existing patterns for module isolation — it likely uses `jest.isolateModules`/`jest.resetModules` with env manipulation; read the file first and copy its approach):
   - With `NODE_ENV=production` and Upstash env unset: calling `checkRateLimit(null-limiter, "user-1")` more than the default limit (30) times within the window → the 31st call returns `success: false`.
   - With `NODE_ENV=test` (or anything non-production) and Upstash unset: unlimited calls still return `success: true` (preserves dev/demo behavior).
   - Gate: `npm test -- --runTestsByPath tests/rate-limit.test.ts` → all pass.

4. **Regression gates.**
   - Gate: `npm test -- --runTestsByPath tests/rate-limit.test.ts tests/rate-limit-failover-harness.test.ts` → all pass.
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all pass (the chat route calls `checkRateLimit` first; Jest runs with `NODE_ENV=test`, so behavior there must be unchanged).
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint src/lib/rate-limit.ts tests/rate-limit.test.ts` → 0 errors.

## Repo conventions

- npm; Jest 30 via ts-jest CJS; `@/` → `./src/`; node test environment; ESLint 9 flat config.
- Exemplar for env-sensitive module testing: read `tests/rate-limit.test.ts` and `tests/rate-limit-failover-harness.test.ts` first and mirror their setup (they already exercise the fallback path).
- One-time-warn throttle exemplar: `logRateLimitFailure`, `src/lib/rate-limit.ts:138-152`.

## Out of scope

- Changing limiter quotas (30/10/60/20 per minute) or Upstash configuration.
- Fail-closed hard 429 when unconfigured (the chosen design is the in-process fallback, which is strictly safer than today and doesn't brick a misconfigured prod deploy).
- The usage/billing gate (Plan 06) — different module.
- Clinical files — untouched.

## STOP conditions

- The quoted code is not found at the stated lines in `src/lib/rate-limit.ts`.
- Existing rate-limit tests fail before any change, or fail after the change for reasons you cannot trace to the new prod-unset branch.
- The change cannot be made without altering `checkRateLimit`'s signature (would force edits across many routes) — report instead.
- Jest in this repo turns out to run with `NODE_ENV=production` somewhere (would silently activate the fallback in unrelated tests) — verify, and if so STOP and report.
