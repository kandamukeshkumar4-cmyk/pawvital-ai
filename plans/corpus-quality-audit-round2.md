# Corpus Quality Audit — Round 2

`VET-1216` recalibrates the corpus ingest around a committed manifest instead of fixed trust defaults. `VET-1217` then layers in a verified breed-specific source for the top 10 canine breeds. The source-of-truth file is [data/corpus/csv-ingestion-round2.json](/G:/MY Website/pawvital-ai-vet1217/data/corpus/csv-ingestion-round2.json).

## Decisions

| Source | Prior trust | Round-2 trust | Tier | Decision |
| --- | --- | --- | --- | --- |
| `csv-pet-health-symptoms` | 60 | 40 | noisy_secondary | Retain for offline lexical recall only. Keep below the live trust floor because duplicate and labeling noise remain too high. |
| `csv-veterinary-clinical-data` | 60 | 60 | secondary_verified | Keep at the live floor. Broad enough to remain useful, but not promoted into primary-source territory. |
| `csv-canine-dermatology-followups` | n/a | 80 | verified_primary | New higher-quality round-2 source. Ingestion-ready once the approved local CSV export is staged. |
| `csv-canine-toxicology-followups` | n/a | 80 | verified_primary | New higher-quality round-2 source. Ingestion-ready once the approved local CSV export is staged. |
| `csv-breed-specific-clinical-cases-top10` | 75 | 75 | verified_primary | `VET-1217` curated source with explicit breed IDs, condition labels, and domain tags. Active immediately because the dedicated case file is committed in-repo. |

## Live Safety Rules

- Minimum live trust is `60`.
- Any source below trust `60` is considered non-live and must not be eligible for live retrieval.
- Image live-corpus policies now carry explicit `trustLevel` values so low-trust image datasets cannot leak into live queries.
- Breed-specific case records must carry one breed ID, one condition label, one domain tag, and trust `>= 70`.
- `verify-live-corpus.mjs` now reports audited quality metrics per source and fails if a low-trust or removal-flagged source still clears the live floor.

## Implementation Notes

- `scripts/ingest-csv-corpus.mjs` now reads the round-2 manifest, updates trust metadata on existing sources, and supports resumable per-source batch progress through `tmp/ingest-csv-corpus.checkpoint.json`.
- Missing high-quality CSV exports are treated as `ingestion_ready` placeholders rather than fabricated in-repo data.
- `VET-1217` adds `data/corpus/breed-expansion-profiles.json` plus `data/corpus/csv/breed-specific-clinical-cases-top10.csv` so breed-focused retrieval has dedicated clinical cases instead of relying on generic mixed-breed notes.
- `scripts/verify-live-corpus.mjs` remains the verification entrypoint, but it now performs manifest-driven trust checks and breed-specific smoke checks even when local corpus image assets are not present in the repo snapshot.

## Verification Used For This Slice

- `node scripts/ingest-csv-corpus.mjs --dry-run --source=csv-breed-specific-clinical-cases-top10 --report=tmp/ingest-csv-corpus.breed-report.json`
- `node scripts/verify-live-corpus.mjs`
- `npx --prefix "G:\MY Website\pawvital-ai" jest --runInBand --runTestsByPath tests/live-corpus.test.ts tests/breed-data.test.ts`

The dry-run reports stay out of the repo under `tmp/` and can be regenerated at any time.
