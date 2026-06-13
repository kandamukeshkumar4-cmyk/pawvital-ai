# Plan 10 — Documentation Sync: README.md and AGENTS.md vs. Reality

## Goal

README.md and AGENTS.md contain verified factual drift: a Postgres `usage_log` rate limiter that does not exist, database tables absent from the schema file, two nonexistent API endpoints, a wrong Next.js version, a wrong description of current lint findings, and a sidecar section that omits the GPU-host deployment path. This plan makes doc-only edits correcting each item to the verified reality. Each item below quotes the current wrong text and gives the replacement.

## Why

These docs are read by every agent at session start (workspace rules mandate it); wrong infrastructure claims (e.g. "Postgres usage_log rate limiting") actively mislead security and billing work.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

**CAUTION:** `README.md` is **dirty in the working tree** (unrelated landing/marketing edits). Read the CURRENT file first and locate each item by its quoted text, not by line number. If a quoted wrong string no longer exists, treat that item as already fixed and skip it (note the skip in the handoff).

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- README.md AGENTS.md
```

Expect README.md to appear (known dirty). For AGENTS.md, any diff = re-read before editing.

## Current state and replacements (every "wrong" quote verified at authoring time)

### Item A — nonexistent endpoints (README.md lines 105–106 at the stamp)

Wrong (current):

```
    ├── POST /api/pets/[id]            → pet profile management
    ├── POST /api/reports              → report generation + sharing
    └── POST /api/triage               → triage session persistence
```

Verified reality: `src/app/api/reports/` contains only `pdf/` and `share/`; `src/app/api/triage/` contains only `next/`. Replacement for the two wrong lines:

```
    ├── POST /api/reports/pdf          → report PDF rendering
    ├── POST /api/reports/share        → shareable report links
    └── POST /api/triage/next          → deterministic next-question step
```

(Before writing, confirm each route directory's HTTP method by opening its `route.ts` — adjust `POST`/`GET` labels to the real exports.)

### Item B — "usage_log rate limiting" in the architecture diagram (README.md line 109)

Wrong (current):

```
        ├── Upstash Redis    — usage_log rate limiting (per user, per day)
```

Verified reality: rate limiting is Upstash sliding-window per minute with an in-process fallback (`src/lib/rate-limit.ts`; e.g. line 69 `limiter: Ratelimit.slidingWindow(30, "1 m"),`). No `usage_log` table exists in `supabase-schema.sql`. Replacement:

```
        ├── Upstash Redis    — sliding-window rate limiting (per user, per minute; in-process fallback)
