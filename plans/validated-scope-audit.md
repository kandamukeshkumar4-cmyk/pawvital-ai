# VET-1301 — Validated Scope Audit

Date: 2026-04-17

## Purpose

Reconcile PawVital's marketed scope with the current validated canine system so public claims, roadmap language, and release gates all describe the same product.

## Source Documents Checked

- `docs/clinical-audit-2026-04-10.md`
- `docs/dog-complaint-ontology.md`
- `data/benchmarks/dog-triage/README.md`
- `docs/multimodal-triage-pilot.md`
- `docs/evidence-provenance-registry.md`
- public product copy in README, landing pages, pricing, dashboard, and product overview

## Executive Finding

PawVital's validated system is narrower and safer than some older public copy suggested. The app should be positioned as a **dog-only deterministic symptom triage product** with substantial canine foundations, but not yet as a dogs-and-cats system, not yet as a clinically adjudicated gold-standard benchmarked product, and not yet as a broad generalist multimodal system.

## Reconciliation Table

| Surface | Prior claim | Validated scope | Evidence | Required action |
| --- | --- | --- | --- | --- |
| Species support | Dogs and cats | Dogs only | Dog-only ontology and benchmark pack; no validated feline ontology/benchmark in current scope | Public copy and app flows must say dogs only |
| Disease count | `200+ disease profiles` | Roughly `150+` modeled canine conditions as of the 2026-04-10 clinical audit | Clinical audit disease expansion summary | Remove inflated public count or anchor any numeric claim to the audit date |
| Breed coverage | `200+ breeds` | 26 breeds with active modifiers as of the 2026-04-10 audit | Breed modifier audit section | Remove inflated breed claim; keep breed-aware wording bounded to validated coverage |
| Benchmark quality | Implied high-confidence benchmark authority | Current `gold-candidate` pack is useful for engineering eval only and is not yet a true gold standard | `data/benchmarks/dog-triage/README.md` | Block any clinical-quality claim until vet adjudication is complete |
| Multimodal scope | Broad photo/vision implication | Guarded dog-image support exists; documented validated pilot is wound-focused | `docs/multimodal-triage-pilot.md` | Avoid implying general multimodal validation until Wave 5 work exists |
| Provenance coverage | Evidence-rich system language | Registry schema exists, but runtime population and trust-layer linkage are still pending | `docs/evidence-provenance-registry.md` | High-stakes report specificity must stay bounded until provenance linkage lands |

## Canonical Public Scope for Now

Approved positioning for current product surfaces:

- PawVital is a **dog-only** symptom triage and veterinarian handoff tool.
- Medical routing is driven by a deterministic canine clinical matrix.
- Current deterministic coverage spans 50 complaint families and roughly 150+ modeled conditions, based on the 2026-04-10 clinical audit.
- Breed-aware logic exists, but active modifier coverage is currently limited to 26 audited breeds.
- Image support is guarded and supplemental; broader multimodal packs remain future roadmap work.

## Claims That Are Not Currently Allowed

- "Dogs and cats"
- "All pets"
- "`200+ disease profiles`"
- "`200+ breeds`"
- "Clinically validated gold standard" before adjudication is complete
- Broad multimodal claims that imply validated eye, ear, oral, gait, audio, or species-general support

## Immediate Product and Docs Actions in VET-1301

- Update roadmap to make Wave 3 active and dog-only scope explicit.
- Add a canonical Wave 3 parent spec.
- Rewrite `docs/product-overview.md` to match validated canine scope.
- Remove cat and generic-pet language from high-visibility user-facing surfaces.
- Replace inflated disease, breed, and image-count claims with safer validated wording.

## Follow-on Gates Required Before Claims Can Expand

### Before broader clinical-quality claims

- `VET-1302`
- `VET-1303`
- `VET-1304`
- `VET-1310`

### Before provenance-backed report trust claims

- `VET-1307`
- `VET-1308`
- `VET-1309`

### Before broader multimodal claims

- Wave 5 modality packs and their scorecards

### Before any feline or multi-species claim

- Feline ontology, benchmark, routing, review, and rollout gating

## Decision

The canonical PawVital scope is now:

**Dog-only, deterministic, safety-heavy triage with validated canine foundations and explicitly bounded public claims until Wave 3 adjudication and provenance work lands.**
