# Plan 09 — Wire the Owner Outcome-Feedback Loop in the Report UI

## Goal

The backend already accepts full outcome payloads (`matchedExpectation` / `confirmedDiagnosis` / `vetOutcome` / `ownerNotes`) at `POST /api/ai/outcome-feedback`, persists them, and auto-drafts threshold-review proposals that surface in an existing admin panel. But no UI ever sends that payload: `FullReport` accepts an `onOutcomeFeedback` prop that no caller passes, and the rendered feedback section only collects tester *helpfulness* feedback. This plan adds an owner-facing "Did this match what happened?" follow-up in the report and history views that POSTs the existing schema and surfaces the `proposalCreated` response. UI work only; no thresholds logic changes.

## Why

The calibration feedback loop (owner outcome → threshold proposal → admin review) is fully built server-side and admin-side but dead-ended at the owner UI. Wiring it closes the only missing link in an already-shipped learning loop.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

**CAUTION:** `src/app/api/ai/outcome-feedback/route.ts` and `tests/outcome-feedback.route.test.ts` have **uncommitted working-tree edits** at authoring time. The excerpts below were read from the working tree as-is. You MUST re-read the current files first; if the schema or handler shape no longer matches the excerpts, **STOP and report**.

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- src/components/symptom-report/full-report.tsx src/components/symptom-report/outcome-feedback.tsx "src/app/(dashboard)/symptom-checker/page.tsx" "src/app/(dashboard)/history/page.tsx" src/app/api/ai/outcome-feedback/route.ts tests/outcome-feedback.route.test.ts
```

Expect non-empty output for `outcome-feedback/route.ts` and `tests/outcome-feedback.route.test.ts` (known dirty) and possibly the landing-related files; for the files this plan EDITS, any diff beyond what this plan describes = **STOP and report**.

## Current state (real code; route/test read from dirty working tree)

### 1. The API accepts full outcome payloads

`src/app/api/ai/outcome-feedback/route.ts` lines 34–40 (working tree):

```typescript
const OutcomeFeedbackRequestBodySchema = z.object({
  symptomCheckId: z.string().uuid(),
  matchedExpectation: z.enum(["yes", "partly", "no"]),
  confirmedDiagnosis: z.string().trim().max(2000).optional(),
  vetOutcome: z.string().trim().max(2000).optional(),
  ownerNotes: z.string().trim().max(4000).optional(),
});
```

The route discriminates payload kinds — lines 57–61:

```typescript
function isOutcomeFeedbackPayload(
  value: unknown
): value is Record<string, unknown> {
  return isRecord(value) && "matchedExpectation" in value;
}
```

Read the rest of the route's POST handler yourself to confirm the response shape for the outcome branch (look for `proposalCreated` in the response JSON; the proposal draft is built in `src/lib/report-storage.ts` — line 354 `const proposal = buildThresholdProposalDraft({` and line 363 `.from("threshold_proposals")`).

### 2. Proposals are auto-drafted for non-"yes" outcomes

`src/lib/threshold-proposals.ts` lines 22–25:

```typescript
}): ThresholdProposalDraft | null {
  if (input.feedback.matchedExpectation === "yes") {
    return null;
  }
```

An admin review panel already exists: `src/components/admin/threshold-proposal-panel.tsx` (verified to exist; not edited by this plan).

### 3. FullReport accepts the prop but nobody passes it

`src/components/symptom-report/full-report.tsx` lines 34–45:

```typescript
interface FullReportProps {
  report: SymptomReport;
  onOutcomeFeedback?: (data: {
    symptomCheckId: string;
    matchedExpectation: "yes" | "partly" | "no";
    confirmedDiagnosis: string;
    vetOutcome: string;
    ownerNotes: string;
  }) => void | Promise<void>;
  /** Public shared view: hide owner-only UI */
  readOnlyShared?: boolean;
}
```

And the feedback section renders WITHOUT it — lines 405–409:

```tsx
      {!readOnlyShared ? (
        <div ref={feedbackRef}>
          {feedbackEnabled ? (
            <OutcomeFeedbackSection report={report} />
          ) : (
```

### 4. OutcomeFeedbackSection only renders the tester-helpfulness widget

`src/components/symptom-report/outcome-feedback.tsx` lines 10–25 (the entire component):

```typescript
export function OutcomeFeedbackSection({
  report,
}: OutcomeFeedbackSectionProps) {
  if (!report.report_storage_id) {
    return null;
  }

  return (
    <TesterFeedbackWidget
      symptomCheckId={report.report_storage_id}
      reportTitle={report.title}
      urgencyLabel={report.recommendation}
      surface="result_page"
    />
  );
}
```

The widget posts only tester fields — `src/components/tester-feedback/widget.tsx` lines 120–132:

```typescript
      const response = await fetch("/api/ai/outcome-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symptomCheckId,
          helpfulness,
          confusingAreas,
          trustLevel,
          notes,
          surface,
        }),
      });
```

### 5. Callers pass no feedback prop

`src/app/(dashboard)/symptom-checker/page.tsx` line 1263:

```tsx
              <FullReport report={report} />
```

`src/app/(dashboard)/history/page.tsx` lines 432–436:

```tsx
                      <FullReport
                        report={{
                          ...report,
                          report_storage_id:
                            report.report_storage_id ?? row.id,
```

## Steps

1. **Re-read the dirty route + test.** Read the full current `src/app/api/ai/outcome-feedback/route.ts` and `tests/outcome-feedback.route.test.ts`. Confirm: (a) the zod schema above still exists, (b) the outcome branch still saves via `saveOutcomeFeedbackToDB` and returns a JSON body — record the exact response shape, especially the field indicating proposal creation (search for `proposalCreated`; if the field has a different name, use the real name everywhere below). If the schema/handler no longer matches, **STOP and report**.
   - Gate: `npm test -- --runTestsByPath tests/outcome-feedback.route.test.ts` → all pass (baseline on the dirty tree; if it fails before your changes, STOP and report).

2. **Build the owner outcome form.** Create `src/components/symptom-report/owner-outcome-form.tsx` — a `"use client"` component styled after the existing widget (read `src/components/tester-feedback/widget.tsx` for the save-state pattern: `saveState`, `errorMessage`, fetch + `response.ok` check). Contents:
   - Heading: "Did this match what happened?"
   - A three-way choice mapping to `matchedExpectation: "yes" | "partly" | "no"`.
   - Optional text inputs: confirmed diagnosis (max 2000 chars), vet outcome (max 2000), notes (max 4000) — mirror the zod limits.
   - On submit: POST to `/api/ai/outcome-feedback` with `{ symptomCheckId, matchedExpectation, confirmedDiagnosis, vetOutcome, ownerNotes }` (omit empty optional fields).
   - On success: show a thank-you state; if the response indicates a proposal was created (the field confirmed in step 1), show an additional line such as "Your report was flagged for clinical review — thank you."
   - Props: `{ symptomCheckId: string }` plus anything needed for display. No clinical imports.
   - Gate: `npx tsc --noEmit` → exit 0, no output.

3. **Render it from `OutcomeFeedbackSection`.** Edit `src/components/symptom-report/outcome-feedback.tsx` to render the new `OwnerOutcomeForm` (with `symptomCheckId={report.report_storage_id}`) alongside the existing `TesterFeedbackWidget` (keep the tester widget — both feedback kinds are valid; the API discriminates by payload shape per `isOutcomeFeedbackPayload`). Keep the `report_storage_id` null-guard.

   Design note: routing through `OutcomeFeedbackSection` automatically covers BOTH callers (symptom-checker page line 1263 and history page line 432) with no caller edits, because both render `FullReport`, which renders `OutcomeFeedbackSection` when not `readOnlyShared`. Do not add the `onOutcomeFeedback` prop plumbing to callers — leave the existing optional prop as-is.
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint src/components/symptom-report/outcome-feedback.tsx src/components/symptom-report/owner-outcome-form.tsx` → 0 errors.

4. **Component test (if feasible).** The default Jest environment is `node`, but `jest-environment-jsdom` and `@testing-library/react` are installed (see package.json devDependencies) and `tests/nearest-vet-finder.test.ts` exists as a component-test exemplar — read it to copy the `@jest-environment jsdom` docblock pattern. Add `tests/owner-outcome-form.test.tsx`:
   - Renders the three choices; submitting "no" with a diagnosis fires a fetch to `/api/ai/outcome-feedback` whose body parses to `{ symptomCheckId, matchedExpectation: "no", confirmedDiagnosis: "..." }`.
   - Success response with proposal-created field set → review-flagged message appears.
   - If the exemplar pattern does not transfer cleanly, skip this test, keep step 5's route-level test, and record the skip reason in the handoff.
   - Gate (if written): `npm test -- --runTestsByPath tests/owner-outcome-form.test.tsx` → all pass.

5. **Route-level regression (extend, don't duplicate).** In `tests/outcome-feedback.route.test.ts`, confirm there is a test posting a full outcome payload and asserting proposal-creation behavior; if missing, add one following the file's existing mock style. Do NOT modify `src/lib/threshold-proposals.ts` or `src/lib/report-storage.ts` to make tests pass.
   - Gate: `npm test -- --runTestsByPath tests/outcome-feedback.route.test.ts` → all pass.

6. **Full gate.**
   - Gate: `npm test -- --testPathPattern="outcome-feedback|tester-feedback"` → all pass.
   - Gate: `npx tsc --noEmit` → exit 0, no output.
   - Gate: `npx eslint src/components/symptom-report/ tests/outcome-feedback.route.test.ts` → 0 errors.

## Repo conventions

- npm; Jest 30 via ts-jest CJS; `@/` → `./src/`; default test env `node` (component tests opt into jsdom via docblock — exemplar: `tests/nearest-vet-finder.test.ts`); ESLint 9 flat config.
- Feedback-widget UX/fetch exemplar: `src/components/tester-feedback/widget.tsx:111-143`.
- Route test exemplar: `tests/outcome-feedback.route.test.ts` (currently dirty — read as-is).

## Out of scope

- `src/lib/threshold-proposals.ts`, `src/lib/report-storage.ts`, the admin panel — read-only.
- The route handler itself — read-only (it already accepts the payload). If you find it does NOT actually work end-to-end, STOP and report; do not fix the route in this plan.
- The shared/public report view (`readOnlyShared`) — the section is already hidden there; keep it that way.
- Clinical files — untouched.

## STOP conditions

- Step 1 finds the dirty route's schema/handler diverged from the excerpts.
- `tests/outcome-feedback.route.test.ts` fails at baseline.
- The proposal-created response field cannot be located in the route — report rather than invent a field name.
- `OutcomeFeedbackSection` or `FullReport`'s feedback block has been restructured beyond the quoted shape.
