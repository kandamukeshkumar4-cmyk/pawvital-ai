# PawVital Delivery Roadmap

Effective: 2026-04-14

## Current Position

- Wave 1 (`VET-1100`) is complete on `master`.
- Current execution wave: `VET-1200` — post-world-class hardening, shadow activation, and quality loop.
- Docs gate `VET-1201` is the only ticket that should open directly from this state. Every other Wave 2 branch follows after it lands.

## Program Status

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 0 — Queue reconciliation + docs gate | COMPLETE | Shipped in `VET-1000` and follow-on governance cleanup |
| Phase 1 — Safety rollout foundation | COMPLETE | Safety contracts, payload guards, and sidecar readiness wiring landed |
| Phase 2 — Benchmark and multimodal foundation | COMPLETE | Benchmark pack, ontology, and multimodal slices landed |
| Phase 3 — Real sidecars | COMPLETE | `VET-1101` through `VET-1105` shipped with `FORCE_FALLBACK=1` |
| Phase 4 — Deploy | COMPLETE | `VET-1106` through `VET-1108` landed with sizing, env sync, and lifecycle tooling |
| Phase 5 — Shadow | COMPLETE | `VET-1109` and `VET-1110` landed with shadow metrics and promotion thresholds |
| Phase 6 — Corpus | COMPLETE | `VET-1111` and `VET-1112` landed with dog-only reindex and retrieval harness |
| Phase 7 — ER UX | COMPLETE | `VET-1113` landed without changing urgency authority |
| Phase 8 — Learning loop | COMPLETE | `VET-1114a`, `VET-1114b`, and `VET-1115` landed as proposal-only workflow |

## Wave 1 Guardrails Preserved

These remain non-negotiable in Wave 2:

1. `src/lib/triage-engine.ts` and `src/lib/clinical-matrix.ts` stay authoritative for medical decisions.
2. `answered_questions`, `extracted_answers`, `unresolved_question_ids`, and `last_question_asked` remain protected deterministic state.
3. Compression stays narrative-only and cannot mutate control state.
4. Telemetry, sidecar state, and transition notes stay internal-only.
5. Promoted sidecars remain supplemental evidence providers and never override urgency.
6. Emergency cases always bypass billing or rollout gates.

## Wave 2 Canonical Spec

- Canonical execution spec: `plans/VET-1200-wave2-mega-ticket.md`
- Parent tracking issue: `#153 — VET-1200`
- Docs gate: `#154 — VET-1201`

### Hard-Ordered Chains

1. `VET-1201` lands first.
2. `VET-1202 -> VET-1203`
3. `VET-1202 -> VET-1206 -> VET-1207`
4. `VET-1216 -> VET-1217`
5. `VET-1203 -> VET-1211`

### Parallel-After-Gate Tickets

- `VET-1204` — advisory fix
- `VET-1205` — confidence calibrator wiring
- `VET-1208` — ICD-10 coverage audit
- `VET-1209` — threshold proposal review cycle
- `VET-1210` — production telemetry dashboard
- `VET-1212` — mobile responsiveness audit
- `VET-1213` — notification reliability hardening
- `VET-1214` — rate limit load and Redis failover
- `VET-1215` — auth hardening
- `VET-1218` — Stripe webhook and usage-limit hardening

### Review Gates

- Every Wave 2 PR: normal Codex review.
- `VET-1203` and `VET-1218`: adversarial review plus deploy/billing guard path.
- `VET-1207`, `VET-1208`, and `VET-1209`: clinical-reviewer sign-off required.

## Immediate Next Tasks

1. Land `VET-1201` as docs-only prerequisite.
2. Run the real Phase 5 shadow baseline in `VET-1202`.
3. In parallel after `VET-1201`, clear the advisory/UI/hardening tickets that do not depend on live split promotion.

## Completion Signal For Wave 2

Wave 2 is complete only when all of the following are true:

- 288-sample shadow baseline exists on `master`.
- At least one sidecar is promoted to controlled live traffic with a tested kill switch.
- Confidence calibration is visible in the report payload and UI without altering urgency.
- Eval harness baseline is captured and the top-3 failures are fixed with named regressions.
- Route Dangerous Replay Advisory is green again.
- Admin telemetry and sidecar rollout controls are available to operators.
- Mobile, auth, rate-limit, notification, corpus, and billing follow-ons are all verified and landed.
