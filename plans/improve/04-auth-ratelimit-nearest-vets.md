# Plan 04 — Add Auth + Rate Limit to /api/azure/maps/nearest-vets

## Goal

`POST /api/azure/maps/nearest-vets` is the only Azure-backed route with neither authentication nor rate limiting — any anonymous caller can burn Azure Maps quota. Sibling Azure routes use `requireAuthenticatedApiUser` plus a per-user rate limit (exemplar: `speech-token`). This plan applies the identical pattern to nearest-vets, after verifying the only client (`NearestVetFinder`, rendered on emergency reports) sends authenticated same-origin requests so no client change is needed.

## Why

Unauthenticated, unthrottled access to a metered third-party API (Azure Maps) is direct cost exposure and a free proxy for vet-clinic lookups.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- src/app/api/azure/maps/nearest-vets/route.ts src/components/symptom-report/nearest-vet-finder.tsx src/components/symptom-report/full-report.tsx tests/azure-maps-route.test.ts
```

If the output is non-empty for files this plan edits beyond what the plan describes, **STOP and report**. (`full-report.tsx` is read-only context here; note it may be dirty from unrelated landing-page work in the working tree — only its `NearestVetFinder` usage matters.)

## Current state (real code, verified at the stamp commit)

### 1. The unprotected route (full handler)

`src/app/api/azure/maps/nearest-vets/route.ts` lines 17–42:

```typescript
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore(
      { clinics: [], enabled: false, reason: "invalid_location" },
      400
    );
  }

  const record = body && typeof body === "object" ? body : {};
  const location = record as { latitude?: unknown; longitude?: unknown };
  const latitude = asNumber(location.latitude);
  const longitude = asNumber(location.longitude);
  if (latitude === null || longitude === null) {
    return jsonNoStore(
      { clinics: [], enabled: false, reason: "invalid_location" },
      400
    );
  }

  const result = await findNearestEmergencyVets({ latitude, longitude });
  const status = !result.enabled && result.reason === "invalid_location" ? 400 : 200;
  return jsonNoStore(result, status);
}
```

### 2. The exemplar pattern to copy: speech-token

`src/app/api/azure/speech-token/route.ts` lines 39–63:

```typescript
export async function GET(request: Request) {
  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Speech input is unavailable in demo mode",
  });
  if ("response" in auth) {
    return auth.response;
  }

  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request, auth.user.id)
  );
  if (!rateLimitResult.success) {
    return jsonNoStore(
      { error: "Too many requests. Please slow down." },
      {
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000))
          ),
        },
        status: 429,
      }
    );
  }
