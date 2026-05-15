# VET-1499C - Production Shadow Traffic Enablement

## Decision

Real traffic path is ready for invited production testers. Do not promote model flags, enable public launch, or treat controlled/synthetic runs as organic traffic.

## Scope Guard

- `SECOND_OPINION_EXTRACTOR` remains shadow-only.
- `GROK_FINAL_SAFETY` remains shadow-only.
- `GROK_FINAL_REPORT` remains off.
- No emergency thresholds or clinical logic changed.
- No public guest symptom-checker access enabled.
- No synthetic production sessions generated for this ticket.
- No secret values recorded in this document.

## Production Access Check

| Path | Result |
| --- | --- |
| `/` | HTTP 200 |
| `/login` | HTTP 200 |
| `/signup` | HTTP 200 |
| `/symptom-checker` unauthenticated | HTTP 307 to `/login?redirect=%2Fsymptom-checker&reason=session_expired` |
| `/dashboard` unauthenticated | HTTP 307 to `/login?redirect=%2Fdashboard&reason=session_expired` |

The current production path is signed-in tester traffic, not public guest traffic. The proxy redirects unauthenticated protected routes before private-tester access evaluation. Authenticated non-admin users must pass `evaluatePrivateTesterAccess` before entering protected tester routes.

## Telemetry Persistence Path

Completed symptom reports are wired to Supabase through:

- `src/lib/symptom-chat/report-pipeline.ts`
- `src/lib/report-storage.ts`
- Supabase table: `symptom_checks`

The persistence helper uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It skips demo pets and requires a real pet id, so testers must complete the authenticated pet/session flow through final report generation.

## Root Cause

`symptom_checks` had zero rows for two reasons:

1. No completed real production symptom sessions have been persisted yet.
2. The production shadow-readout source was unhealthy before this ticket: `/api/ai/shadow-rollout` reported `Supabase telemetry read failed (Invalid API key)` and then failed its Upstash fallback.

The client bundle points at the active Supabase project ref `gswjpmgxidofwmjngavh`. A direct service-role REST query to the same project succeeded with HTTP 200 and exact count `0`, confirming that the table exists and is reachable with the known-good service key.

## Enablement Applied

The production `SUPABASE_SERVICE_ROLE_KEY` was resynced from the known-good local source without printing the value. The production deployment was then redeployed so the serverless runtime could pick up the refreshed environment variable.

Post-redeploy `/api/ai/shadow-rollout` returned:

| Field | Value |
| --- | --- |
| HTTP status | 200 |
| ok | true |
| reportCount | 0 |
| parsedReportCount | 0 |
| warning | null |
| error | null |

This means the readout path is healthy again. The remaining blocker is traffic volume, not telemetry source availability.

## Tester Runbook

Use invited production testers only.

1. Confirm each tester email is included in the private tester allowlist.
2. Have testers sign in at `https://pawvital-ai.vercel.app/login` or create an account through `https://pawvital-ai.vercel.app/signup`.
3. Have testers open `https://pawvital-ai.vercel.app/symptom-checker` after authentication.
4. Have testers acknowledge any required tester onboarding gate.
5. Have testers select or create a real pet profile and complete the symptom flow through final report generation.
6. Do not ask testers to run scripted or repeated traffic unless it is labeled controlled/synthetic.
7. After real sessions are complete, verify `symptom_checks` row count increases and then rerun the shadow readout after 48-72 hours.

## Remaining Blocker

The blocker for VET-1492C is now insufficient real production sessions. Re-run VET-1492C after 48-72 hours of real invited tester sessions.
