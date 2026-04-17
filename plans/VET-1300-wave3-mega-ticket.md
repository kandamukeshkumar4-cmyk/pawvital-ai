# VET-1300 — Clinical Gold Standard + Evidence Provenance (Wave 3)

> Canonical Wave 3 execution spec.
> This file is the tracked source of truth for Wave 3 parent issue `#221` and child tickets `VET-1301` through `VET-1310`.

## Summary

- PawVital already has a serious dog-triage foundation: the deterministic clinical core exists, the main symptom-chat route already handles follow-up orchestration and report generation, and the report/admin surfaces already expose evidence, confidence, and operator tooling.
- The next moat is not another generic infra pass. The next moat is validated canine scope, a true vet-adjudicated benchmark, provenance-backed high-stakes rules, and CI gates that prevent the product from overclaiming or regressing clinically.
- Wave 3 starts with `VET-1301`, which aligns roadmap, product claims, and validated scope before any new clinical branch opens.

## Global Safety Rules

1. `src/lib/triage-engine.ts` and `src/lib/clinical-matrix.ts` remain the medical authority.
2. No benchmark output, outcome feedback, or proposal pipeline may auto-apply deterministic rule changes.
3. Any change to urgency floors, red flags, must-ask questions, or breed modifiers requires a named regression test first.
4. Any high-stakes owner-facing claim without provenance must degrade to safer generic wording.
5. Product, docs, and marketing scope must match validated scope exactly.
6. Emergency paths continue to bypass billing and usage gates; sidecars remain supplemental only.

## Execution Order

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

## Ticket Plan

### `VET-1301` — Roadmap sync + validated-scope audit

- Update the roadmap for Wave 3.
- Add this canonical spec.
- Commit `plans/validated-scope-audit.md`.
- Reconcile:
  - marketed species vs benchmarked species
  - disease count in product copy vs disease count in deterministic runtime
  - breed count in product copy vs active breed-modifier coverage
  - multimodal claims vs currently validated multimodal domains
- No clinical runtime changes required by the ticket itself.

### `VET-1302` — Freeze canine benchmark pack + adjudication pack v2

- Freeze a canonical Wave 3 canine benchmark input set under `data/benchmarks/dog-triage/`.
- Stratify it into:
  - emergency
  - urgent
  - common
  - ambiguous
  - contradictory
  - low-information
  - rare-but-critical
  - multimodal slices
- Ensure every high-risk case carries adjudication slots, reviewer IDs, disagreement status, and must-ask expectations.

### `VET-1303` — Vet adjudication round 1: emergency + rare-but-critical

- Review all tier-1 emergency and rare-but-critical canine cases.
- Resolve disagreements.
- Promote only dual-reviewed cases to adjudicated status.
- Commit a markdown report with case counts, disagreements, and blocked items.

### `VET-1304` — Vet adjudication round 2: common + ambiguous + contradictory

- Review the non-emergency benchmark surface with emphasis on:
  - safe disposition
  - must-ask coverage
  - abstention correctness
  - contradiction handling
  - repeat-question avoidance

### `VET-1305` — Complaint-family gap closure

- Add explicit complaint families for:
  - trauma
  - post-vaccination reaction
- Wire owner-language variants, must-ask questions, red flags, disease links, emergency map entries, and benchmark cases.
- Travel-related disease remains non-goal for this wave, but must be explicitly OOD-routed or explicitly documented as unsupported.

### `VET-1306` — Breed + prevalence expansion for high-value gaps

- Expand the top missing high-value breed modifiers and prevalence priors for newly added diseases.
- Priority examples:
  - Pug
  - Miniature Schnauzer
  - Irish Wolfhound
  - Newfoundland
  - Corgi
  - common mix-group handling
- No new modifier ships without provenance.

### `VET-1307` — Provenance registry population + runtime linkage

- Turn the provenance doc into a runtime-addressable source of truth.
- Every high-stakes rule should carry:
  - rule ID
  - evidence tier
  - source citation
  - review date
  - next review date
  - reviewer
- Cover red flags, emergency composites, disposition rules, must-not-miss diseases, and the top breed modifiers first.

### `VET-1308` — Report trust layer v2

- Extend the report payload and UI so the report can expose:
  - claim-level provenance IDs
  - evidence tier badges
  - last-reviewed dates
  - clearer separation of deterministic rules vs retrieval support
- If a high-stakes claim lacks provenance, suppress specificity and fall back to safer wording.

### `VET-1309` — Complaint-family scorecards + CI release gate

- Add CI scorecards by complaint family, risk tier, and modality usage.
- Block merges when:
  - emergency recall fails
  - unsafe downgrade rate fails
  - dangerous rare-but-critical cases have blocking failures
  - high-stakes rules are missing provenance
  - review dates are expired for high-stakes Tier A/B rules

### `VET-1310` — Fix top-10 adjudicated failures

- Use the adjudicated gold pack to choose the top ten failures by safety impact and frequency.
- Write a failing regression first for each one.
- Apply the smallest safe deterministic fix.
- Re-run the benchmark and obtain clinical sign-off.

## Review Gates

- `VET-1303`, `VET-1304`, `VET-1305`, `VET-1306`, `VET-1310`: clinical-reviewer sign-off
- `VET-1307`, `VET-1308`: clinical plus provenance sign-off
- Every PR: normal Codex review

## Definition of Done

Wave 3 is done only when:

- the canine benchmark is a true vet-adjudicated gold pack
- trauma and post-vaccination flows are live
- high-stakes rules are provenance-populated
- report trust UI exposes provenance cleanly
- CI blocks unsafe clinical regressions
- validated scope is reconciled across roadmap, docs, and product claims
- the adjudicated benchmark meets the existing harness safety targets

## Likely Touched Areas

- `docs/clinical-audit-2026-04-10.md`
- `docs/evidence-provenance-registry.md`
- `docs/gold-dataset-schema.md`
- `docs/failure-taxonomy.md`
- `docs/dog-complaint-ontology.md`
- `data/benchmarks/dog-triage/*`
- `src/lib/clinical-matrix.ts`
- `src/lib/triage-engine.ts`
- `src/lib/breed-data.ts`
- `src/lib/breed-risk.ts`
- `src/components/symptom-report/types.ts`
- `src/components/symptom-report/full-report.tsx`
- related evidence and report components

## Validation Commands

Use the existing script surface:

- `npm test`
- `npm run eval:benchmark:lint`
- `npm run eval:benchmark:validate`
- `npm run eval:benchmark:coverage`
- `npm run eval:benchmark`
- `npm run eval:benchmark:dangerous`
- `npm run runpod:benchmark:adjudication`
