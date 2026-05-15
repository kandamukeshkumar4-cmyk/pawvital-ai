# VET-1499C - Production Shadow Traffic Enablement

## Decision

Keep the rollout private-tester only. The production access boundary is reachable,
the persisted shadow readout endpoint is healthy, and the code now has regression
coverage for the exact telemetry-readout contract needed before the next 48-72h
readout.

Do not promote model flags, enable public launch, change emergency thresholds, or
treat controlled/synthetic runs as organic traffic.

## Scope Guard

- `SECOND_OPINION_EXTRACTOR` remains shadow-only.
- `GROK_FINAL_SAFETY` remains shadow-only.
- `GROK_FINAL_REPORT` remains off.
- No emergency thresholds or clinical logic changed.
- No public guest symptom-checker access enabled.
- No synthetic production sessions generated for this ticket.
- No secret values recorded in this document.
- No Vercel environment variables were changed by this ticket.

## Production Access Check

Checked against `https://pawvital-ai.vercel.app` on 2026-05-15.

| Path | Result |
| --- | --- |
| `/` | HTTP 200 |
| `/login` | HTTP 200 |
| `/signup` | HTTP 200 |
| `/symptom-checker` unauthenticated | HTTP 307 to `/login?redirect=%2Fsymptom-checker&reason=session_expired` |
| `/dashboard` unauthenticated | HTTP 307 to `/login?redirect=%2Fdashboard&reason=session_expired` |

The current production path is signed-in tester traffic, not public guest traffic.
Vercel production has the private-tester gate variables present and encrypted,
including `PRIVATE_TESTER_MODE`, `PRIVATE_TESTER_INVITE_ONLY`,
`PRIVATE_TESTER_FREE_ACCESS`, `PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER`, and
`PRIVATE_TESTER_ALLOWED_EMAILS`. The allowlist contains 2 configured emails; the
values are intentionally not recorded here.

Credentialed private-tester navigation was not completed in this Codex run
because no private-tester email/password was available in the agent environment.
That is the remaining operational step before traffic volume can increase.

## Telemetry Persistence Path

Completed symptom reports are wired to Supabase through:

- `src/lib/symptom-chat/report-pipeline.ts`
- `src/lib/report-storage.ts`
- Supabase table: `symptom_checks`

The persistence helper uses `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. It skips demo pets and requires a real pet id, so
testers must complete the authenticated pet/session flow through final report
generation.

## Readout Verification

The protected production readout endpoint was checked with the production debug
secret without printing the secret value:

| Field | Value |
| --- | --- |
| Endpoint | `/api/ai/shadow-rollout` |
| HTTP status | 200 |
| `ok` | true |
| `reportCount` | 0 |
| `parsedReportCount` | 0 |
| `malformedReportCount` | 0 |
| `warning` | null |

This means the VET-1492C failure mode is no longer reproduced through the
production readout path. The current result is a healthy empty readout, not a
telemetry-source failure.

Direct local Supabase reads should not be treated as the source of truth unless
the operator has refreshed local service credentials. In this run, the older
local `.env.local` service-role query returned HTTP 401, while the production
readout endpoint succeeded. The Vercel production variable
`SUPABASE_SERVICE_ROLE_KEY` is present as an encrypted variable, but secret values
are not recorded in the repository.

The Upstash fallback remains secondary. A direct local Upstash REST probe failed
DNS resolution for the configured Upstash host from this machine, so the next
readout should rely on the primary production Supabase-backed endpoint unless
Upstash reachability is separately repaired.

## Regression Coverage Added

`tests/shadow-rollout-baseline.test.ts` now covers both required readout
contracts:

- zero `symptom_checks` rows produce a healthy empty readout with `warning: null`
- persisted `ai_response.system_observability` in `symptom_checks` is parsed into
  readout observations, shadow comparisons, and service metrics

This prevents the next readout from confusing "no traffic yet" with a broken
telemetry source, and it verifies the readout consumes the same persisted
`system_observability` payload that completed reports store.

## Tester Runbook

Use invited production testers only.

1. Confirm each tester email is included in `PRIVATE_TESTER_ALLOWED_EMAILS`.
2. Have testers sign in at `https://pawvital-ai.vercel.app/login` or create an
   account through `https://pawvital-ai.vercel.app/signup`.
3. Have testers open `https://pawvital-ai.vercel.app/symptom-checker` after
   authentication.
4. Have testers acknowledge any required tester onboarding gate.
5. Have testers select or create a real pet profile and complete the symptom flow
   through final report generation.
6. Do not ask testers to run scripted or repeated traffic unless it is labeled
   controlled/synthetic.
7. After real sessions are complete, verify `symptom_checks` row count increases
   through the production readout endpoint and then rerun the shadow readout
   after 48-72 hours.

## Scheduled Readout Automation

`Shadow Readout Scheduler` was added as a read-only GitHub Actions workflow:

- workflow: `.github/workflows/shadow-readout-scheduler.yml`
- script: `scripts/shadow-readout-scheduler.mjs`
- first due timestamp: `2026-05-17T03:06:00Z`
- daily scheduler: `03:15 UTC`
- manual trigger: `workflow_dispatch`

The scheduler gates itself by timestamp. Before `2026-05-17T03:06:00Z`, it
writes a `not_due` artifact and does not call production. At or after the due
time, it calls `https://pawvital-ai.vercel.app/api/ai/shadow-rollout` and writes
JSON/Markdown artifacts under `data/shadow-readout/`.

The workflow requires one protected GitHub secret that matches the production
readout endpoint auth path:

- `HF_SIDECAR_API_KEY`, or
- `ASYNC_REVIEW_WEBHOOK_SECRET`

If neither secret is available to GitHub Actions, the workflow records
`blocked_missing_secret` and opens/updates the due issue instead of printing or
guessing any secret value.

When the readout window is due, the workflow opens or updates a GitHub issue
named `VET-1492C shadow readout due - 2026-05-17`. The issue body includes the
sanitized scheduler report and tells the next agent whether to run the formal
VET-1492C rerun or keep the system on hold for more invited tester traffic.

This automation only reads production telemetry. It does not:

- promote `SECOND_OPINION_EXTRACTOR`
- promote `GROK_FINAL_SAFETY`
- enable `GROK_FINAL_REPORT`
- change Vercel environment variables
- create production traffic
- expose secret values

## Remaining Blocker

The blocker for VET-1492C is insufficient real production sessions. Re-run
VET-1492C after 48-72 hours of real invited tester sessions.
