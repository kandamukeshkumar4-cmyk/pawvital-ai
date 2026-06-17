# plans/improve — Index

Executable improvement plans derived from the advisor audit + vetting pass. Each plan is self-contained, written for a small executor model with no session context, and stamped against the commit below.

## Git commit stamp

All plans written against HEAD:

```
19d15ac2fb919996212747653c1638aac08f90f1
```

Working tree was dirty at authoring time. Relevant dirty files (executors must read current file state, not assume the stamp):

- `README.md` (Plan 08 edits its checklist; Plan 10 edits several sections)
- `src/app/api/ai/outcome-feedback/route.ts` and `tests/outcome-feedback.route.test.ts` (Plan 09 reads these as-is; STOP if shape diverged)
- Various landing/auth/marketing pages and `src/components/ui/button.tsx`, `src/app/globals.css`, etc. (unrelated; no plan touches them)
- Untracked: `.claude/skills/`, `tmp/` (unrelated)

## The plans

| # | File | Title | Effort | Risk |
|---|------|-------|--------|------|
| 01 | `01-server-session-integrity-symptom-chat.md` | Server-side session integrity for `generate_report` + red-flag escalation | M | Highest-care plan; STOP on any ambiguity |
| 02 | `02-body-size-cap-symptom-chat.md` | 10 MB capped JSON reader for symptom-chat (413) | S | Low |
| 03 | `03-rate-limit-fail-closed-production.md` | In-process fallback limiter when Redis unset in production | S | Low-medium |
| 04 | `04-auth-ratelimit-nearest-vets.md` | Auth + rate limit on `/api/azure/maps/nearest-vets` | S | Low (has a pre-flight STOP check) |
| 05 | `05-server-bind-image-gate-override.md` | HMAC-bound `gateOverride` token | M | Medium |
| 06 | `06-usage-gate-fail-closed.md` | Usage gate returns 503 on DB errors instead of granting | S | Low |
| 07 | `07-batch-translator-calls.md` | Batch/parallelize 3 per-turn translator calls | S | Low |
| 08 | `08-typecheck-script-and-build-gate.md` | `typecheck` script + attempt removing `ignoreBuildErrors` | S | Low (built-in fallback) |
| 09 | `09-owner-outcome-feedback-loop.md` | Owner "did this match?" UI wired to existing outcome API | M | Low-medium (dirty-file caution) |
| 10 | `10-docs-sync-readme-agents.md` | README/AGENTS factual drift corrections | S | Minimal (doc-only) |

## Priority order

Recommended execution order (security/cost exposure first, then quality-of-life, then docs):

1. **01** server-session-integrity (clinical trust boundary)
2. **02** body-size-cap (DoS on the main route)
3. **05** image-gate override binding (gate bypass)
4. **03** rate-limit fail-closed (prod cost exposure)
5. **04** nearest-vets auth (metered API exposure)
6. **06** usage-gate fail-closed (billing exposure)
7. **08** typecheck script + build gate (independent, can run any time)
8. **09** owner outcome feedback loop (product value)
9. **07** translator batching (latency)
10. **10** docs sync (do last so docs reflect any landed changes; Plan 08 also touches README — see dependencies)

## Dependency graph

```
01 ─┐
02 ─┼─ all edit src/app/api/ai/symptom-chat/route.ts → MUST run serially,
05 ─┘  in any order, and EACH must re-run its drift check + re-locate its
       anchor code before editing (line numbers shift after each lands)

08 ── independent (package.json, next.config.ts, README checklist)
03 ── independent (src/lib/rate-limit.ts)
04 ── independent (nearest-vets route + its test)
06 ── independent (usage-limit-gate.ts) — but shares the route's test suite
       gate with 01/02/05; safe to run in parallel, serialize test runs
07 ── independent (symptom-checker page UI + translator client)
09 ── independent (report UI components + outcome-feedback test)
       NOTE: 07 and 09 both may touch src/app/(dashboard)/symptom-checker/page.tsx
       (07 edits it; 09 only reads it) — no conflict, but run 07's drift check after 09 if reordered

08 → 10 : both edit README.md. Land 08 before 10 (10's greps then run
          against the post-08 README). If 10 runs first, 08 must re-locate
          the checklist by content (its plan already says to).
01..09 → 10 : soft dependency — 10 documents current reality; running it
          last avoids documenting state that plans 01–09 are about to change
          (none of 10's items overlap the other plans' claims, so this is
          ordering hygiene, not a hard block).
```

