# Plan 01 — Server-Side Session Integrity for symptom-chat `generate_report` and Red-Flag Escalation

## Goal

The `POST /api/ai/symptom-chat` route trusts the client-supplied `TriageSession` object. With `action: "generate_report"` a forged session can produce a full veterinary report without ever satisfying the deterministic readiness rule (`isReadyForDiagnosis`), and a forged `session.red_flags_triggered` array escalates the conversation to an emergency response without any supporting message content. This plan adds **server-side validation in the route's request-handling layer only**: before honoring `generate_report`, re-verify readiness by calling the existing deterministic function; before escalating on red flags, validate that client-supplied flags are supported by deterministic detection over the actual message history. No clinical logic is changed — the plan only *calls* existing deterministic functions, it does not reimplement or alter them.

## Why

This is a trust-boundary bug: the server's deterministic clinical gates can be bypassed entirely by a client that edits the session JSON. A malicious or buggy client can (a) generate authoritative-looking medical reports from empty interviews, and (b) trigger emergency escalation UI/telemetry at will. Both undermine the project's core invariant that "deterministic clinical logic remains the source of truth."

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- src/app/api/ai/symptom-chat/route.ts src/lib/triage-engine.ts src/lib/clinical/uncertainty-routing.ts tests/symptom-chat.route.test.ts
```

If the output is non-empty for files this plan edits beyond what the plan describes, **STOP and report**.

## Current state (real code, verified at the stamp commit)

### 1. The route destructures and trusts the client session

`src/app/api/ai/symptom-chat/route.ts` lines 1258–1270:

```typescript
    const body: RequestBody = await request.json();
    const {
      messages,
      pet,
      action,
      session: clientSession,
      liveSessionId,
      image,
      imageMeta,
      gateOverride,
    } = body;

    let session = clientSession || createSession();
```

### 2. The `generate_report` path gates only on blocking-critical-info, never readiness

`src/app/api/ai/symptom-chat/route.ts` lines 1318–1341:

```typescript
    if (action === "generate_report") {
      const reportBlockingCriticalInfo = findReportBlockingCriticalInfo(session);
      if (reportBlockingCriticalInfo) {
        return await generateTerminalOutcomeReport({
          session,
          pet: effectivePet,
          terminalOutcome: buildCannotAssessOutcome({
            petName: pet.name || "your dog",
            questionId: reportBlockingCriticalInfo.questionId,
            questionText: reportBlockingCriticalInfo.questionText,
          }),
          verifiedUserId,
        });
      }

      return await generateReport({
        session,
        pet: effectivePet,
        messages,
        image,
        requestOrigin: new URL(request.url).origin,
        verifiedUserId,
      });
    }
```

`findReportBlockingCriticalInfo` lives in `src/lib/clinical/uncertainty-routing.ts` lines 174–204 (NOTE: directory is `src/lib/clinical/`, not `src/lib/`):

```typescript
export function findReportBlockingCriticalInfo(
  session: TriageSession
): ReportBlockingCriticalInfoFinding | null {
  for (const questionId of EMERGENCY_GRADE_CRITICAL_QUESTIONS) {
    if (!isQuestionRelevantToCurrentSession(session, questionId)) {
      continue;
    }
    ...
  }

  return null;
}
```

### 3. The readiness rule exists but runs only on the chat path

`src/app/api/ai/symptom-chat/route.ts` line 2691 (chat path only):

```typescript
    const ready = isReadyForDiagnosis(session);
