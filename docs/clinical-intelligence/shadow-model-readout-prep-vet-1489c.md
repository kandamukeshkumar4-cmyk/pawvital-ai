# VET-1489C Shadow Model Readout Prep

## Production State

- **Production commit**: `2b4249f535762d4207be018c769e2b69674edbe4`
- **Production deployment ID**: `dpl_CytjMQn2TEsquS36x3tmqZ5Tnwo8`
- **Production alias**: `pawvital-ai.vercel.app`
- **Deployment status**: Ready
- **GitHub commit status**: success (both Vercel contexts green)
- **Deployed**: 2026-05-13T22:29:21-04:00

## Shadow Flag Values (Production)

| Flag | Expected | Actual | Match |
|------|----------|--------|-------|
| SECOND_OPINION_EXTRACTOR | shadow | shadow | YES |
| GROK_FINAL_SAFETY | shadow | shadow | YES |
| GROK_FINAL_REPORT | off | off | YES |
| MODEL_ROUTER_VERSION | v1 | v1 | YES |
| XAI_GROK_FINAL_SAFETY_MODEL | grok-4.3 | grok-4.3 | YES |
| XAI_GROK_FINAL_REPORT_MODEL | grok-4.3 | grok-4.3 | YES |

## Provider Secret Presence

| Secret | Present | Required By |
|--------|---------|-------------|
| XAI_API_KEY | NO | GROK_FINAL_SAFETY shadow |
| GROK_API_KEY | NO | GROK_FINAL_SAFETY shadow (fallback) |
| NVIDIA_QWEN_API_KEY | YES | SECOND_OPINION_EXTRACTOR shadow |
| NVIDIA_GLM_API_KEY | YES | Safety verify (GLM-5) |
| NVIDIA_DEEPSEEK_API_KEY | YES | Model router |
| NVIDIA_KIMI_API_KEY | YES | Model router |
| NVIDIA_VISION_API_KEY | YES | Vision sidecar |

## Shadow Call Capability

### Second-opinion extractor (SECOND_OPINION_EXTRACTOR=shadow)

- **Can run real shadow calls**: YES
- **Provider**: NVIDIA NIM (Qwen 3.5 122B)
- **API key**: NVIDIA_QWEN_API_KEY present in production
- **Behavior**: Makes real extraction calls in shadow mode, discards results, logs telemetry internally
- **Timeout**: 8s feature-level, 45s model-level

### Grok final safety (GROK_FINAL_SAFETY=shadow)

- **Can run real shadow calls**: NO
- **Provider**: XAI (Grok)
- **API key**: XAI_API_KEY and GROK_API_KEY both missing
- **Behavior**: Will fail closed on every request; shadow telemetry will record provider-key-missing failures
- **Expected telemetry**: `grok_final_safety: { status: "shadow", error: "missing_api_key" }` or equivalent fail-closed fallback

### Grok final report (GROK_FINAL_REPORT=off)

- **Active**: NO (correctly off)
- **No shadow calls expected**

## Telemetry Events Expected During Readout

### Observable (second-opinion shadow)

- `second_opinion_extraction: { status: "shadow", provider: "nvidia", model: "qwen3.5-122b" }`
- Extraction accuracy vs. deterministic extractor
- Budget cap enforcement events
- Fallback reasons when budget is exceeded

### Observable (Grok safety shadow — fail-closed)

- `grok_final_safety: { status: "shadow", error: "..." }` on every request
- Fail-closed reason: missing XAI_API_KEY
- No actual Grok model responses until key is added

### Fallback reasons expected

- Model router fallback: budget cap exceeded
- Grok safety fallback: provider key missing
- Second-opinion fallback: timeout (8s), model error, budget cap

## Owner-Visible Leakage Check

- Telemetry gate tests: **8/8 PASSED** — internal telemetry events do not leak into owner-facing payloads
- Route sentinels: **30/30 PASSED** — no debug/telemetry markers in response payloads
- Symptom-chat full suite: **511/511 PASSED** — no payload shape regression
- No owner-visible behavior change introduced

