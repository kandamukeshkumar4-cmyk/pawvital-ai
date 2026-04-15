# Phase 5 Shadow Baseline
Generated: 2026-04-15T22:31:17.316Z
App base URL: http://127.0.0.1:3001
## Readiness
- HTTP: 200 (ok)
- Configured sidecars: 5
- Healthy sidecars: 5
- Stub sidecars: 0
- Unhealthy sidecars: 0
- Unreachable sidecars: 0
## Baseline Window
- HTTP: 200 (ok)
- Overall status: ready
- Rolling window: 24 hours
- Sample interval: 5 minutes
- Required healthy samples: 288
- Required healthy ratio: 95.0%
- Parsed reports in window: 321/321
- Malformed reports skipped: 0
- Aggregated service observations: 1605
- Aggregated shadow comparisons: 1605
- Warning: Using local shadow telemetry file store because SHADOW_TELEMETRY_FILE_FALLBACK is enabled.
- Persisted load test: passed
- Load test target: /api/ai/shadow-rollout @ 4 RPS
- Load test p99 latency: 23 ms
- Load test error rate: 0.0%
## Services
### vision-preprocess-service
- Promotion status: ready
- Sample mode: shadow
- Window samples: 321/288 (healthy 100.0%)
- p95 latency: 180 ms
- Average latency: 180 ms
- Timeout rate: 0.0%
- Error rate: 0.0%
- Fallback rate: 0.0%
- Disagreement rate: 0.0%
- Load test: passed
- Blockers:
  - none
### text-retrieval-service
- Promotion status: ready
- Sample mode: shadow
- Window samples: 321/288 (healthy 100.0%)
- p95 latency: 220 ms
- Average latency: 220 ms
- Timeout rate: 0.0%
- Error rate: 0.0%
- Fallback rate: 0.0%
- Disagreement rate: 0.0%
- Load test: passed
- Blockers:
  - none
### image-retrieval-service
- Promotion status: ready
- Sample mode: shadow
- Window samples: 321/288 (healthy 100.0%)
- p95 latency: 260 ms
- Average latency: 260 ms
- Timeout rate: 0.0%
- Error rate: 0.0%
- Fallback rate: 0.0%
- Disagreement rate: 0.0%
- Load test: passed
- Blockers:
  - none
### multimodal-consult-service
- Promotion status: ready
- Sample mode: shadow
- Window samples: 321/288 (healthy 100.0%)
- p95 latency: 840 ms
- Average latency: 840 ms
- Timeout rate: 0.0%
- Error rate: 0.0%
- Fallback rate: 0.0%
- Disagreement rate: 0.0%
- Load test: passed
- Blockers:
  - none
### async-review-service
- Promotion status: ready
- Sample mode: shadow
- Window samples: 321/288 (healthy 100.0%)
- p95 latency: 1300 ms
- Average latency: 1300 ms
- Timeout rate: 0.0%
- Error rate: 0.0%
- Fallback rate: 0.0%
- Disagreement rate: 0.0%
- Load test: passed
- Blockers:
  - none