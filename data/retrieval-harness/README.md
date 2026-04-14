## Retrieval Quality Harness

Canonical canine retrieval slices used for `VET-1112`.

- `canine-cases.json` defines the fixed text and image retrieval prompts.
- `baseline.pre-reindex.json` is the captured baseline snapshot before a live reindex run.
- `latest-run.json` is the most recent local harness execution output.

Run from the repo root:

```bash
npm run eval:retrieval:harness:baseline
npm run eval:retrieval:harness
```

The baseline command writes the current snapshot to `baseline.pre-reindex.json`.
The compare command writes `latest-run.json` and fails if expectation-level regressions are detected against the baseline.
