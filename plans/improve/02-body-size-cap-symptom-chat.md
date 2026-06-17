# Plan 02 — Request Body Size Cap for symptom-chat

## Goal

`POST /api/ai/symptom-chat` reads its body with a bare `await request.json()` and its payload includes an optional base64 `image` field, so an attacker (or a buggy client) can post arbitrarily large bodies that are buffered and parsed before any size check. Sibling routes already solve this: `symptom-check` has a streaming capped JSON reader (32 KB cap) and `async-review` caps at 10 MB because it also carries base64 images. This plan introduces a capped JSON reader for symptom-chat with a 10 MB limit (sized for legitimate image payloads, matching async-review), returning HTTP 413 consistent with the siblings.

## Why

Unbounded body parsing is a memory-exhaustion / DoS vector on the busiest AI route in the app. The fix is mechanical and the pattern already exists twice in the codebase.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- src/app/api/ai/symptom-chat/route.ts src/app/api/ai/symptom-check/route.ts src/app/api/ai/async-review/route.ts tests/symptom-chat.route.test.ts
```

If the output is non-empty for files this plan edits beyond what the plan describes, **STOP and report**. (Note: if Plan 01 or Plan 05 already landed, `route.ts` will show their diffs — read the current file and confirm line 1258's bare `await request.json()` is still present before proceeding.)

## Current state (real code, verified at the stamp commit)

### 1. symptom-chat parses without a cap

`src/app/api/ai/symptom-chat/route.ts` line 1258:

```typescript
    const body: RequestBody = await request.json();
```

The payload can carry a base64 image — `route.ts` lines 196–205:

```typescript
interface RequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
  pet: PetProfile;
  action: "chat" | "generate_report";
  session?: TriageSession;
  liveSessionId?: string;
  image?: string; // base64 image data (with or without data URL prefix)
  imageMeta?: ImageMeta;
  gateOverride?: boolean;
}
```

### 2. Exemplar: symptom-check's capped streaming reader

`src/app/api/ai/symptom-check/route.ts` line 14:

```typescript
const MAX_REQUEST_BYTES = 32 * 1024;
```

And lines 54–105 (the core of the pattern to copy; full function spans 54–132):

```typescript
async function readJsonBody<T>(
  request: Request,
  maxBytes: number
): Promise<BodyParseResult<T>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: jsonError(
        "Request body too large",
        413,
        "PAYLOAD_TOO_LARGE"
      ),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      response: jsonError("Request body is required", 400, "INVALID_JSON"),
    };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {}

        return {
          ok: false,
          response: jsonError(
            "Request body too large",
            413,
            "PAYLOAD_TOO_LARGE"
          ),
        };
      }

      chunks.push(value);
    }
  } catch { ... }
  ...
}
```

It is used at `symptom-check/route.ts` line 160:

```typescript
  const parsedBody = await readJsonBody<unknown>(request, MAX_REQUEST_BYTES);
