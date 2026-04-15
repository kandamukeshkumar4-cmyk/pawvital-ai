# VET-1206 Live Eval Baseline Status

- Updated: 2026-04-14
- Scope: `data/benchmarks/dog-triage/gold-candidate`
- Frozen case count: `223`
- Coverage artifact: `scripts/benchmark-coverage-report.ts`
- Live executor: `scripts/runpod-benchmark.mjs`
- Live scorer: `scripts/eval-harness.ts`

## What is now true

- The benchmark executor validates the full frozen 223-case pack in dry-run mode.
- The executor now fails closed on sidecar readiness before live runs unless `--skip-preflight` is set explicitly.
- The evaluation harness now scores live route artifacts instead of simulated adjudication outputs.
- Coverage reporting is now explicit, so the baseline can state exactly what suite it attempted to run.

## Current production blocker

As of the latest production readiness check against `https://pawvital-ai.vercel.app`:

- `configured=5/5`
- `healthy=1/5`
- `stub=0`
- `text-retrieval-service`, `image-retrieval-service`, `multimodal-consult-service`, and `async-review-service` are returning `404` from `/healthz`

That means a truthful "full sidecar stack" live baseline is blocked right now. The harness correctly refuses to run a real baseline until readiness is green.

## Shadow status snapshot

- Overall status: `insufficient_data`
- Vision samples in rolling 24h window: `0`
- Text retrieval samples in rolling 24h window: `1`
- Image retrieval samples in rolling 24h window: `0`
- Multimodal consult samples in rolling 24h window: `0`
- Async review samples in rolling 24h window: `0`
- Required healthy-window samples: `288`

This matches the dependency chain: `VET-1202` must produce the real shadow baseline before `VET-1206` can claim a full-stack live eval.

## Verification completed

- `node scripts/runpod-benchmark.mjs --dry-run --input=data/benchmarks/dog-triage/gold-candidate`
- `npx ts-node --esm scripts/benchmark-coverage-report.ts --input=data/benchmarks/dog-triage/gold-candidate`
- `npx ts-node --esm scripts/eval-harness.ts --input=<synthetic live artifact>`
- `node scripts/verify-sidecars.mjs readiness`
- `node scripts/report-phase5-shadow.mjs --json`

## Next command once readiness is green

```powershell
npx ts-node --esm scripts/eval-harness.ts --suite=data/benchmarks/dog-triage/gold-candidate
```

That command will:

1. run the live route benchmark against `/api/ai/symptom-chat`
2. enforce five-sidecar readiness before the first case executes
3. write the live scorecard JSON
4. refresh this markdown baseline artifact
