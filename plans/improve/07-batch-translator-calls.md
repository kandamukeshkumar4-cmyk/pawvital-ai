# Plan 07 — Batch the Per-Turn Translator Calls in the Symptom Checker UI

## Goal

After every chat turn, `src/app/(dashboard)/symptom-checker/page.tsx` makes three **sequential** `await localizeAssistantText(...)` calls (assistant message, terminal owner message, terminal next-step). Each call can hit `POST /api/azure/translator`. The translator client already supports batching (`requestTranslations` takes `texts: string[]`, batch size 25). This plan collapses the three sequential awaits into one parallel/batched localization step. Client-side only; zero clinical logic.

## Why

Three serial network round-trips per turn add latency to every assistant reply for non-English users, and consume 3× the translator rate-limit budget (20/min per user) for no reason.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- "src/app/(dashboard)/symptom-checker/page.tsx" src/lib/azure/translator-client.ts
```

If the output is non-empty for files this plan edits beyond what the plan describes, **STOP and report**.

## Current state (real code, verified at the stamp commit)

### 1. The three sequential awaits

`src/app/(dashboard)/symptom-checker/page.tsx` lines 615–626:

```typescript
      const assistantText =
        typeof data.message === "string"
          ? await localizeAssistantText(data.message)
          : null;
      const terminalOwnerText =
        typeof data.owner_message === "string"
          ? await localizeAssistantText(data.owner_message)
          : null;
      const terminalNextStepText =
        typeof data.recommended_next_step === "string"
          ? await localizeAssistantText(data.recommended_next_step)
          : null;
```

### 2. The translator client already batches

`src/lib/azure/translator-client.ts` line 40:

```typescript
const TRANSLATOR_ROUTE_BATCH_SIZE = 25;
```

`requestTranslations` (lines 58–87) accepts `texts: string[]` in one POST:

```typescript
async function requestTranslations(
  input: {
    sourceLanguage?: string | null;
    targetLanguage: string;
    texts: string[];
  },
  options: TranslateClientOptions = {},
): Promise<TranslatorRouteResult | null> {
  if (input.texts.length === 0) {
    return null;
  }
  ...
```

And the batch helper (lines 89–118):

```typescript
async function requestTranslationBatches(
  input: {
    sourceLanguage?: string | null;
    targetLanguage: string;
    texts: string[];
  },
  options: TranslateClientOptions = {},
): Promise<string[] | null> {
  const translations: string[] = [];

  for (
    let start = 0;
    start < input.texts.length;
    start += TRANSLATOR_ROUTE_BATCH_SIZE
  ) {
    ...
```

### 3. What `localizeAssistantText` is

Before editing, locate the definition of `localizeAssistantText` in `page.tsx` (search the file). It returns an object with at least `content` and optional `apiContent` (see usage at lines 633–634: `content: assistantText?.content ?? data.message, apiContent: assistantText?.apiContent,`). Read its body to determine whether it already delegates to a function in `translator-client.ts` that could accept multiple texts.

## Steps

1. **Baseline.** Find the translator tests: `rg -l "translator" tests/` and run them.
   - Gate: `npm test -- --testPathPattern=translator` → all pass, exit 0 (if no test file matches, note that and rely on the later gates).

2. **Implement batching.** Two acceptable designs — pick the first that fits what you find in step 3-reading of `localizeAssistantText`:
   - **Preferred (single batched call):** add a `localizeAssistantTexts(texts: (string | null)[])` helper next to `localizeAssistantText` in `page.tsx` (or, if `localizeAssistantText` wraps an exported translator-client function, add the plural variant in `src/lib/azure/translator-client.ts` reusing `requestTranslationBatches`). It collects the non-null strings, sends them in ONE `requestTranslations` call, and maps results back positionally so each input gets `{ content, apiContent }` or `null` exactly as the singular version would produce.
   - **Minimum acceptable (parallel):** replace the three sequential awaits with:

   ```typescript
   const [assistantText, terminalOwnerText, terminalNextStepText] =
     await Promise.all([
       typeof data.message === "string"
         ? localizeAssistantText(data.message)
         : Promise.resolve(null),
       typeof data.owner_message === "string"
         ? localizeAssistantText(data.owner_message)
         : Promise.resolve(null),
       typeof data.recommended_next_step === "string"
         ? localizeAssistantText(data.recommended_next_step)
         : Promise.resolve(null),
     ]);
   ```

   The downstream variables keep the same names and types, so no other lines change.
   - Gate: `npx tsc --noEmit` → exit 0, no output.

3. **Behavior parity check.** Confirm the three result variables are used identically afterwards (lines 628+ use `assistantText?.content ?? data.message` etc.). No fallback behavior may change: when translation is disabled/fails, each variable must still be `null` and the raw English string must render.
   - Gate: `npm test -- --testPathPattern=translator` → all pass.
   - Gate: `npm test -- --runTestsByPath tests/symptom-checker-state-ui.test.ts tests/conversation-state-ui.test.ts` → all pass (these exercise the page's state handling; both files verified to exist in `tests/`).

4. **Full gate.**
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint "src/app/(dashboard)/symptom-checker/page.tsx" src/lib/azure/translator-client.ts` → 0 errors.

## Repo conventions

- npm; Jest 30 via ts-jest CJS; `@/` → `./src/`; node test environment; ESLint 9 flat config.
- Batch-call exemplar: `requestTranslationBatches`, `src/lib/azure/translator-client.ts:89-118`.
- Parallelization rule reference: workspace React best practices §1.5 (Promise.all for independent operations).

## Out of scope

- The translator API route (`/api/azure/translator`) and its rate limiter — unchanged.
- Report-localization paths elsewhere in `translator-client.ts` (`normalizeOwnerTextForClinical`, report string assignment) — unchanged.
- Clinical files — untouched. This is UI-layer latency work only.

## STOP conditions

- The three sequential awaits are not found at/near lines 615–626 of `page.tsx`.
- `localizeAssistantText`'s return shape differs from `{ content, apiContent }` as inferred above — re-read and adapt, or report if ambiguous.
- Any translator or UI-state test fails for reasons unrelated to call ordering.
