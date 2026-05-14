# VET-1488C — Shadow Model Rollout Config

**Date:** 2026-05-13
**Agent:** claude (Sonnet 4.6)
**Ticket:** VET-1488C
**Prerequisites:** VET-1428 merged (Qwen post-telemetry guard)

## Purpose

Turn on new model paths in shadow-only mode so telemetry accumulates before any
live cutover. User-visible behavior is unchanged. No live Grok final report.

## Flags

| Env Var | Value | Effect |
|---|---|---|
| `SECOND_OPINION_EXTRACTOR` | `shadow` | Records telemetry; does not alter answer coercion or user output |
| `GROK_FINAL_SAFETY` | `shadow` | Budget cap is 0 calls/session — no actual Grok call; shadow event emitted |
| `GROK_FINAL_REPORT` | `off` | Completely off; no shadow event |
| `MODEL_ROUTER_VERSION` | `v1` | Keeps deterministic v1 router; no new routing logic |

## Budget Caps (from `model-router.ts` `FEATURE_RUNTIME_SETTINGS`)

| Feature | `maxCallsPerSession` | Notes |
|---|---|---|
| `second_opinion` | 2 | Shadow calls counted against budget |
| `grok_final_safety` | 0 | `budget_exceeded` fires immediately; no actual Grok call even in shadow |
| `grok_final_report` | 0 | Flag is `off`; never reached |

Budget caps protect against unexpected spend during shadow data collection.

## Env Vars Required in Vercel (production + preview)

Set these in the Vercel dashboard → Project Settings → Environment Variables
for both **Production** and **Preview** environments:

```
SECOND_OPINION_EXTRACTOR=shadow
GROK_FINAL_SAFETY=shadow
GROK_FINAL_REPORT=off
MODEL_ROUTER_VERSION=v1
```

Trigger a fresh production deployment after setting vars so the new values are
baked into the running bundle.

## Telemetry Contract

- Shadow events use the existing `ModelFallbackReason` telemetry surface.
- Fallback reasons (`budget_exceeded`, `feature_disabled`, `circuit_open`) are
  logged server-side only — never included in the owner-facing payload.
- The `VET-725` payload-safety guard (PR #73) ensures no internal markers reach
  the client response.

## Validation

After deploying with these flags:

1. **Route tests** — `npm test -- --testPathPatterns=model-router --runInBand`
2. **Dangerous benchmark** — `npm test -- --testPathPatterns=wave3-dangerous-regression-pack --runInBand`
3. **Release gate** — `npm test -- --testPathPatterns=wave3-release-gate --runInBand`
4. Confirm no `SECOND_OPINION_EXTRACTOR`, `GROK_FINAL_SAFETY`, or similar strings
   appear in any owner-visible response payload.

## Next Step

After 48–72 hours of shadow data collection, evaluate telemetry for
`SECOND_OPINION_EXTRACTOR` before switching it to `on`.
`GROK_FINAL_REPORT` requires separate sign-off before it exits `off`.
