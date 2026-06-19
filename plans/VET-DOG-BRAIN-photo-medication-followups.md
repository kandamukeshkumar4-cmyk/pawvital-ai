# VET-DOG-BRAIN — Photo & Medication follow-up decisions

Decisions for the two "next step" gaps from the goal. Both are deliberately
deferred to scoped follow-up tickets rather than half-built now, because each is
a real feature with storage/schema surface that shouldn't be rushed into the
clinical-adjacent path. The current code is honest about its MVP state (no fake
"upload", medication kept as structured daily-log fields).

## Task 5 — Health Log photos: DEFER to a real-upload ticket (do not pretend)

**Current state (honest MVP):** `src/app/(dashboard)/health-log/page.tsx:510-527` shows a
single URL text field labelled *"Full photo upload coming soon. For now you can
paste a cloud photo URL"*. The route schema accepts `photo_urls: z.array(z.string().url())`.
So the app does NOT claim URL paste is a real upload — it's explicitly a fallback.

**Decision: ticket a real upload, reuse the journal convention.** The project
already has a working image-upload path that Health Log can mirror almost 1:1:
- Server: `src/app/api/journal/upload/route.ts` — validates the file, uploads to
  Supabase Storage `journal-photos` via `supabase.storage.from(...).upload(objectPath, buffer)`
  with path `${user.id}/${Date.now()}-${name}.${ext}`, returns `{ path }`.
- Client: `journal/page.tsx` `onFilesSelected` — `FormData` with `file` → POST
  the upload route → collect paths → store array.

**Follow-up ticket scope (small):**
1. Add `POST /api/health-log/upload` mirroring the journal upload route (or
   extract the shared validation + a `health-log-photos` bucket; reusing
   `journal-photos` is acceptable for MVP since both are owner-scoped by `user.id/` path).
2. Replace the URL text field with the journal's file-picker upload component.
3. Keep `photo_urls` as the persisted shape (already wired into the Dog Brain
   photo count + vet packet).
Not started here — no misleading code shipped.

## Task 6 — Medication: KEEP structured daily-log medication as MVP + ticket events

**Current state (MVP):** medication is captured as a structured `context_signals.medication`
pack on the daily log (name, time_given, missed_late, dose_notes, side_effect_notes)
and surfaced as **history only** in the Dog Brain context and vet packet
("history only, not dosing advice" — asserted by tests). This is sufficient for
the triage/vet-handoff use case: it gives the vet a record of what was given.

**Decision: keep the daily-log medication MVP; ticket `medication_events` separately.**
A full `medication_events` entity (own table, schedules, adherence streaks,
reminders integration) is a distinct feature, not a gap in the current path. The
MVP already feeds the report context safely and is the right granularity for a
daily check-in.

**Follow-up ticket scope:** dedicated `medication_events` table (med, dose, route,
schedule, given/missed timestamps), an API, adherence rollups, and reminders
linkage — only if product wants medication management beyond the daily log.

## Guardrail (applies to both)
No medication dosing guidance and no fabricated clinical findings — medication
stays "history only", photos stay owner-supplied references. Deterministic
clinical logic remains authoritative.