```

### 3. Exemplar limit for image-bearing routes: async-review

`src/app/api/ai/async-review/route.ts` lines 14–15:

```typescript
const MAX_CONTENT_LENGTH_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PAYLOAD_LENGTH = 8 * 1024 * 1024;
```

And lines 54–57:

```typescript
function hasOversizedContentLength(request: Request): boolean {
  const contentLength = Number(request.headers.get("content-length") || "");
  return Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH_BYTES;
}
```

**Limit justification:** async-review accepts the same kind of base64 image (`MAX_IMAGE_PAYLOAD_LENGTH = 8 MB` of base64 ≈ 6 MB raw image) plus a session and report, inside a 10 MB total body. symptom-chat carries an image plus messages, pet, and session — the same envelope. Use **10 MB** (`10 * 1024 * 1024`).

### 4. The triplicated helper (stretch goal context)

`readJsonBody` is duplicated in three routes (verified by grep): `src/app/api/ai/health-score/route.ts`, `src/app/api/ai/supplements/route.ts`, `src/app/api/ai/symptom-check/route.ts`.

## Steps

1. **Baseline.**
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all pass, exit 0.

2. **Add the capped reader to symptom-chat.** In `src/app/api/ai/symptom-chat/route.ts`, add a module-level constant `const MAX_REQUEST_BYTES = 10 * 1024 * 1024;` and copy the `readJsonBody`/`decodeUtf8`/`BodyParseResult`/`jsonError` pattern from `src/app/api/ai/symptom-check/route.ts:38-132` as route-local (non-exported) helpers. Do NOT add new exports to this file (the route must keep exporting only `POST`, see `next.config.ts:54-56` comment).
   - Gate: `npx tsc --noEmit` → exit 0, no output.

3. **Replace the bare parse.** Replace line 1258:

   ```typescript
   const body: RequestBody = await request.json();
   ```

   with:

   ```typescript
   const parsedBody = await readJsonBody<RequestBody>(request, MAX_REQUEST_BYTES);
   if (!parsedBody.ok) {
     statusCode = parsedBody.response.status;
     return parsedBody.response;
   }
   const body = parsedBody.value;
   ```

   (The route tracks `statusCode` for telemetry — keep that assignment; see line 1223 `let statusCode = 200;`.)
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all existing tests pass. If existing tests post bodies without a readable stream and now fail with 400, check how `tests/symptom-chat.route.test.ts` builds requests (`new Request(url, { body: JSON.stringify(...) })` produces a readable body — this works with the streaming reader; `tests/azure-maps-route.test.ts` uses the same construction against a streaming parse). If failures persist for unrelated reasons, STOP and report.

4. **Add oversize regression tests** to `tests/symptom-chat.route.test.ts`:
   - POST with header `content-length` greater than 10 MB → expect 413 and `code: "PAYLOAD_TOO_LARGE"` (mirror the request-building style of the existing tests in that file).
   - POST with an actual body string larger than 10 MB (e.g. `JSON.stringify({ image: "a".repeat(10 * 1024 * 1024 + 1), ... })`) without a content-length header → expect 413.
   - A normal small chat request still succeeds (reuse an existing happy-path test as proof — no new test needed if one exists).
   - Gate: `npm test -- --runTestsByPath tests/symptom-chat.route.test.ts` → all pass.

5. **(OPTIONAL stretch goal — skip if anything is unclear.)** Extract the shared reader into `src/lib/http-body.ts` exporting `readJsonBody` + `MAX`-agnostic types, and update the three duplicates (`health-score`, `supplements`, `symptom-check`) plus symptom-chat to import it. Only do this if all three duplicates are byte-for-byte the same logic; if they have diverged, skip this step entirely and note that in your handoff.
   - Gate (only if done): `npm test` → full suite passes; `npx tsc --noEmit` → exit 0.

6. **Full gate.**
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all pass.
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint src/app/api/ai/symptom-chat/route.ts` → 0 errors.

## Repo conventions

- npm; Jest 30 via ts-jest CJS; `@/` → `./src/`; node test environment; ESLint 9 flat config.
- Capped body parsing exemplar: `src/app/api/ai/symptom-check/route.ts:42-132`.
- Image-payload limit exemplar: `src/app/api/ai/async-review/route.ts:14-15, 54-60`.
- Route test exemplar: `tests/symptom-chat.route.test.ts`.

## Out of scope

- `src/lib/triage-engine.ts`, `src/lib/clinical-matrix.ts`, `src/lib/symptom-memory.ts` — no clinical changes. This plan touches only the body-parsing lines at the very top of the request-handling layer.
- Changing the 32 KB cap of symptom-check or the 10 MB cap of async-review.
- Per-field image size validation (async-review's `MAX_IMAGE_PAYLOAD_LENGTH` analog) — acceptable follow-up, not required here.
- Plans 01 and 05 edit the same file — execute serially per the index.

## STOP conditions

- Line 1258 no longer contains the bare `await request.json()` (someone fixed or moved it) — re-assess and report.
- The drift check shows unexplained changes to files this plan edits.
- Any symptom-chat test fails for a reason unrelated to body parsing.
- The change would require touching clinical files or altering response shapes beyond the new 413/400 parse errors.