```

The auth helper, `src/lib/api-auth.ts` lines 17–20:

```typescript
export async function requireAuthenticatedApiUser(input?: {
  demoMessage?: string;
  unauthenticatedMessage?: string;
}): Promise<AuthenticatedApiContext> {
```

It returns `{ response }` (503 `DEMO_MODE` when Supabase is unconfigured, 401 when unauthenticated, 500 on client-creation error) or `{ supabase, user }`.

### 3. The only client — sends plain same-origin fetch (cookies included by default)

`src/components/symptom-report/nearest-vet-finder.tsx` lines 52–63:

```typescript
  const lookupClinics = async (coords: GeolocationCoordinates) => {
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/azure/maps/nearest-vets", {
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
```

And the component gracefully hides itself when the API reports unavailability — lines 42–44 and 65–69:

```typescript
function shouldHideUnavailable(reason: MapsUnavailableReason): boolean {
  return reason === "feature_disabled" || reason === "not_configured";
}
...
      if (!data.enabled) {
        if (shouldHideUnavailable(data.reason)) {
          setHidden(true);
          return;
        }
```

### 4. Where the component renders (auth-context check)

`src/components/symptom-report/full-report.tsx` line 243:

```tsx
          report.severity === "emergency") && <NearestVetFinder />}
```

`FullReport` is rendered in three places (verified by grep): the dashboard symptom-checker page, the dashboard history page, and any **shared report** surface. The shared-report surface is the risk: it may render for unauthenticated viewers. `FullReport` has a `readOnlyShared` prop (`full-report.tsx:43-44`: `/** Public shared view: hide owner-only UI */`). **You must check whether `<NearestVetFinder />` at line 243 is inside a `readOnlyShared` guard.** If the shared/public report view can render `NearestVetFinder` for an unauthenticated viewer, adding 401 to the route changes user-visible behavior — STOP and report (see STOP conditions).

### 5. Existing tests to extend (do not duplicate)

`tests/azure-maps-route.test.ts` exists and tests this exact route — lines 12–37:

```typescript
describe("POST /api/azure/maps/nearest-vets", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns no-store invalid_location for malformed JSON", async () => {
    const { POST } = await import(
      "@/app/api/azure/maps/nearest-vets/route"
    );
    ...
```

There is also `tests/azure-maps.test.ts` (the `findNearestEmergencyVets` lib — not touched) and `tests/nearest-vet-finder.test.ts` (the component — not touched unless behavior changes). An auth+rate-limit route-test exemplar exists at `tests/azure-speech-token.route.test.ts`.

## Steps

1. **Verify the unauthenticated-context question.** Open `src/components/symptom-report/full-report.tsx`, locate line 243 and determine whether `<NearestVetFinder />` renders when `readOnlyShared` is true; also grep for any shared/public page rendering `FullReport` (e.g. `rg "FullReport" src/app --glob "*.tsx"` and check any `share` route). If `NearestVetFinder` can render for an unauthenticated viewer, **STOP and report** — do not proceed to gate the API.
   - Gate: write down the verdict (file + line proving it) in your handoff notes.

2. **Baseline.**
   - Gate: `npm test -- --runTestsByPath tests/azure-maps-route.test.ts tests/azure-speech-token.route.test.ts tests/nearest-vet-finder.test.ts` → all pass, exit 0.

3. **Apply the pattern.** Edit `src/app/api/azure/maps/nearest-vets/route.ts`: at the top of `POST`, before body parsing, add the auth block and rate-limit block copied from `speech-token/route.ts:39-63`, adapted:
   - `requireAuthenticatedApiUser({ demoMessage: "Nearby vet lookup is unavailable in demo mode" })` — but note this route's contract returns `{ clinics: [], enabled: false, reason }` envelopes that the client uses to hide itself. To preserve graceful client behavior in demo mode, map the DEMO_MODE case to the route's own envelope: when auth returns the 503 demo response, instead return `jsonNoStore({ clinics: [], enabled: false, reason: "not_configured" }, 200)` so `shouldHideUnavailable` hides the widget (this matches the component contract quoted above). For the plain unauthenticated case, return the helper's 401 response as-is.
   - Rate limit with `generalApiLimiter` and `getRateLimitId(request, auth.user.id)` (imports from `@/lib/rate-limit` mirroring speech-token's import block).
   - Gate: `npx tsc --noEmit` → exit 0, no output.

4. **Extend `tests/azure-maps-route.test.ts`** (extend — do not create a duplicate file). Following the mock style of `tests/azure-speech-token.route.test.ts` (read it first), add:
   - Unauthenticated request → 401, and `findNearestEmergencyVets` NOT called.
   - Demo mode (Supabase unconfigured / `DEMO_MODE` thrown) → 200 with `{ clinics: [], enabled: false, reason: "not_configured" }`, helper NOT called.
   - Rate-limited request (mock `checkRateLimit` failure) → 429 with `Retry-After` header.
   - Existing happy-path tests updated to mock an authenticated user + passing rate limit so they still pass.
   - Gate: `npm test -- --runTestsByPath tests/azure-maps-route.test.ts` → all pass.

5. **Full gate.**
   - Gate: `npm test -- --runTestsByPath tests/azure-maps-route.test.ts tests/nearest-vet-finder.test.ts tests/azure-speech-token.route.test.ts` → all pass.
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint src/app/api/azure/maps/nearest-vets/route.ts tests/azure-maps-route.test.ts` → 0 errors.

## Repo conventions

- npm; Jest 30 via ts-jest CJS; `@/` → `./src/`; node test environment; ESLint 9 flat config.
- Authenticated Azure route exemplar: `src/app/api/azure/speech-token/route.ts`.
- Auth helper: `src/lib/api-auth.ts:17-20` (`requireAuthenticatedApiUser`).
- Route test exemplars: `tests/azure-maps-route.test.ts` (this route, extend it), `tests/azure-speech-token.route.test.ts` (auth/rate-limit mocking pattern).

## Out of scope

- `src/lib/azure/maps.ts` (`findNearestEmergencyVets`) — unchanged.
- Client changes to `nearest-vet-finder.tsx` — same-origin fetch carries Supabase auth cookies automatically; only change it if step 1 reveals a problem (which is a STOP, not a workaround).
- Clinical files — untouched.
- Other unauthenticated routes — one route per plan.

## STOP conditions

- Step 1 finds `NearestVetFinder` rendered in any unauthenticated context (shared report page, public view) — report the file/line and stop.
- The quoted route code is not found at the stated lines.
- The drift check shows unexplained changes to the route or test file.
- Existing azure-maps tests fail for reasons unrelated to the added auth/rate-limit blocks.
