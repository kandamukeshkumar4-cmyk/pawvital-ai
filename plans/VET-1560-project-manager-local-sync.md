# VET-1560 Local Project-Manager Sync

Generated: 2026-05-31T00:00:00.000Z
Mode: local-project-manager-fallback-sync
Local fallback ready: true
Azure live call made: false

## Local Queue

| Ticket | Title | Dependencies | Verifier | Status |
|---|---|---|---|---|
| VET-1561 | Build model dataset manifest and holdout policy | none | plans/VET-1561-model-dataset-manifest.json | queued-local-project-manager |
| VET-1562 | Package offline narrow-model experiment evidence | VET-1561 | plans/VET-1562-offline-experiment-package.json | queued-local-project-manager |
| VET-1563 | Prepare model promotion evidence without changing runtime routes | VET-1561, VET-1562 | plans/VET-1563-extraction-promotion-evidence-packet.json | queued-local-project-manager |
| VET-1564 | Prepare Whoop-style product intelligence evidence contract | none | plans/VET-1564-longitudinal-readiness-contract.json | queued-local-project-manager |
| VET-1565 | Proposal-only Tugboat governance adoption | none | plans/VET-1565-tugboat-governance-plan.json | queued-local-project-manager |

## Azure Live-Sync Blockers

- AZURE_DEVOPS_ORG missing
- AZURE_DEVOPS_PROJECT missing
- AZURE_DEVOPS_PAT missing

## Guardrails

- This artifact is local project-manager fallback evidence, not Azure Boards live-sync proof.
- Do not mark Azure live sync complete without created Azure work item ids and URLs.
- Do not print or persist AZURE_DEVOPS_PAT.
- Do not mutate runtime routes, model flags, provider env, or clinical logic from this sync command.
