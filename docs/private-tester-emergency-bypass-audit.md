# Private Tester Emergency Bypass Audit

This audit is the VET-1352 operator view of the fail-open seams that must keep
emergency guidance reachable during the private tester release.

## Required bypass surfaces

| Failure mode | Expected behavior | Primary seam |
| --- | --- | --- |
| Auth lookup problem | Emergency guidance still returns instead of blocking on auth | `src/lib/symptom-chat/server-identity.ts` |
| Payment or subscription state | Invited testers do not hit the upgrade wall | `src/lib/private-tester-access.ts`, `src/lib/subscription-state.ts`, `src/app/api/stripe/checkout/route.ts` |
| Usage limit | Emergency-start conversations bypass free-tier gating | `src/lib/symptom-chat/usage-limit-gate.ts` |
| Model/provider failure | Deterministic emergency routing still returns `emergency` | `src/app/api/ai/symptom-chat/route.ts`, `tests/symptom-chat.route.test.ts` |
| Image upload or sidecar failure | Emergency guidance still reaches the user without image-only blockers | `src/app/api/ai/symptom-chat/route.ts`, `tests/symptom-chat.route.test.ts` |
| Report persistence failure | Guidance and report payload stay available even if persistence fails | `src/app/api/ai/symptom-chat/route.ts`, `src/lib/report-storage.ts` |

## Automated smoke

Run:

```bash
npm run smoke:private-tester:emergency-bypass
```

The emergency-bypass smoke suite covers:

- auth fail-open
- usage-limit bypass
- provider failure bypass
- image-sidecar failure bypass
- report persistence failure bypass

## Manual release check

During final production signoff, confirm every required emergency sample still
returns actionable emergency guidance even if:

- the tester is over the free-tier limit
- a provider or sidecar is unavailable
- report persistence fails
- auth lookup is unavailable or degraded
