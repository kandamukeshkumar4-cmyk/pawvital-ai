# VET-1560 Regeneration Summary

Generated: 2026-05-31T00:00:00.000Z
Mode: review-only-regeneration
Overall status: SUCCESS

Review-only: true

## Commands

| Step | Status | Command | Artifacts |
|---|---|---|---|
| dataset-manifest | SUCCESS | node scripts/build-model-dataset-manifest.mjs --write | plans/VET-1561-model-dataset-manifest.json |
| model-routing-readout | SUCCESS | node scripts/model-routing-readout.mjs --write | plans/VET-1563-model-routing-matrix.json, plans/VET-1563-model-routing-evaluation-matrix.md |
| model-routing-eval-plan | SUCCESS | node scripts/build-model-routing-evaluation-plan.mjs --write | plans/VET-1563-model-routing-evaluation-plan.json |
| shadow-eval-scaffold | SUCCESS | node scripts/build-model-shadow-eval-scaffold.mjs --role=extraction --write | plans/VET-1563-extraction-shadow-eval-scaffold.json |
| offline-experiment-package | SUCCESS | node scripts/build-model-experiment-package.mjs --write | plans/VET-1562-offline-experiment-package.json |
| candidate-selection-packet | SUCCESS | node scripts/build-model-candidate-selection-packet.mjs --role=extraction --write | plans/VET-1563-extraction-candidate-selection-packet.json |
| output-capture-plan | SUCCESS | node scripts/build-model-output-capture-plan.mjs --role=extraction --write | plans/VET-1563-extraction-frozen-output-capture-plan.json |
| frozen-output-templates | SUCCESS | node scripts/build-model-frozen-output-templates.mjs --role=extraction --write | plans/VET-1563-extraction-frozen-output-templates.json |
| frozen-output-status | SUCCESS | node scripts/build-model-frozen-output-status.mjs --role=extraction --write | plans/VET-1563-extraction-frozen-output-status.json |
| shadow-eval-score | SUCCESS | node scripts/score-model-shadow-eval.mjs --role=extraction --write | plans/VET-1563-extraction-shadow-eval-scorecard.json |
| output-capture-runbook | SUCCESS | node scripts/build-model-output-capture-runbook.mjs --role=extraction --write | plans/VET-1563-extraction-output-capture-runbook.json |
| scorecard-review-packet | SUCCESS | node scripts/build-model-scorecard-review-packet.mjs --role=extraction --write | plans/VET-1563-extraction-scorecard-review-packet.json |
| rollback-plan | SUCCESS | node scripts/build-model-rollback-plan.mjs --role=extraction --write | plans/VET-1563-extraction-model-rollback-plan.json |
| protected-clinical-diff-proof | SUCCESS | node scripts/build-protected-clinical-diff-proof.mjs --write | plans/VET-1563-protected-clinical-diff-proof.json |
| model-promotion-smoke-runbook | SUCCESS | node scripts/build-model-promotion-smoke-runbook.mjs --role=extraction --write | plans/VET-1563-extraction-promotion-smoke-runbook.json |
| promotion-ticket | SUCCESS | node scripts/build-model-promotion-ticket.mjs --role=extraction --write | plans/VET-1563-extraction-runtime-promotion-ticket.json |
| promotion-checklist | SUCCESS | node scripts/build-model-promotion-checklist.mjs --role=extraction --write | plans/VET-1563-extraction-promotion-checklist.json |
| promotion-preflight | SUCCESS | node scripts/model-promotion-readiness-preflight.mjs --role=extraction --write | plans/VET-1563-extraction-promotion-readiness-preflight.json |
| promotion-evidence-packet | SUCCESS | node scripts/build-model-promotion-evidence-packet.mjs --role=extraction --write | plans/VET-1563-extraction-promotion-evidence-packet.json |
| owner-approval-request | SUCCESS | node scripts/build-model-owner-approval-request.mjs --role=extraction --write | plans/VET-1563-extraction-owner-approval-request.json |
| promotion-evidence-packet-with-owner-request | SUCCESS | node scripts/build-model-promotion-evidence-packet.mjs --role=extraction --write | plans/VET-1563-extraction-promotion-evidence-packet.json |
| output-capture-authorization | SUCCESS | node scripts/build-model-output-capture-authorization.mjs --role=extraction --write | plans/VET-1563-extraction-output-capture-authorization.json |
| product-roadmap | SUCCESS | node scripts/build-product-intelligence-roadmap.mjs --write | plans/VET-1564-product-intelligence-roadmap.json |
| product-persistence-schema | SUCCESS | node scripts/verify-product-intelligence-schema.mjs --write | plans/VET-1564-product-persistence-schema-readiness.json |
| product-readiness-contract | SUCCESS | node scripts/build-product-longitudinal-readiness-contract.mjs --write | plans/VET-1564-longitudinal-readiness-contract.json |
| claim-language-review | SUCCESS | node scripts/build-product-claim-language-review.mjs --write | plans/VET-1564C-claim-language-review.json |
| product-production-readiness | SUCCESS | node scripts/build-product-production-readiness.mjs --write | plans/VET-1564-production-readiness.json |
| product-production-smoke-runbook | SUCCESS | node scripts/build-product-production-smoke-runbook.mjs --write | plans/VET-1564-production-smoke-runbook.json |
| tugboat-governance-plan | SUCCESS | node scripts/build-tugboat-governance-plan.mjs --write | plans/VET-1565-tugboat-governance-plan.json |
| azure-sync-preflight | SUCCESS | node scripts/devops/vet1560-azure-sync-preflight.mjs --write | plans/VET-1560-azure-sync-preflight.json, plans/VET-1560-azure-sync-preflight.md |
| azure-live-sync-runbook | SUCCESS | node scripts/devops/vet1560-azure-live-sync-runbook.mjs --write | plans/VET-1560-azure-live-sync-runbook.json |
| project-manager-sync-readiness | SUCCESS | node scripts/devops/vet1560-sync-readiness.mjs --write | plans/VET-1560-project-manager-sync-readiness.json |
| project-manager-local-sync | SUCCESS | node scripts/devops/create-vet1560-work-items.mjs --from plans/VET-1560-project-manager-tickets.json --write | plans/VET-1560-project-manager-local-sync.json, plans/VET-1560-project-manager-local-sync.md |
| project-manager-sync-readiness-final | SUCCESS | node scripts/devops/vet1560-sync-readiness.mjs --write | plans/VET-1560-project-manager-sync-readiness.json |
| readiness-dashboard | SUCCESS | node scripts/build-vet1560-readiness-dashboard.mjs --write | plans/VET-1560-readiness-dashboard.json, plans/VET-1560-readiness-dashboard.md |
| completion-audit | SUCCESS | node scripts/build-vet1560-completion-audit.mjs --write | plans/VET-1560-completion-audit.json, plans/VET-1560-completion-audit.md |

## Guardrails

- Does not run live Azure Boards creation.
- Does not call provider, NIM, RunPod, embedding, or training endpoints.
- Does not install Tugboat, run llmff, or auto-apply instruction patches.
- Does not mutate runtime model routing, provider env, or protected clinical files.
- Leaves project-manager live sync blocked until Azure env vars are explicitly provided.