Hard rules:

- **Plans 01, 02, 05 are serial** (same file: `src/app/api/ai/symptom-chat/route.ts`). After each lands, the next must re-verify drift: `git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- src/app/api/ai/symptom-chat/route.ts` will be non-empty — that is expected; the executor must instead confirm its plan's quoted anchor code still exists (each plan names its search anchor) and that the previously-landed plans' diffs account for all changes.
- **Plan 08 before Plan 10** (both edit README.md).
- Every plan touching `src/app/api/ai/symptom-chat/route.ts` must pass `npm test -- --testPathPattern=symptom-chat` as a gate and restrict edits to the request-handling/validation layer.
- Global boundary for ALL plans: `src/lib/triage-engine.ts`, `src/lib/clinical-matrix.ts`, `src/lib/symptom-memory.ts` contain deterministic clinical logic and must not be modified; no plan may alter clinical decision behavior.

## Authoring corrections

Discrepancies found while verifying the audit's citations against the real tree (plans were written to reality):

1. **`uncertainty-routing.ts` path** — audit cited `src/lib/uncertainty-routing.ts`; the real path is `src/lib/clinical/uncertainty-routing.ts` (lines 174–204 confirmed). Plan 01 uses the correct path.
2. **Red-flag escalation nuance (Plan 01)** — the route does re-derive flags from the *last* user message via `extractDeterministicEmergencyRedFlags` (route.ts:1841–1852) before escalating; the vulnerability is that it *merges* with and escalates on client-supplied `session.red_flags_triggered` regardless. Plan 01 describes the real merge-then-escalate code.
3. **`DEVELOPMENT_ROADMAP.md` path** — audit cited repo-root `DEVELOPMENT_ROADMAP.md`; the real path is `plans/DEVELOPMENT_ROADMAP.md` (line 19 "NEEDS RECONCILIATION" confirmed). Plan 10 cites the correct path.
4. **Lint reality (Plan 10, item F)** — re-verified live at authoring time: `npx eslint .` → `✖ 50 problems (0 errors, 50 warnings)`, dominated by `@typescript-eslint/no-unused-vars`. The audit's exact 46/4 breakdown was not re-counted; Plan 10 instructs the executor to re-run eslint and write the observed counts.
5. **`symptom-check` cap constant location** — `MAX_REQUEST_BYTES = 32 * 1024` is at `symptom-check/route.ts:14` (not inside the 42–132 range); `readJsonBody` spans lines 54–132. Plan 02 quotes both accurately.
6. **Azure maps route test exists** — `tests/azure-maps-route.test.ts` exists and already tests `POST /api/azure/maps/nearest-vets` (one auditor was right). Plan 04 extends it rather than creating a new file.
7. **next.config comment staleness confirmed** — `rg "^export " src/app/api/ai/symptom-chat/route.ts` returns only `export async function POST` at line 1214, confirming the `ignoreBuildErrors` justification comment is stale (Plan 08).
8. **README "Seven tables" claim** — the schema list correction (Plan 10 item D) also requires fixing the "Seven tables" count to whatever `supabase-schema.sql` actually contains; the audit didn't mention the count.

## Files in this directory

- `00-index.md` (this file)
- `01-server-session-integrity-symptom-chat.md`
- `02-body-size-cap-symptom-chat.md`
- `03-rate-limit-fail-closed-production.md`
- `04-auth-ratelimit-nearest-vets.md`
- `05-server-bind-image-gate-override.md`
- `06-usage-gate-fail-closed.md`
- `07-batch-translator-calls.md`
- `08-typecheck-script-and-build-gate.md`
- `09-owner-outcome-feedback-loop.md`
- `10-docs-sync-readme-agents.md`
