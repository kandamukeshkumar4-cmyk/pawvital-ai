# Plan 05 — Server-Bind the Image Gate Override (gateOverride)

## Goal

The symptom-chat image quality gate is skipped whenever the client sends `gateOverride: true` — the server never verifies that it actually issued a gate warning for *this* image. This plan makes the override server-verifiable: when the server returns an `image_gate` response it includes a short-lived signed token (HMAC over the image hash), and an override is honored only when the client echoes a valid token for the same image. UX stays identical — the existing "Analyze anyway" button just passes back a token it received.

## Why

Today any client can set `gateOverride: true` on the first request and bypass the gate entirely for any image, defeating the quality/safety gate's purpose. Binding the override to a server-issued token restores the invariant that the server decides which images were gated.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- src/app/api/ai/symptom-chat/route.ts "src/app/(dashboard)/symptom-checker/page.tsx" tests/symptom-chat.route.test.ts
```

If the output is non-empty for files this plan edits beyond what the plan describes, **STOP and report**. (If Plans 01/02 already landed, `route.ts` will show their diffs — re-locate the gate block by searching for `gateOverride !== true` before proceeding.)

## Current state (real code, verified at the stamp commit)

### 1. The gate block and the unconditional override

`src/app/api/ai/symptom-chat/route.ts` lines 1525–1548:

```typescript
    if (image && shouldRunWoundVision && gateOverride !== true) {
      const gateCacheKey = buildGateCacheKey(imageHash || "", imageMeta);
      const gateWarning =
        session.gate_cache_key === gateCacheKey
          ? readCachedGateWarning(session)
          : await evaluateAndCacheGate(session, gateCacheKey, image, imageMeta);
      if (gateWarning) {
        console.log(
          `[Image Gate] warning=${gateWarning.reason}, label=${gateWarning.topLabel || "n/a"}`
        );
        return NextResponse.json({
          type: "image_gate",
          message: buildImageGateMessage(pet.name, gateWarning),
          session,
          gate: gateWarning,
          ready_for_report: false,
        });
      }
    }

    if (image && shouldRunWoundVision) {
      if (gateOverride === true) {
        console.log("[Image Gate] Override accepted, continuing to vision pipeline");
      }
```

`gateOverride` arrives straight from the request body (`route.ts:1267` in the destructuring; declared in `RequestBody` at line 204: `gateOverride?: boolean;`). The image hash already exists: `route.ts:1284`:

```typescript
    const imageHash = image ? hashImage(image) : null;
```

### 2. The UI sends the override from "Analyze anyway"

`src/app/(dashboard)/symptom-checker/page.tsx` lines 829–838:

```typescript
  const handleAnalyzeAnyway = () => {
    if (!pendingGateImage || loading) return;

    void sendMessage(undefined, {
      imageOverride: pendingGateImage,
      imageMetaOverride: pendingGateImageMeta,
      gateOverride: true,
      appendUserMessage: false,
    });
  };
```

## Steps

1. **Baseline.**
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all pass, exit 0.

2. **Add a small HMAC token helper.** Create `src/lib/symptom-chat/gate-override-token.ts` (new file in the existing `src/lib/symptom-chat/` directory — NOT a clinical file) exporting two functions:

   ```typescript
   import { createHmac, timingSafeEqual } from "crypto";

   const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

   function getSecret(): string {
     return (
       process.env.IMAGE_GATE_OVERRIDE_SECRET?.trim() ||
       process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() ||
       "dev-only-gate-override-secret"
     );
   }

   export function issueGateOverrideToken(imageHash: string, now = Date.now()): string {
     const expiresAt = now + TOKEN_TTL_MS;
     const payload = `${imageHash}.${expiresAt}`;
     const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
     return `${expiresAt}.${sig}`;
   }

   export function verifyGateOverrideToken(
     token: string | undefined,
     imageHash: string,
     now = Date.now()
   ): boolean {
     if (!token) return false;
     const dot = token.indexOf(".");
     if (dot <= 0) return false;
     const expiresAt = Number(token.slice(0, dot));
     if (!Number.isFinite(expiresAt) || now > expiresAt) return false;
     const expected = createHmac("sha256", getSecret())
       .update(`${imageHash}.${expiresAt}`)
       .digest("hex");
     const given = token.slice(dot + 1);
     if (given.length !== expected.length) return false;
     return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
   }
   ```

   Decision note for the executor: the dev fallback secret keeps demo mode working with zero env config (matching the repo's demo-mode philosophy, see `AGENTS.md` "Demo mode"). Stateless HMAC avoids any storage.
   - Gate: `npx tsc --noEmit` → exit 0, no output.

3. **Issue the token with the `image_gate` response.** In `route.ts`, in the gate block quoted above, add to the returned JSON one field: `gate_override_token: issueGateOverrideToken(imageHash || "")`. Do not change any other field of the response.
   - Gate: `npx tsc --noEmit` → exit 0, no output.

4. **Verify the token on override.** Add `gateOverrideToken?: string;` to `RequestBody` (line 196–205) and to the destructuring at line 1259. Change the gate conditions:
   - Compute once, near the gate block: `const gateOverrideAccepted = gateOverride === true && verifyGateOverrideToken(gateOverrideToken, imageHash || "");`
   - Line 1525: `if (image && shouldRunWoundVision && gateOverride !== true)` → `if (image && shouldRunWoundVision && !gateOverrideAccepted)`. NOTE this also changes behavior for `gateOverride: true` **without** a valid token: the gate now runs and, if it warns, returns `image_gate` (with a fresh token) instead of being bypassed. That is the intended fix.
   - Line 1546: `if (gateOverride === true)` → `if (gateOverrideAccepted)` (the log line).
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all existing tests pass. If an existing test sends `gateOverride: true` and expects a bypass, it is exercising the vulnerability — update that test to first obtain a token from an `image_gate` response (or use `issueGateOverrideToken` directly) and note this in the handoff. Any other failure: STOP and report.

5. **Echo the token from the UI.** In `src/app/(dashboard)/symptom-checker/page.tsx`:
   - Where the `image_gate` response is handled (search the file for `"image_gate"`), store `data.gate_override_token` in state alongside the existing `pendingGateImage` (mirror how `pendingGateImage`/`pendingGateImageMeta` are stored and cleared — search for `setPendingGateImage` and `clearPendingGateImage`).
   - In `handleAnalyzeAnyway` (lines 829–838 quoted above), pass the stored token through `sendMessage`'s options (add `gateOverrideTokenOverride` plumbing analogous to `imageOverride`) so the POST body includes `gateOverrideToken`.
   - Clear the stored token wherever `clearPendingGateImage()` is called.
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint "src/app/(dashboard)/symptom-checker/page.tsx"` → 0 errors.

6. **Add regression tests** to `tests/symptom-chat.route.test.ts`:
   - *Override without token rejected*: request with image + `gateOverride: true`, no `gateOverrideToken`, mocked gate evaluation returning a warning → response `type: "image_gate"` (gate NOT bypassed) and response contains a non-empty `gate_override_token`.
   - *Override with valid token accepted*: same request but with `gateOverrideToken: issueGateOverrideToken(<hash of the test image>)` — compute the hash the same way the route does (`hashImage`; if not exported, derive the token by first capturing `gate_override_token` from a prior `image_gate` response within the test) → gate is bypassed (no `image_gate` response; vision path proceeds per existing test mocks).
   - *Expired/garbage token rejected*: `gateOverrideToken: "123.deadbeef"` → `image_gate` returned.
   - Gate: `npm test -- --runTestsByPath tests/symptom-chat.route.test.ts` → all pass.

7. **Full gate.**
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all pass.
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint src/app/api/ai/symptom-chat/route.ts src/lib/symptom-chat/gate-override-token.ts` → 0 errors.

## Repo conventions

- npm; Jest 30 via ts-jest CJS; `@/` → `./src/`; node test environment; ESLint 9 flat config.
- Route-adjacent helper module exemplar: `src/lib/symptom-chat/usage-limit-gate.ts` (same directory, same import style from the route).
- Secret-handling exemplar: `src/app/api/ai/async-review/route.ts:24-26` (`getAsyncReviewWebhookSecret`).
- Route test exemplar: `tests/symptom-chat.route.test.ts`.

## Out of scope

- The gate evaluation logic itself (`evaluateAndCacheGate`, `buildGateCacheKey`, `readCachedGateWarning`) — unchanged.
- `src/lib/triage-engine.ts`, `src/lib/clinical-matrix.ts`, `src/lib/symptom-memory.ts` — untouched; edits in `route.ts` are restricted to the gate block, the `RequestBody` type, the destructuring line, and the new helper import.
- Vision pipeline behavior after a valid override — identical to today.
- Plans 01 and 02 edit the same route file — execute serially per the index.

## STOP conditions

- The gate block is not found at/near lines 1525–1548 (search `gateOverride !== true`; if absent, the gate was restructured — report).
- The `image_gate` handling in `page.tsx` cannot be located by searching `"image_gate"`, or `pendingGateImage` state plumbing differs materially from the description — report rather than improvise a new UI flow.
- Any existing test failure not attributable to the now-closed bypass.
- The change would require touching clinical files.
