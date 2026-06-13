# Plan 06 — Usage Limit Gate: Fail Closed on Database Errors

## Goal

The free-tier usage gate for new symptom-chat conversations (`maybeBuildUsageLimitResponse` in `src/lib/symptom-chat/usage-limit-gate.ts`) swallows **every** error in a catch-all and returns `null`, which means "gate passes". A Supabase outage therefore silently grants unlimited free new chats. This plan distinguishes error types: real database/lookup failures on a new-chat start return a 503-style "try again shortly" response instead of silently granting, while the deliberate permissive paths (demo mode, unauthenticated user, conversation already in progress, emergency bypass) keep returning `null` exactly as today.

## Why

Billing enforcement that fails open under infrastructure errors converts every outage into a free-usage window, and does so invisibly (one `console.error` only). Failing closed for *new* chat starts is safe because in-progress conversations and emergencies are already exempted before the try block.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- src/lib/symptom-chat/usage-limit-gate.ts tests/
```

If the output is non-empty for files this plan edits beyond what the plan describes, **STOP and report**.

## Current state (real code, verified at the stamp commit)

### 1. The deliberate permissive pre-checks (DO NOT CHANGE)

`src/lib/symptom-chat/usage-limit-gate.ts` lines 149–158 (inside `maybeBuildUsageLimitResponse`, which begins at line 144):

```typescript
  if (input.action !== "chat") {
    return null;
  }
  ...
  if (
    hasConversationStarted(input.session) ||
    hasEmergencyUsageGateBypassSignal(input.session, input.messages)
  ) {
    return null;
  }
```

And the by-design unauthenticated pass, lines 160–169:

```typescript
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }
```

### 2. The fail-open catch (THE BUG)

Lines 193–197:

```typescript
  } catch (error) {
    console.error("[Billing] Usage gate failed open:", error);
    return null;
  }
}
```

Note: `createServerSupabaseClient()` throws `Error("DEMO_MODE")` when Supabase is unconfigured (see `src/lib/api-auth.ts:25`: `if (error instanceof Error && error.message === "DEMO_MODE")`). That demo-mode throw currently lands in this same catch and correctly passes — the fix must preserve that.

Also note the lookup helper already throws typed-ish errors — lines 110–112:

```typescript
  if (checksError) {
    throw new Error(`USAGE_COUNT_FAILED:${checksError.message}`);
  }
```

### 3. The existing blocked-response builder (shape exemplar for the new 503)

Lines 117–142 build the 402 response:

```typescript
function buildUsageLimitResponse(
  session: TriageSession,
  usageGate: Pick<
    SymptomCheckUsageGateResult,
    "limit" | "reason" | "remaining" | "requiresUpgrade"
  >
) {
  return NextResponse.json(
    {
      type: "usage_limit",
      code: "FREE_TIER_LIMIT_REACHED",
      error: "Monthly free-tier limit reached",
      ...
      ready_for_report: false,
      conversationState: "idle",
      session: sanitizeSessionForClient(session),
    },
    { status: 402 }
  );
}
```

### 4. How the route consumes the result

`src/app/api/ai/symptom-chat/route.ts` lines 1271–1279: any non-null return is sent to the client as-is:

```typescript
    const usageLimitResponse = await maybeBuildUsageLimitResponse({
      action,
      messages,
      session,
    });
    if (usageLimitResponse) {
      statusCode = usageLimitResponse.status;
      return usageLimitResponse;
    }
```

## Steps

1. **Baseline.** Find existing tests for this module: `rg -l "usage-limit-gate|maybeBuildUsageLimitResponse" tests/`. Run whatever matches (plus the route suite).
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all pass, exit 0.

2. **Split the catch.** In `usage-limit-gate.ts`, replace the catch block (lines 193–196) with logic that:
   - Re-returns `null` for demo mode: `if (error instanceof Error && error.message === "DEMO_MODE") return null;`
   - For everything else (including `USAGE_COUNT_FAILED:*` and subscription-lookup failures), logs `console.error("[Billing] Usage gate unavailable, failing closed for new chat:", error);` and returns a new 503 response built by a sibling helper:

   ```typescript
   function buildUsageGateUnavailableResponse(session: TriageSession) {
     return NextResponse.json(
       {
         type: "usage_limit",
         code: "USAGE_GATE_UNAVAILABLE",
         error: "We couldn't verify your plan usage",
         message:
           "We couldn't verify your plan usage just now. Please try starting your symptom check again in a moment.",
         requires_upgrade: false,
         ready_for_report: false,
         conversationState: "idle",
         session: sanitizeSessionForClient(session),
       },
       { status: 503 }
     );
   }
   ```

   Keep the response `type: "usage_limit"` so existing client handling of the gate envelope degrades gracefully; the distinct `code` lets the UI show a retry message later. Do not change anything before the `try` block.
   - Gate: `npx tsc --noEmit` → exit 0, no output.

3. **Unit tests for the error path.** Locate the existing test file for this gate (step 1 grep). If none exists, create `tests/usage-limit-gate.test.ts` following the mocking style of `tests/symptom-chat.route.test.ts` (mock `@/lib/supabase-server`). Cases:
   - `createServerSupabaseClient` throws `Error("DEMO_MODE")` → returns `null` (unchanged behavior).
   - `supabase.auth.getUser()` resolves `{ data: { user: null }, error: null }` → returns `null` (unauthenticated by design — unchanged).
   - Authenticated user, but the monthly count query yields an error (so `USAGE_COUNT_FAILED:` is thrown) → returns a response with status 503 and `code: "USAGE_GATE_UNAVAILABLE"`.
   - Authenticated user, `createServerSupabaseClient` throws a generic network error → 503 response.
   - Sanity: `action: "generate_report"` → `null` without any Supabase call.
   - Gate: `npm test -- --runTestsByPath tests/usage-limit-gate.test.ts` (or the located existing file) → all pass.

4. **Full gate.**
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all pass (the route consumes this module; in test/demo conditions the pre-checks return `null` before any Supabase call, so existing route tests must be unaffected — if one fails, STOP and report).
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint src/lib/symptom-chat/usage-limit-gate.ts` → 0 errors.

## Repo conventions

- npm; Jest 30 via ts-jest CJS; `@/` → `./src/`; node test environment; ESLint 9 flat config.
- Response-envelope exemplar: `buildUsageLimitResponse` in the same file (lines 117–142, quoted above).
- DEMO_MODE sentinel handling exemplar: `src/lib/api-auth.ts:25`.

## Out of scope

- Plan quotas, `evaluateSymptomCheckUsageGate` logic, private-tester bypass (`shouldBypassUsageLimitForPrivateTester`) — unchanged.
- The unauthenticated permissive path at lines 167–169 — explicitly preserved by design; DO NOT make unauthenticated users hit the gate.
- UI handling of the new `USAGE_GATE_UNAVAILABLE` code (optional follow-up; the generic usage_limit envelope renders acceptably today).
- Clinical files and `route.ts` — untouched (this plan edits only `usage-limit-gate.ts` and tests).

## STOP conditions

- The quoted catch block is not found at/near lines 193–196.
- You cannot determine with certainty how the symptom-checker UI reacts to a `type: "usage_limit"` envelope with an unknown `code` (read `src/app/(dashboard)/symptom-checker/page.tsx`'s `usage_limit` handling first; if it would hard-crash on the new code, STOP and report).
- Any existing test fails for reasons unrelated to the catch-block change.
