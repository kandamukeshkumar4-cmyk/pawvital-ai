# Dog Triage Benchmarks

Files:

- `sample-cases.json` - small seed suite for smoke checks
- `gold-candidate/` - larger pre-adjudication benchmark pack sharded by category
- `wave3-freeze/` - canonical Wave 3 dog-only freeze stratified by safety and ambiguity slices
- `wave3-freeze-manifest.json` - canonical Wave 3 suite contract consumed by validation and coverage tooling, with deterministic case/shard ordering and rolled-up coverage counts
- `wave3-freeze-report.md` - generated Markdown summary of the freeze composition
- `GOLD_ADJUDICATION_GUIDE.md` - reviewer rubric for promoting the candidate pack to true gold
- `adjudication-record.schema.json` - schema for the structured dual-review adjudication pack
- `adjudication-worklist.json` - generated structured review pack
- `adjudication-worklist.csv` - generated spreadsheet-friendly review pack
- `vet-a-packet.json` - reviewer packet for the first clinician lane
- `vet-b-packet.json` - reviewer packet for the second clinician lane
- `benchmark.schema.json` - suite schema
- `silent-trial.schema.json` - silent-trial record schema

Important:

- The `gold-candidate/` pack is not yet a true gold standard.
- It is designed to be strong enough for engineering evaluation now.
- Before clinical-quality claims, it still needs veterinarian adjudication and disagreement review.
- The pack now includes higher-risk follow-up and unsafe-unknown cases so RunPod batch evaluation can stress question resolution instead of only first-turn routing.
- Build the adjudication worklist and Wave 3 freeze with `node scripts/generate-benchmark-adjudication-pack.mjs`.

Wave 3 freeze outputs:

- The generator normalizes complaint-family tags, risk tiers, uncertainty patterns, must-not-miss markers, provenance metadata, and pre-seeded adjudication metadata.
- High-risk cases are emitted with dual-review scaffolding, disagreement tracking, and must-ask expectation placeholders.
- `wave3-freeze-manifest.json` is the single source of truth for the canonical Wave 3 suite contract. It includes `suiteId`, `suiteVersion`, `generatedAt`, `manifestHash`, `caseIds`, `shardPaths`, `totalCases`, `complaintFamilyCounts`, `riskTierCounts`, and `modalityCounts` while preserving the existing compatibility fields consumed by the benchmark scripts.
- `caseIds` are unique and lexicographically sorted after de-duplicating overlapping strata membership. `shardPaths` stay in manifest strata order so existing loaders preserve the same precedence when a case belongs to multiple slices.
- The freeze is split into the following strata:
  - `emergency`
  - `urgent`
  - `common`
  - `ambiguous`
  - `contradictory`
  - `low-information`
  - `rare-but-critical`
- Existing multimodal slice inputs under `multimodal-slices/` remain separate source files and are referenced from the freeze manifest/report rather than inlined into the main suites.

Validation commands:

- `npm run eval:benchmark:validate`
- `npm run eval:benchmark:lint`
- `npm run eval:benchmark:coverage`
- `npm run eval:benchmark`
- `npm run eval:benchmark:dangerous`
- `npm run eval:benchmark:release-gate`
- `npm run runpod:benchmark:adjudication`
