# Private Tester Smoke Checklist

This checklist is the repeatable VET-1352 production-smoke path for the private tester release candidate.

## Required env toggles

Set these in the target environment before inviting testers:

- `PRIVATE_TESTER_MODE=1`
- `NEXT_PUBLIC_PRIVATE_TESTER_MODE=1`
- `PRIVATE_TESTER_INVITE_ONLY=1`
- `NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY=1`
- `PRIVATE_TESTER_FREE_ACCESS=1`
- `NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS=1`
- `PRIVATE_TESTER_ALLOWED_EMAILS=<comma-separated tester emails>`

Optional:

- `PRIVATE_TESTER_BLOCKED_EMAILS=<comma-separated kill-switch emails>`
- `PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=1`
- `NEXT_PUBLIC_PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER=1`

## Automated smoke

Run the repo-owned smoke suites before pushing or handing the release to a
tester:

```bash
npm run smoke:browser-mobile
npm run smoke:private-tester
npm run smoke:private-tester:emergency-bypass
npm run smoke:private-tester:access
```

For a headed browser/mobile pass and the exact writable artifact-path contract,
use `docs/browser-mobile-smoke-checklist.md`.

The automated suites verify:

- the required emergency conversations still short-circuit to `emergency`
- mild/question cases stay out of emergency and usage-limit fail-closed paths
- emergency and mild reports render real report payloads in the mocked release path
- the outcome-feedback route accepts submissions and flags negative feedback
- invite-only, free-access, disable/restore, checkout bypass, and protected-route gating still behave as expected

## Manual production checklist

Confirm these flows on mobile and desktop:

### Emergency chat

- collapsed + pale gums
- struggling to breathe
- nonproductive retching + swollen belly
- seizure over 5 minutes
- hit by car
- toxin ingestion

Expected:

- no auth wall after tester sign-in
- no subscription upgrade wall
- no free-tier usage wall
- no demo-mode copy
- emergency next-step guidance is immediate

### Non-emergency chat

- mild itching, eating normally
- mild soft stool
- mild limping, weight-bearing
- routine wellness question

Expected:

- no crash
- no upgrade block for invited testers
- no emergency over-trigger

### Reports

- emergency report renders real content
- mild/question report renders real content
- report does not show demo-mode content

### Failure-path audit

Verify emergency guidance still reaches the user when:

- server auth lookup fails open inside symptom-chat server logic
- the free-tier usage gate would otherwise trigger
- the model/provider stack is unavailable
- report persistence fails
- image/report sidecars fail

## Invite-only and kill-switch ops

Use env controls for rollout:

- add invited testers to `PRIVATE_TESTER_ALLOWED_EMAILS`
- remove an email from the allowlist to revoke access
- add an email to `PRIVATE_TESTER_BLOCKED_EMAILS` for an immediate deny override
- set `PRIVATE_TESTER_MODE=0` and `NEXT_PUBLIC_PRIVATE_TESTER_MODE=0` to turn the RC off
- use `/admin/tester-access` to inspect configured tester emails, recent tester cases, flagged negative feedback, and deletion dry runs

## Tester data deletion

Inspect the effective tester config with:

```bash
npm run tester:private
```

Delete tester data through the admin API route:

- `GET /api/admin/private-tester` returns the effective private-tester config
- `POST /api/admin/private-tester` with `{ "action": "inspect", "email": "tester@example.com" }` returns a tester data summary
- `POST /api/admin/private-tester` with `{ "action": "delete", "email": "tester@example.com", "dryRun": false }` deletes the tester's auth user, which cascades profile-owned tester data such as pets, symptom checks, reports, notifications, and related feedback rows
