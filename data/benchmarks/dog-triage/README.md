# Dog Triage Benchmarks

Files:

- `sample-cases.json` - small seed suite for smoke checks
- `gold-candidate/` - larger pre-adjudication benchmark pack sharded by category
- `GOLD_ADJUDICATION_GUIDE.md` - reviewer rubric for promoting the candidate pack to true gold
- `adjudication-record.schema.json` - schema for the structured dual-review adjudication pack
- `adjudication-worklist.json` - generated structured review pack
- `adjudication-worklist.csv` - generated spreadsheet-friendly review pack
- `benchmark.schema.json` - suite schema
- `silent-trial.schema.json` - silent-trial record schema

Important:

- The `gold-candidate/` pack is not yet a true gold standard.
- It is designed to be strong enough for engineering evaluation now.
- Before clinical-quality claims, it still needs veterinarian adjudication and disagreement review.
- The pack now includes higher-risk follow-up and unsafe-unknown cases so RunPod batch evaluation can stress question resolution instead of only first-turn routing.
- Build the adjudication worklist with `node scripts/generate-benchmark-adjudication-pack.mjs`.
