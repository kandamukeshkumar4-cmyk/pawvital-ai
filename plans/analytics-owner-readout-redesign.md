# Analytics Owner-Readout Redesign

**Goal:** Replace the confusing 5-widget "Health Analytics" dashboard (evidence-coverage
ring, wellness index number, urgency donut, top-symptoms bar, severity scatter) with a
calming, plain-language readout that answers what a worried dog owner actually asks:
*"Is my dog okay, and what do I do?"*

Grounded in 3 parallel research passes (owner-needs research, calming-health-UX design
spec, full code map). Sources cited in those agent reports.

## Design (top-to-bottom, single column, mobile-first)
1. **Hero verdict card** — ONE 4-state answer from the latest check's deterministic
   `urgency`: Watch at home / Plan a vet visit / Call your vet today / Emergency.
   Status ring (color = state, fill = latest check confidence), plain headline + reassuring
   sub-line, always-present "call a vet" path. Never diagnoses, never gives all-clear.
2. **Recovery trend strip** — the ONLY chart: a minimal wellness sparkline framed by a
   plain-language verdict ("Bella seems to be improving"), derived from
   `snapshot.baselineShift.direction`. Falls back to a text state when <3 checks.
3. **Recent signs** — plain chips from the latest check (replaces the bar chart).
4. **"See the full details"** — collapsed `<details>` accordion holding the ORIGINAL
   widgets (ProductIntelligencePanel + urgency donut + top symptoms + severity chart) and
   the save-snapshot persistence flow. Nothing is deleted; power/vet use preserved.
5. **Safety footer** — standing not-a-diagnosis / contact-your-vet disclaimer.

## Empty / low-data states (the 1-check case is the COMMON case)
- 0 checks → friendly "start a check" hero, no empty chart frames.
- 1 check → real verdict from that check; trend shows text, not a 1-point line.
- 2 checks → verdict + cautious 2-point trend ("not enough yet to call a trend").
- 3+ → full trend verdict.

## Safety guardrails (hard rules in copy)
- Never diagnose, never give the all-clear, never recommend treatment/dose.
- Every state keeps a visible "contact a vet" path; always defer to a real vet.
- Verdict + trend come ONLY from deterministic triage state (urgency, baselineShift).
  The presentation layer re-phrases; it never decides medical meaning.

## Files
- NEW `src/lib/analytics/owner-readout.ts` — pure mapper (entries+snapshot → view model). Tested.
- NEW `src/components/analytics/owner-status-hero.tsx`
- NEW `src/components/analytics/recovery-trend-strip.tsx`
- NEW `src/components/analytics/recent-signs.tsx`
- EDIT `src/components/analytics/index.ts` — export new components.
- EDIT `src/app/(dashboard)/analytics/page.tsx` — new layout; old grid → accordion.
- NEW `tests/owner-readout.test.ts` — mapper unit tests (verdict/trend/data-state).

## Verification
- `npx jest tests/owner-readout.test.ts` green.
- `npm run build` passes.
- Real browser test on the running preview: demo mode (9 checks) + low-data behavior.

## Status: COMPLETE (2026-06-18)
- Mapper unit tests: 9/9 green (`tests/owner-readout.test.ts`).
- `npx tsc --noEmit`: clean. `npx eslint <changed>`: clean.
- `npm run build`: passed; `/analytics` prerenders static (○), 66/66 pages.
- Server-side render confirmed via preview (header + h1 present).
- Dedicated read-only review pass: verdict SHIP, no blocking findings; the one
  SHOULD-FIX (2-point line under "no trend yet") resolved — chart now shows only
  at 3+ checks.
- Note: local demo-mode browser render stalls on the app's root `loading.tsx`
  Suspense for EVERY route (dashboard included) — a pre-existing app-shell
  behaviour with no `.env.local`, unrelated to this change. Authed prod renders
  normally; verify the visual there.
