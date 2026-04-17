# PawVital Delivery Roadmap

Effective: 2026-04-17

## Current Position

- Wave 1 (`VET-1100`) is complete on `master`.
- Wave 2 foundations are already substantial on `master`: the deterministic canine core is live, the main symptom-chat route already wires image gating, breed enrichment, contradiction handling, rate limits, report generation, and the report/admin surfaces already exist.
- Current execution wave: `VET-1300` — Clinical Gold Standard + Evidence Provenance.
- `VET-1301` is the mandatory docs-and-scope gate. No other Wave 3 branch should open before it lands.

## Program Status

| Area | Status | Notes |
| --- | --- | --- |
| Deterministic canine triage core | LIVE FOUNDATION | `src/lib/triage-engine.ts` and `src/lib/clinical-matrix.ts` remain authoritative |
| Symptom-chat route + report UI | LIVE FOUNDATION | Main route, owner report, vet handoff, evidence chain, and admin review surfaces already exist |
| Dog benchmark harness | PARTIAL | Dog benchmark pack exists, but the current `gold-candidate` pack is not yet a true vet-adjudicated gold standard |
| Validated product scope | NEEDS RECONCILIATION | Public claims overstated species support, disease counts, breed counts, and multimodal scope |
| Evidence provenance | DESIGNED, NOT POPULATED | Registry schema exists, but runtime linkage and high-stakes rule coverage are still pending |
| Next execution wave | ACTIVE | `VET-1300` starts with `VET-1301` and then moves into benchmark adjudication, provenance, and complaint-family closure |

## Wave Guardrails Preserved

These remain non-negotiable in Wave 3:

1. `src/lib/triage-engine.ts` and `src/lib/clinical-matrix.ts` remain the medical authority.
2. `answered_questions`, `extracted_answers`, `unresolved_question_ids`, and `last_question_asked` remain protected deterministic state.
3. Compression remains narrative-only and cannot mutate control state.
4. No benchmark output, outcome feedback, or proposal pipeline may auto-apply deterministic rule changes.
5. High-stakes owner-facing claims without provenance must degrade to safer generic wording.
6. Emergency cases always bypass billing and usage gates, and sidecars remain supplemental only.
7. Public scope stays dog-only until a separately validated species pack exists.

## Wave 3 Canonical Spec

- Canonical execution spec: `plans/VET-1300-wave3-mega-ticket.md`
- Parent tracking issue: `#221 — VET-1300`
- Scope reconciliation gate: `plans/validated-scope-audit.md`
- First implementation ticket: `VET-1301`

### Mandatory first ticket

- `VET-1301` — roadmap sync + validated-scope audit

### Hard-ordered chains

1. `VET-1302 -> VET-1303 -> VET-1310`
2. `VET-1302 -> VET-1304 -> VET-1310`
3. `VET-1301 -> VET-1305 -> VET-1310`
4. `VET-1301 -> VET-1306 -> VET-1310`
5. `VET-1301 -> VET-1307 -> VET-1308 -> VET-1309`

### Parallel-after-gate tickets

- `VET-1302`
- `VET-1305`
- `VET-1306`
- `VET-1307`

## Review Gates

- Every Wave 3 PR: normal Codex review.
- `VET-1303`, `VET-1304`, `VET-1305`, `VET-1306`, and `VET-1310`: clinical-reviewer sign-off.
- `VET-1307` and `VET-1308`: clinical plus provenance sign-off.

## Immediate Next Tasks

1. Land `VET-1301` as the scope-truth and roadmap gate.
2. Freeze the canonical canine benchmark pack in `VET-1302`.
3. Open adjudication, provenance, breed-gap, and complaint-family work only after the docs gate lands.

## Completion Signal For Wave 3

Wave 3 is complete only when all of the following are true:

- The canine benchmark is a true vet-adjudicated gold pack.
- Trauma and post-vaccination complaint flows are live in the deterministic system.
- High-stakes rules have provenance coverage and review dates.
- Report trust surfaces expose provenance cleanly and safely.
- CI blocks unsafe clinical regressions and missing/expired provenance on high-stakes rules.
- Public docs, product copy, and roadmap claims match validated dog-only scope exactly.
- The adjudicated benchmark meets the existing harness safety targets.
