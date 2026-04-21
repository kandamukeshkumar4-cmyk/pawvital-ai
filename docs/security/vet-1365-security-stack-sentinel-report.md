# VET-1365 Security Stack Sentinel Report

- Generated at: 2026-04-21T07:31:41.623Z
- Branch baseline: `origin/codex/security-green-stack`
- Scope: merged security hardening stack replay and red-team delta

## Commands Run

- `npm audit`
- `npm audit --omit=dev`
- `npm run build`
- `npm test`
- `node scripts/runpod-benchmark.mjs --input=data/benchmarks/dog-triage/wave3-freeze --output=C:\pv1365\tmp\vet1365-raw-report.json --base-url=http://localhost:3010 --skip-preflight`
- `npm run eval:benchmark:release-gate`

## Benchmark Summary

- Full scorecard: `226` cases, `100.0%` emergency recall, `0.00%` unsafe downgrade, `0` blocking failures, `PASS`
- Dangerous subset: `76` cases, `100.0%` emergency recall, `0.00%` unsafe downgrade, `0` blocking failures, `PASS`
- Release gate: `PASS`

## Sentinel Notes

- The first long-running replay stalled behind repeated MiniMax compression retries returning `429 insufficient balance (1008)`.
- The sentinel rerun used the existing deterministic compression fallback by starting the local validation server with MiniMax credentials unset.
- This did not change clinical routing rules. Memory compression remains narrative-only, and the fallback path is already covered by regression tests.

## Red-Team Replay

- Outcome poisoning: blocked by authenticated ownership checks and guarded server-side write path.
- Legacy proxy and session fixation: blocked; `/api/triage/next` remains `410 Gone`.
- AI cost-abuse path: blocked by auth, quota enforcement, and body caps on expensive endpoints.
- Rate-limit fail-open path: blocked by local fallback quota and spoofed identity rejection.
- Async-review webhook abuse: blocked by production secret enforcement and payload caps.
- Admin override backdoor: blocked in production.
- Stripe redirect poisoning: blocked by canonical app URL enforcement.
- Journal upload MIME spoofing: blocked by magic-byte validation and normalized storage metadata.
- Browser hardening: CSP, HSTS, framing protection, referrer policy, permissions policy, and content-type protections present.
- Dependency drift: `npm audit` and `npm audit --omit=dev` both clean.

## Remaining Non-Blocking Residuals

- High non-blocking failures: `2`
- Medium follow-up/readiness failures: `13`
- Critical release blockers: `0`

The residuals above remain outside the blocking security gate and do not prevent the private-tester RC security closeout.
