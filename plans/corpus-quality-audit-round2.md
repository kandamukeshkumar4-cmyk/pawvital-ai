# Corpus Quality Audit — Round 2

`VET-1216` recalibrates the corpus ingest around a committed manifest instead of fixed trust defaults. The source-of-truth file is [data/corpus/csv-ingestion-round2.json](/G:/MY Website/pawvital-ai-vet1216/data/corpus/csv-ingestion-round2.json).

## Decisions

| Source | Prior trust | Round-2 trust | Tier | Decision |
| --- | --- | --- | --- | --- |
| `csv-pet-health-symptoms` | 60 | 40 | noisy_secondary | Retain for offline lexical recall only. Keep below the live trust floor because duplicate and labeling noise remain too high. |
| `csv-veterinary-clinical-data` | 60 | 60 | secondary_verified | Keep at the live floor. Broad enough to remain useful, but not promoted into primary-source territory. |
| `csv-canine-dermatology-followups` | n/a | 80 | verified_primary | New higher-quality round-2 source. Ingestion-ready once the approved local CSV export is staged. |
| `csv-canine-toxicology-followups` | n/a | 80 | verified_primary | New higher-quality round-2 source. Ingestion-ready once the approved local CSV export is staged. |

## Live Safety Rules

- Minimum live trust is `60`.
- Any source below trust `60` is considered non-live and must not be eligible for live retrieval.
- Image live-corpus policies now carry explicit `trustLevel` values so low-trust image datasets cannot leak into live queries.
- `verify-live-corpus.mjs` now reports audited quality metrics per source and fails if a low-trust or removal-flagged source still clears the live floor.

## Implementation Notes

- `scripts/ingest-csv-corpus.mjs` now reads the round-2 manifest, updates trust metadata on existing sources, and supports resumable per-source batch progress through `tmp/ingest-csv-corpus.checkpoint.json`.
- Missing high-quality CSV exports are treated as `ingestion_ready` placeholders rather than fabricated in-repo data.
- `scripts/verify-live-corpus.mjs` remains the verification entrypoint, but it now performs manifest-driven trust checks even when local corpus assets are not present in the repo snapshot.

## Verification Used For This Slice

- `node scripts/ingest-csv-corpus.mjs --dry-run --report=tmp/ingest-csv-corpus.round2-report.json`
- `node scripts/verify-live-corpus.mjs`
- `npx --prefix "G:\MY Website\pawvital-ai" jest --runInBand --runTestsByPath tests/live-corpus.test.ts`

The dry-run report stays out of the repo under `tmp/` and can be regenerated at any time.