## Validation Results

| Gate | Result | Details |
|------|--------|---------|
| Telemetry gate | PASS | 8/8, internal-only telemetry confirmed |
| Model router + budget | PASS | 8/8, budget caps enforced |
| Symptom-chat route suite | PASS | 511/511 across 11 suites |
| Build | PASS | Next.js production build clean |
| Release gate | PASS | 226 frozen cases, 0 failures, 0 warnings |
| Route sentinels | PASS | 30/30, emergency recall intact |
| Dangerous benchmark | SKIP | Requires live RunPod (no pod provisioned) |

## Readout Start Decision

### PARTIAL START

The 48-72h shadow readout window **can start for second-opinion extraction** but is **HOLD for Grok final safety**.

### What can start now

- **Second-opinion extractor shadow**: NVIDIA_QWEN_API_KEY is present, shadow mode is active, real extraction calls will run alongside the deterministic extractor with results discarded and telemetry captured internally.

### What is on HOLD

- **Grok final safety shadow**: XAI_API_KEY and GROK_API_KEY are both missing from production. Grok shadow calls will fail closed on every request. No real Grok safety verification telemetry can be collected until a provider key is added.

### Hold reasons (Grok safety shadow)

1. XAI_API_KEY not present in Vercel production environment
2. GROK_API_KEY not present in Vercel production environment (fallback)
3. Without either key, shadow mode records only failure telemetry, not actual model comparison data
4. The 48-72h readout for Grok safety requires real model responses to be meaningful

### Not blocked

- Dangerous benchmark skipped (RunPod pod not provisioned) — this does not block the shadow readout because the route sentinels and release gate cover the same emergency-safety invariants locally. The dangerous benchmark is an integration test against live sidecar infrastructure, which is independent of shadow model rollout.

## Required Actions to Unblock Grok Shadow

1. Obtain an XAI API key with access to `grok-4.3` (or the model specified in XAI_GROK_FINAL_SAFETY_MODEL)
2. Add `XAI_API_KEY` to Vercel production environment:
   ```
   vercel env add XAI_API_KEY production --scope kandasubbarao4-5462s-projects
   ```
3. Redeploy production (or wait for next master merge to trigger auto-deploy)
4. Verify Grok shadow telemetry switches from fail-closed errors to real model responses
5. Restart the 48-72h Grok safety readout window from the point where real responses begin

## Next Ticket Recommendation

- **If second-opinion readout is sufficient to proceed**: After 48-72h, open **VET-1490C** to analyze second-opinion shadow telemetry and decide whether to promote `SECOND_OPINION_EXTRACTOR=on`.
- **If Grok safety readout is required before any promotion**: Add XAI_API_KEY to production first, then wait an additional 48-72h for Grok telemetry, then open **VET-1490C** covering both shadow streams.
- **If both must be evaluated together**: HOLD until XAI_API_KEY is added, then start the combined 48-72h window.

## Verification Commands Used

```bash
git fetch origin master --prune
git rev-parse HEAD                    # 2b4249f535762d4207be018c769e2b69674edbe4
git rev-parse origin/master           # 2b4249f535762d4207be018c769e2b69674edbe4
gh pr list --state open --limit 50    # (none)
vercel inspect https://pawvital-ai.vercel.app --scope kandasubbarao4-5462s-projects
gh api repos/kandamukeshkumar4-cmyk/pawvital-ai/commits/master/status

npm test -- --runTestsByPath tests/symptom-chat.telemetry-gate.test.ts
npm test -- --runTestsByPath tests/model-router.test.ts tests/model-budget.test.ts
npm test -- --testPathPatterns=symptom-chat --runInBand
npm run build
npm run eval:benchmark:release-gate
npm run eval:benchmark:route-sentinels
```

## Notes

- Shadow only. No live model promotion.
- No runtime clinical behavior change.
- No Grok final report (GROK_FINAL_REPORT=off confirmed).
- No secret values exposed in this document.
- Temp env file `.env.prod-check-temp` was pulled for inspection and should be deleted after file lock releases.