```

The rule itself, `src/lib/triage-engine.ts` lines 927–951 (DO NOT MODIFY this file):

```typescript
export function isReadyForDiagnosis(session: TriageSession): boolean {
  // Always ready if red flags are triggered
  if (
    session.red_flags_triggered.length > 0 ||
    getCompositeEmergencyRedFlags(session).length > 0
  ) {
    return true;
  }

  // NEVER ready if no symptoms identified yet
  if (session.known_symptoms.length === 0) return false;

  // NEVER ready if fewer than 3 questions have been answered
  // A real vet always asks at least a few follow-up questions
  if (session.answered_questions.length < 3) return false;

  // Check if all critical questions are answered
  const missing = getMissingQuestions(session);
  const criticalMissing = missing.filter((qId) => {
    const qDef = FOLLOW_UP_QUESTIONS[qId];
    return qDef?.critical;
  });

  return criticalMissing.length === 0;
}
```

Note the first clause: `red_flags_triggered.length > 0` makes the session "ready" — so a forged red flag also forges readiness. Validation of red flags (step 2 below) must therefore happen **before** the readiness check.

### 4. Red-flag escalation merges client-supplied flags and escalates on them

`src/app/api/ai/symptom-chat/route.ts` lines 1841–1868. The route does re-derive flags from the **last** user message (`extractDeterministicEmergencyRedFlags`) but then escalates on the union including whatever the client already put in `session.red_flags_triggered`:

```typescript
    const directEmergencyFlags = extractDeterministicEmergencyRedFlags(
      lastUserMessage.content,
      session.known_symptoms
    );
    if (directEmergencyFlags.length > 0) {
      session = {
        ...session,
        red_flags_triggered: Array.from(
          new Set([...session.red_flags_triggered, ...directEmergencyFlags])
        ),
      };
    }

    if (session.red_flags_triggered.length > 0) {
      session = transitionToEscalation({
        session,
        redFlags: session.red_flags_triggered,
        reason: "deterministic_emergency_first_turn",
      });

      return NextResponse.json(
        buildRedFlagEmergencyResponse({
          petName: pet.name,
          redFlags: session.red_flags_triggered,
          session,
        })
      );
    }
```

## Steps

> Every edit in this plan lives in `src/app/api/ai/symptom-chat/route.ts` (request-handling/validation layer) and `tests/`. Calling existing exported functions from `src/lib/triage-engine.ts` is allowed; editing that file is FORBIDDEN.

1. **Baseline.** Run the existing route tests to confirm a green start.
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all tests pass, exit 0. If any fail before you change anything, STOP and report.

2. **Validate client-supplied red flags against the message history.** In `route.ts`, immediately after `let session = clientSession || createSession();` (line 1270), add a validation helper (defined near the other route-local helpers in the same file, NOT exported — the route must keep exporting only `POST`). The helper re-derives the set of red flags supported by the actual conversation: run `extractDeterministicEmergencyRedFlags(message.content, session.known_symptoms)` over every `role === "user"` message in `messages` (the same function the route already imports and uses at line 1841), union the results, and intersect `session.red_flags_triggered` with that derived set, e.g.:

   ```typescript
   function validateClientRedFlags(
     session: TriageSession,
     messages: { role: "user" | "assistant"; content: string }[]
   ): TriageSession {
     if (session.red_flags_triggered.length === 0) return session;
     const derived = new Set<string>();
     for (const m of messages) {
       if (m.role !== "user") continue;
       for (const flag of extractDeterministicEmergencyRedFlags(
         m.content,
         session.known_symptoms
       )) {
         derived.add(flag);
       }
     }
     const validated = session.red_flags_triggered.filter((f) => derived.has(f));
     if (validated.length === session.red_flags_triggered.length) return session;
     console.warn(
       `[session-integrity] Dropping ${session.red_flags_triggered.length - validated.length} client red flag(s) not supported by message history`
     );
     return { ...session, red_flags_triggered: validated };
   }
   ```

   **AMBIGUITY CHECK before writing this:** inspect how `getCompositeEmergencyRedFlags(session)` (used by `isReadyForDiagnosis`) and any composite-flag writers populate `red_flags_triggered`. If you find code paths that legitimately add flags to `red_flags_triggered` that `extractDeterministicEmergencyRedFlags` over user messages can NOT reproduce (e.g. composite flags derived from `extracted_answers`, vision-derived flags), the simple intersection above would wrongly drop legitimate flags mid-conversation. In that case you MUST also accept flags reproducible from those deterministic sources (call the same deterministic functions over the session's answers), or — if you cannot enumerate the legitimate sources with certainty — **STOP and report the ambiguity instead of guessing**.
   - Gate: `npx tsc --noEmit` → exit 0, no output.

3. **Apply the validation before both consumers.** Call `session = validateClientRedFlags(session, messages);` once, after line 1270 (after `let session = ...`) and before the `action === "generate_report"` branch at line 1318, so both the report path and the chat escalation path (line 1854) see only validated flags.
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all existing tests still pass. If a previously passing test now fails, your validation dropped a legitimate flag — STOP, revert step 3, and report which test and which flag.

4. **Enforce readiness on `generate_report`.** Inside the `if (action === "generate_report")` block, after the existing `findReportBlockingCriticalInfo` check (keep it — it must stay first so terminal "cannot assess" outcomes are unchanged), and before `return await generateReport(...)`, add:

   ```typescript
   if (!isReadyForDiagnosis(session)) {
     statusCode = 409;
     return NextResponse.json(
       {
         error: "Session is not ready for report generation",
         code: "SESSION_NOT_READY",
         ready_for_report: false,
       },
       { status: 409 }
     );
   }
   ```

   `isReadyForDiagnosis` is already imported by the route (it is used at line 2691) — verify the import exists; if not, add it to the existing `@/lib/triage-engine` import.

   **AMBIGUITY CHECK:** Before adding this, search the client (`src/app/(dashboard)/symptom-checker/page.tsx`) for how `generate_report` is invoked. The legitimate client only calls `generate_report` after receiving `ready_for_report: true` from the chat path (which implies `isReadyForDiagnosis` returned true server-side) or after an emergency/terminal response. If you find a legitimate client flow that calls `generate_report` on a session where `isReadyForDiagnosis(session)` is false AND `findReportBlockingCriticalInfo(session)` is null (e.g. emergency summaries on first turn — note `isReadyForDiagnosis` returns true when red flags are present, so genuine emergencies pass), **STOP and report** — do not weaken the check to make it fit.
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all existing tests pass. If an existing test legitimately generates a report from a not-ready session, that is exactly the ambiguity above — STOP and report it; do not edit the test to pass.

5. **Add regression tests.** Extend `tests/symptom-chat.route.test.ts` (the existing route test file — follow its mocking and request-building patterns) with at least:
   - *Forged-session report rejected*: POST with `action: "generate_report"` and a session with `known_symptoms: []`, `answered_questions: []`, `red_flags_triggered: []` → expect HTTP 409 and `code: "SESSION_NOT_READY"`, and assert the report-generation model call was NOT made.
   - *Injected red flags do not escalate*: POST with `action: "chat"`, a benign message history (e.g. single user message "my dog seems a little tired"), and a session whose `red_flags_triggered` contains a real flag id copied from `extractDeterministicEmergencyRedFlags`'s source — expect the response NOT to be the emergency type, and the returned session's `red_flags_triggered` not to contain the injected flag.
   - *Genuine red flag still escalates* (no regression): a user message that deterministically triggers a red flag (copy an input already used by an existing emergency test in this file or in `tests/clinical-intelligence/emergency-sentinel.test.ts`) → emergency response still returned.
   - Gate: `npm test -- --runTestsByPath tests/symptom-chat.route.test.ts` → all pass.

6. **Full gate.**
   - Gate: `npm test -- --testPathPattern=symptom-chat` → all pass.
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint src/app/api/ai/symptom-chat/route.ts tests/symptom-chat.route.test.ts` → 0 errors (warnings allowed; repo baseline has 50 warnings / 0 errors).

