# VET-1549C Second-Opinion Live Tester

## Purpose

`scripts/vet-1541c-second-opinion-live-tester.mjs` is the production-safe
owner-visible evidence runner for the post-VET-1546 cough flow. It drives the
authenticated browser UI only. It does not accept credentials, does not call
debug/admin APIs, and does not promote model flags.

## Safe usage

Dry-run the planned flow:

```powershell
node scripts/vet-1541c-second-opinion-live-tester.mjs --dry-run
```

Run against the production alias with an already-authenticated browser profile:

```powershell
node scripts/vet-1541c-second-opinion-live-tester.mjs --user-data-dir "<already-authenticated-profile-dir>"
```

Optional sanitized JSON output:

```powershell
node scripts/vet-1541c-second-opinion-live-tester.mjs --json --output .tmp/vet-1549c-live-check.json --user-data-dir "<already-authenticated-profile-dir>"
```

The profile must already be signed in and allowed through the private-tester
gate. If the browser reaches `/login`, `session_expired`, or `access_required`,
the script refuses to continue instead of requesting credentials.

## Flow

1. Confirm the browser session can open `/symptom-checker`.
2. Confirm a saved dog profile is visible; generic dog fallback is treated as a
   failure.
3. Submit `Coughing`.
4. Require the cough-type prompt.
5. Submit exactly `It is a dry honking cough.`
6. Continue safe non-emergency follow-up answers until the final report appears.
7. Scan final report text and the first visible history report text for:
   `secondOpinionTrace`, `shadowReadout`, `eligibility_reason`,
   `request_outcome`, `shadow_comparison`, and raw JSON-looking telemetry blocks.

## Output contract

The console output is a concise admin checklist:

- authenticated browser session
- saved dog profile visible
- required cough flow completed
- final report appears
- history report scanned
- owner-visible telemetry leakage

Only marker names and counts are reported. The script does not print cookies,
auth links, bearer tokens, or report text.

## Limits

- The script requires a pre-authenticated browser profile. It intentionally does
  not sign in.
- History scanning is owner-visible UI scanning only. It does not query Supabase
  or shadow-readout endpoints.
- The runner stops if the UI enters an emergency path, because that is outside
  the VET-1549C non-emergency cough evidence path.
