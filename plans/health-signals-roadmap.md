# PawVital "Health Signals" — Owner Analytics Roadmap

Owner-validated brief (2026-06-18): the Analytics screen must answer, in order,
(1) what should I do now, (2) better/worse/same, (3) what changed, (4) what to
track next, (5) what to share with the vet — and must NOT show internal/debug
widgets (evidence ring, coverage %, wellness-index number, baseline-shift debug,
persistence allowed/blocked) or fake metrics we don't have data for.

## Phase 1 — Owner Analytics transformation ✅ SHIPPED (PR after #666)
Default owner view, top-to-bottom:
1. Hero verdict ("Call your vet about Bruno soon" + next action) — from deterministic `urgency`.
2. Trend strip ("too early to call a trend" / better-worse-same) — from `baselineShift`.
3. **Why this status** — plain drivers (latest sign + why it matters + recurrence). No diagnosis label.
4. What you told us — sign chips.
5. **Track next** — one adaptive nudge keyed to the latest symptom.
6. **Vet packet** — "N checks · X urgent flags · ready to share" → /history.
7. Collapsed "Full history — useful for your vet" — urgency mix, top signs, severity over time ONLY.
8. Safety footer.
REMOVED from owner view: evidence ring, coverage %, wellness-index number,
baseline-shift debug, persistence allowed/blocked. (Lib computation kept for the
trend; only the debug UI is gone.)
Verifier: tests/owner-readout.test.ts (13/13), tsc/eslint clean, build prerenders
/analytics static, dedicated review = SHIP.

## Phase 2 — Daily Health Log + Smart Follow-Up Prompts ✅ CODE-COMPLETE (deployed; needs migration)
SHIPPED: `supabase-daily-health-log-schema.sql` (idempotent table + RLS + trigger),
`src/lib/health-log/{types,readout}.ts` (pure, 8 tests), `src/app/api/health-log/route.ts`
(GET list + POST upsert; auth + zod + pet-ownership + rate-limit; TABLE_MISSING/DEMO_MODE
graceful), `src/app/(dashboard)/health-log/page.tsx` (form + readout + recent list),
sidebar "Daily Log" nav, and analytics "Track next" now links to /health-log.
Verifier: 21 tests green, tsc/eslint clean, build prerenders, review = SHIP.
**ROLLOUT GATE (still open):** owner must run `supabase-daily-health-log-schema.sql`
in the Supabase SQL editor, then we smoke-test save + read-back on an authed account.
Until then the API returns TABLE_MISSING and the page shows "not switched on yet" — no
breakage, just inert.

### Phase 2b — Daily logs → AI brain ✅ SHIPPED
The symptom-checker REPORT is now history-aware. On `action === "generate_report"`,
the route fetches the pet's recent daily logs and injects a compact owner-reported
summary into the report LLM prompt as SUPPORTIVE context only.
- NEW `src/lib/health-log/context.ts` (`summarizeDailyLogsForContext`, 7 tests) +
  `server-context.ts` (`loadDailyLogContext`, RLS-scoped, graceful null, injects
  only when the name maps to exactly one pet).
- `case_memory.daily_log_context` added to StructuredCaseMemory; preserved across
  compression/recovery beside `vet_record_context`.
- Read ONLY in `buildNarrativeReportPrompt` (LLM narrative). NEVER touches
  deterministic urgency / red flags / matrix / readiness — injected AFTER the
  blocking checks. Clinical-reviewer verdict: SHIP ("daily_log_context touches
  deterministic clinical logic? NO; fencing adequate? YES").
- Verifier: 441 route+health-log tests green, tsc/eslint clean, build passes.
- Follow-ups (non-blocking, from review): prefer pet-id over name match if a
  stable id reaches the route; consider an Objective-section clause.

### Original Phase 2 design notes
The habit loop. Structured daily fields the owner can log in ~30s.

Proposed schema (`supabase-daily-health-log-schema.sql`, idempotent, RLS by owner):
```
public.daily_health_logs (
  id uuid pk, user_id uuid -> auth.users, pet_id uuid -> public.pets,
  log_date date,
  appetite text check in ('normal','reduced','none','increased'),
  water text check in ('normal','less','more'),
  stool text check in ('normal','soft','diarrhea','none','blood'),
  urination text check in ('normal','less','more','straining','none'),
  vomiting_count int default 0,
  energy text check in ('normal','low','high'),
  mood text, weight_kg numeric, meds_given boolean,
  notes text, photo_urls text[] default '{}',
  created_at, updated_at,
  unique(user_id, pet_id, log_date)
)
```
- API: `GET/POST /api/health-log` (list + upsert by pet/date), RLS-scoped.
- UI: a compact log form (reachable from "Track next" CTA and a Journal/Analytics entry point). Pre-fill the field the follow-up prompt asks for.
- Pure logic: `buildHealthLogReadout` (better/worse/same per field vs baseline) — unit-tested. Only show field trends once enough comparable entries exist (no faking).
- Wire into Analytics "Why this status" + "Track next" once data exists.
- ROLLOUT GATE: ship code, user applies the SQL in Supabase SQL editor, then we
  smoke-test logging + read-back on an authed account before relying on it.
  Do NOT blind-ship DB writes to prod without that test.

## Phase 3 — Vet-Ready Health Timeline / Report (after Phase 2)
The payoff. Aggregate symptom checks + daily logs + outcomes into one timeline:
latest concern, severity/urgency, daily logs, meds, weight, notes, outcome, and
"what changed since last check." Reuse existing reports/share + reports/pdf routes
for a shareable PDF. "Vet packet" card becomes the entry point.

## Guardrails (all phases)
- Use real PawVital data only; never fake WHOOP/Fitbit-style metrics or show a
  chart for data we don't have.
- Never diagnose, never give an all-clear, always keep a vet path.
- Deterministic clinical logic stays the source of truth; presentation re-phrases.
