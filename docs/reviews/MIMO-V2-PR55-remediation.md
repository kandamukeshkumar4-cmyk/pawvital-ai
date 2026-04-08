# Mimo v2 Pro review — remediation notes (PR #55)

Apply these changes on your machine if the IDE cannot write certain API files (EPERM).

## 1. `src/app/api/breeds/route.ts` — env-based URLs + rate limit

- Read list URLs from `process.env.DOG_BREED_API_URL` / `process.env.CAT_BREED_API_URL` with the current public URLs as **defaults** (not secrets; allows private mirrors or air-gapped hosts).
- Optional API keys: `THEDOGAPI_API_KEY` / `THECATAPI_API_KEY` as `x-api-key` when set.
- Reuse `generalApiLimiter` + `checkRateLimit` + `getRateLimitId` like `outcomes/route.ts`.

## 2. `src/app/api/pets/[id]/route.ts` — not SQL injection; fix **mass assignment**

Supabase’s JS client uses parameterized PostgREST calls; string-concat SQL injection is not what `update()` does. The real issue is **arbitrary column overwrite** from `...body`.

Use `sanitizePetUpdateBody` from `src/lib/pet-update-payload.ts`:

```typescript
import { sanitizePetUpdateBody } from "@/lib/pet-update-payload";

// inside PUT, after auth checks:
const sanitized = sanitizePetUpdateBody(body);
if (!sanitized.ok) {
  return NextResponse.json({ error: sanitized.error }, { status: 400 });
}

const { data: pet, error } = await supabase
  .from("pets")
  .update(sanitized.data)
  .eq("id", id)
  .select()
  .single();
```

Soft-delete `update({ deleted_at: new Date().toISOString() })` stays a **literal** object — no change needed for DELETE semantics.

## 3. `src/app/api/notifications/[id]/route.ts` — generic client errors

- On **500** responses return `{ error: "Something went wrong. Try again later." }` only.
- Keep `console.error("[Notifications] ...", error)` with the real `error` server-side.
- **401 / 404** can stay specific (`Unauthorized`, `Notification not found`).
- Replace any `NextResponse.json({ error: error.message })` that leaks DB/provider strings.

## 4. `src/app/api/ai/symptom-chat/route.ts` — Rule 1 / clinical logic

**Merged in repo:** `src/lib/clinical/llm-narrative-contract.ts` documents that prompts are narrative-only; `CLINICAL_ARCHITECTURE_FOOTER` is appended to the Qwen extraction prompt so the model sees the contract. Further prompt chunks can move into the same module over time.

---

## 4b. (Historical) Rule 1 / clinical logic — full refactor scope

**Accurate architecture:** urgency and next-question flow are driven by `clinical-matrix` + `triage-engine` + conversation state; LLM prompts format and narrate.

**Practical compliance:** extract large static prompt sections into e.g. `src/lib/clinical/llm-report-style-guide.ts` with a file header stating that **no medical branching** lives in that module—only narrative/schema instructions. Import from `route.ts`. Full removal of all clinical wording from prompts is a multi-sprint refactor.

## 5. `src/app/api/outcomes/route.ts` — `petName` on events

If you emit `emit(EventType...., { petName })`, join `symptom_checks` → `pets` and pass `pets.name` (or `"Unknown pet"`). If your branch has no `emit` yet, skip.

## 6. `.env.example`

Document:

```env
# Optional overrides for breed list fetch (defaults: TheDogAPI / TheCatAPI public JSON)
# DOG_BREED_API_URL=
# CAT_BREED_API_URL=
# THEDOGAPI_API_KEY=
# THECATAPI_API_KEY=
```
