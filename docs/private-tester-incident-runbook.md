# Private Tester Cohort 1 Incident Runbook

This runbook is the solo-founder operating guide for the first private tester cohort.

## Pause criteria

Pause tester invites immediately if any of the following occur:

- clear emergency returns non-emergency
- sign-in breaks
- report shows demo content
- the same question repeats after being answered
- a tester cannot understand what to do next
- feedback submission fails
- supplement/community/out-of-scope surfaces appear
- tester data appears where it should not
- emergency guidance is paywalled or blocked
- a tester cannot be disabled or deleted
- browser/mobile smoke fails on the core flow

## Where to look first

- Cohort command center: `/admin/cohort-launch`
- Tester access controls: `/admin/tester-access`
- Founder feedback review: `/admin`
- Production telemetry: `/admin/telemetry`
- Deployment status: `/api/admin/deployment`

## How to pause testers

1. Remove future invites from `PRIVATE_TESTER_ALLOWED_EMAILS`.
2. Add affected testers to `PRIVATE_TESTER_BLOCKED_EMAILS` for an immediate deny override.
3. If the entire cohort must stop, set:
   - `PRIVATE_TESTER_MODE=0`
   - `NEXT_PUBLIC_PRIVATE_TESTER_MODE=0`
4. Re-run:
   - `npm run smoke:private-tester:access`
   - `npm run smoke:private-tester`

## How to disable tester access

Use `/admin/tester-access`.

Preferred path for a live tester with an existing profile:

- `Disable Access` for an immediate auth-level sign-in ban
- `Restore Access` to lift the auth ban
- `Mark for Deletion` to record a founder-visible deletion request before removal
- `Export Safe Summary` to download the sanitized admin summary before taking action

Use the generated env snippets under:

- `Disable Access`
- `Restore Access`
- `Remove Invite`

These snippets are derived from the current allow/block lists and remain the source of truth for invite-only rollout control, even when auth-level disablement is also used.

## How to check auth status

1. Run the auth and access smoke:
   - `npm run smoke:private-tester:access`
2. Confirm login-page network errors still sanitize correctly:
   - `npm test -- --runInBand tests/auth-pages.network-error.test.tsx`
3. Verify the deployed app is using the expected Supabase host before inviting testers.

## How to check Supabase and environment status

1. Confirm the private tester env toggles are present:
   - `npm run tester:private`
2. Verify service-role protected tester access/deletion controls:
   - `/api/admin/private-tester`
3. If service-role access is unavailable, do not promise live deletion/inspection from the dashboard until it is restored.

## How to check report failures

1. Review `Report Failures` in `/admin/cohort-launch` and `/admin`.
2. Re-run the production smoke:
   - `npm run smoke:private-tester`
3. Re-run emergency bypass smoke:
   - `npm run smoke:private-tester:emergency-bypass`

## How to check feedback failures

1. Review `Negative Feedback` and `No-Feedback Cases` in `/admin/cohort-launch`.
2. Re-run the browser/mobile smoke:
   - `npm run smoke:browser-mobile`
3. Re-run the feedback route coverage:
   - `npm test -- --runInBand tests/outcome-feedback.route.test.ts`

## How to review emergency sessions

1. Open `/admin/cohort-launch`.
2. Check `High-risk sessions`.
3. Review `Founder triage queue` for `P0` and `P1`.
4. If the case looks clinically unsafe, pause the cohort first, then open a bug.

## How to create P0/P1 bug tickets

Use `/admin` -> `File Issue`, then copy:

- case/session ID
- urgency result
- report ID
- tester note
- triage severity (`P0` or `P1`)
- brief repro summary

Do not paste raw owner-sensitive notes into a public issue body.

## How to communicate a pause or fix to testers

Suggested pause message:

> PawVital private testing is temporarily paused while we fix an issue found during the cohort. Please do not rely on the app until we confirm the next safe testing window.

Suggested resume message:

> We fixed the issue found during private testing and re-ran the required safety checks. You can continue with the same private tester flow when ready.

## Incident templates

### Auth outage

- Severity: `P0`
- Trigger: testers cannot sign in or sessions do not persist
- Immediate action: pause invites, re-run `npm run smoke:private-tester:access`, verify Supabase host/env

### Report outage

- Severity: `P1` or `P0` if emergency report path is affected
- Trigger: report fails, shows demo content, or cannot be opened
- Immediate action: re-run `npm run smoke:private-tester` and `npm run smoke:private-tester:emergency-bypass`

### Emergency downgrade

- Severity: `P0`
- Trigger: clear emergency returns non-emergency or testers lose trust in emergency output
- Immediate action: pause cohort immediately, re-run dangerous and release-gate validations

### Repeated question bug

- Severity: `P1`
- Trigger: answered follow-up question repeats
- Immediate action: review `Repeated-question flags` in `/admin/cohort-launch` and create a targeted bug

### Data deletion request

- Severity: `P1`
- Trigger: tester asks for data removal or disablement
- Immediate action: inspect via `/admin/tester-access`, mark the tester for deletion, export the safe summary if needed, run dry-run delete, then execute delete if approved

### Tester confusion or trust issue

- Severity: `P2` unless the session is emergency or blocks next steps
- Trigger: negative feedback on wording, result hierarchy, or next steps
- Immediate action: capture the case ID, assign it in the founder triage queue, and open a follow-up issue if repeatable