## Repo conventions

- Package manager: npm. Tests: Jest 30 via ts-jest (CJS, `useESM: false`), `@/` maps to `./src/`, test environment `node`.
- ESLint 9 flat config; run `npx eslint <file>`.
- Route test exemplar: `tests/symptom-chat.route.test.ts` (mocks module dependencies with `jest.mock`, builds `Request` objects directly, dynamic-imports the route).
- The route file must keep exporting only `POST` (verified: the only `export` in route.ts is `export async function POST` at line 1214). Adding another export breaks Next.js route-export validation (see comment in `next.config.ts:54-56`).

## Out of scope

- ANY edit to `src/lib/triage-engine.ts`, `src/lib/clinical-matrix.ts`, `src/lib/symptom-memory.ts`, `src/lib/clinical/uncertainty-routing.ts` — deterministic clinical logic is the source of truth and must not change.
- Changing what `findReportBlockingCriticalInfo` blocks, changing question criticality, changing red-flag definitions.
- Server-side session persistence / signing (a larger architectural fix; not this plan).
- Body-size caps (Plan 02) and gate-override binding (Plan 05) — same file; coordinate via the index's serialization order.

## STOP conditions

- The quoted code is not found at (or near) the stated lines in `route.ts`, `triage-engine.ts`, or `uncertainty-routing.ts`.
- The drift check shows changes to `route.ts` you did not make.
- Any existing symptom-chat test fails for a reason you cannot trace directly to your added validation.
- You discover legitimate red-flag sources that user-message re-derivation cannot reproduce and cannot enumerate them with certainty (step 2 ambiguity check).
- You discover a legitimate client flow that calls `generate_report` on a not-ready session (step 4 ambiguity check).
- The fix would require modifying any clinical file. **Any behavior ambiguity at all = STOP and report; do not guess.**