```

### Item C — "Rate limiting via Postgres" key decision (README.md line 120)

Wrong (current):

```
- **Rate limiting via Postgres.** A `usage_log` table with an indexed `(user_id, created_at)` compound key counts daily requests without an external counter. Falls back gracefully if Redis is unavailable.
```

Replacement:

```
- **Rate limiting via Upstash Redis.** Sliding-window limiters per scope (symptom-chat, image analysis, general API, translator) defined in `src/lib/rate-limit.ts`. When Redis errors at call time, an in-process fallback limiter enforces the same per-scope limits.
```

### Item D — phantom tables in the schema list (README.md lines 197–203)

Wrong (current — the three phantom bullets within the seven-table list):

```
- **`triage_sessions`** — one row per symptom-checker session; stores structured state (`answered_questions`, `extracted_answers`, `urgency_level`)
- **`chat_messages`** — per-turn message log for every triage session; used for report generation and async review
...
- **`usage_log`** — per-user daily AI request counter; `(user_id, created_at)` compound index; rate-limit fallback if Redis is unavailable
```

Verified reality: `supabase-schema.sql` has no `triage_sessions`, `chat_messages`, or `usage_log`. The real session-data table is `symptom_checks` — `supabase-schema.sql` lines 68–77:

```sql
-- Symptom checks
CREATE TABLE symptom_checks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE NOT NULL,
  symptoms TEXT NOT NULL,
  ai_response TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'emergency')),
  recommendation TEXT CHECK (recommendation IN ('monitor', 'vet_48h', 'vet_24h', 'emergency_vet')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Fix: open `supabase-schema.sql`, list every `CREATE TABLE` it actually contains, and rewrite the README's table list to exactly that set (with one-line accurate descriptions; for `symptom_checks` use: "one row per symptom check; stores symptoms text, AI response, severity, and recommendation"). Update the "Seven tables" count to the real number. Also verify whether `outcome_feedback` exists in any schema file (`rg "outcome_feedback" *.sql supabase*.sql` — there may be additional schema files like `supabase-audio-schema.sql`); describe only tables that exist in committed SQL.

### Item E — Next.js version (AGENTS.md line 12)

Wrong (current):

```
PawVital AI is a single Next.js 16.2.1 app (React 19, Tailwind 4, TypeScript 5) with optional Python sidecar microservices under `services/`. Package manager is **npm** (lockfile: `package-lock.json`).
```

Verified reality: `package.json` line 129: `"next": "16.2.6",`. Replacement: same sentence with `Next.js 16.2.6`. (If `package.json` shows a newer version when you run, use THAT version — or, more durably, replace the pinned number with "Next.js 16.x (see `package.json` for the exact pin)".)

### Item F — lint claims (AGENTS.md line 69)

Wrong (current):

```
- The ESLint config uses `eslint/config` with `defineConfig` and `globalIgnores` (ESLint 9 flat config). Pre-existing lint errors exist in test files (`@typescript-eslint/no-explicit-any`) and one `prefer-const` in `symptom-chat/route.ts`.
```

Verified reality (ran `npx eslint .` at authoring time): final summary line was `✖ 50 problems (0 errors, 50 warnings)`; observed warnings are `@typescript-eslint/no-unused-vars` (plus a small number of `@next/next/no-img-element`). Replacement:

```
- The ESLint config uses `eslint/config` with `defineConfig` and `globalIgnores` (ESLint 9 flat config). The repo currently lints with 0 errors and ~50 pre-existing warnings (mostly `@typescript-eslint/no-unused-vars`, a few `no-img-element`); do not introduce new errors.
```

Re-run `npx eslint .` yourself before writing and adjust the counts to what you observe.

### Item G — sidecar hosting omits the GPU-host path (README.md lines 207–219)

Current README sidecar intro:

```
Five optional microservices under `services/`. Run locally via `docker-compose.sidecars.yml` or deploy to HuggingFace Spaces / RunPod.
```

Verified reality — `plans/SIDECAR_DEPLOYMENT_RUNBOOK.md` lines 18–23: `vision-preprocess-service` is validated as a standalone Vercel FastAPI deployment; the four heavy sidecars exceed Vercel's Lambda size limits and use a Docker-native GPU-host bundle at `deploy/sidecars-gpu-host/README.md`. Add after the intro sentence (keep the service table unchanged):

```
Hosting note: `vision-preprocess-service` also runs as a standalone Vercel FastAPI deployment. The four heavier model-backed sidecars exceed Vercel's Lambda size limits and deploy via the Docker GPU-host bundle in `deploy/sidecars-gpu-host/` (see `plans/SIDECAR_DEPLOYMENT_RUNBOOK.md`).
```

## Steps

1. **Read current files.** Open the current (dirty) `README.md` and `AGENTS.md`; locate each item by its quoted wrong text. Skip (and log) any item whose wrong text is already gone.
2. **Apply items A–D and G to README.md**, and E–F to AGENTS.md, exactly as specified above (with the live re-verification noted in D, E, F).
3. **Verification gates** (all must pass):
   - `rg -n "usage_log" README.md` → no matches.
   - `rg -n "triage_sessions|chat_messages" README.md` → no matches.
   - `rg -n "POST /api/reports " README.md` and `rg -n "POST /api/triage " README.md` → no matches (note the trailing space pins the bare paths).
   - `rg -n "16.2.1" AGENTS.md` → no matches.
   - `rg -n "prefer-const" AGENTS.md` → no matches.
   - `rg -n "sidecars-gpu-host" README.md` → at least one match.
   - `npx eslint .` → unchanged result vs. baseline (doc edits cannot affect lint; this proves no stray file was touched): final line reports 0 errors.
   - `git -C "G:\MY Website\pawvital-ai" status --short` → no NEW modified files beyond README.md and AGENTS.md (compare against the pre-existing dirty list).

## Repo conventions

- Doc-only change; no build/test gates needed beyond the greps and the no-op lint check above.
- npm; ESLint 9 flat config (`npx eslint .`).

## Out of scope

- **Deferred (explicitly): the marketing-overclaim rewrite.** `plans/DEVELOPMENT_ROADMAP.md` line 19 records: `| Validated product scope | NEEDS RECONCILIATION | Public claims overstated species support, disease counts, breed counts, and multimodal scope |`. Reconciling public marketing claims is judgment-heavy and is NOT part of this plan — note it as deferred in your handoff.
- Any source-code, schema-SQL, or config change. If a doc statement turns out to be true and the CODE is wrong, do not change code — report.
- The dirty landing-page/auth edits in README's working tree — preserve them; edit only the sections in items A–D, G.

## STOP conditions

- A quoted "wrong" string is absent AND no corrected equivalent exists (the section was deleted entirely) — report instead of re-adding sections.
- `supabase-schema.sql` cannot be reconciled into a simple table list (e.g. multiple conflicting schema files describe the same table) — report the conflict.
- Any verification grep still matches after your edit (you missed an occurrence — fix or report).
