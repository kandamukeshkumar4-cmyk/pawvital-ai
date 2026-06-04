# VET-1560 Readiness Dashboard

Generated: 2026-05-31T00:00:00.000Z
Mode: review-only-dashboard
Overall status: BLOCKED

1 lane(s) blocked before the full objective is complete.

## Lanes

| Lane | Status | Summary | Next action |
|---|---|---|---|
| Project-manager sync | READY | 5 tickets queued in the local project-manager fallback; queue validation=passed; 5/5 verifier artifacts present; 3/3 dependency edges ordered; Azure live sync remains blocked by: AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT. | Use plans/VET-1560-project-manager-local-sync.json as the current execution queue; add Azure credentials only in a separate live-sync pass. |
| Model/NIM promotion | BLOCKED | 5 blocked evidence categories; candidate selection resolved=false; candidate evidence provenance resolved=false; No approved candidate model or adapter identity was found in the VET-1562 offline package or narrow-pack experiment manifest. Sources inspected: vet-1562-offline-experiment-package=unresolved-candidate-identity, runpod-narrow-model-pack-manifest=experiment-manifest-only; promotion ticket candidate resolved=false; owner approval request ready=false; 0/3 candidate output hashes populated; candidate capture gates blocked=3; diagnostic candidate content hashes without evidence hash=0; evidence packet has 5 attachment slots; capture runbook has 5 gated steps; capture authorization ready=false; promotion smoke runbook has 5 evidence steps; promotion ticket blockers=6. | validation=0, holdout=0, threshold=4.2 |
| Claim-language review | READY | 397 strings reviewed with no blocked findings. | Rerun npm run product:claim-language-review after any owner-visible copy change. |
| Whoop-style product contract | READY | 4 implementation tickets defined; production smoke ready=true, live migration applied=false; smoke runbook has 5 evidence steps. | Apply the approved Supabase migration, then run the authenticated production owner workflow smoke from plans/VET-1564-production-readiness.json. |
| Instruction governance | READY | VET-1565 defines a proposal-only Tugboat adoption plan with 4 phases and 6 PawVital boundaries. | Use VET-1565 for any Tugboat-style instruction observability work; do not install, run llmff, or apply instruction patches without a separate approved trace bundle and reviewer decision. |

## Blockers

- Model/NIM promotion: 5 blocked evidence categories; candidate selection resolved=false; candidate evidence provenance resolved=false; No approved candidate model or adapter identity was found in the VET-1562 offline package or narrow-pack experiment manifest. Sources inspected: vet-1562-offline-experiment-package=unresolved-candidate-identity, runpod-narrow-model-pack-manifest=experiment-manifest-only; promotion ticket candidate resolved=false; owner approval request ready=false; 0/3 candidate output hashes populated; candidate capture gates blocked=3; diagnostic candidate content hashes without evidence hash=0; evidence packet has 5 attachment slots; capture runbook has 5 gated steps; capture authorization ready=false; promotion smoke runbook has 5 evidence steps; promotion ticket blockers=6.

## Guardrails

- Do not treat local project-manager fallback evidence as Azure Boards live-sync evidence.
- Do not mutate runtime NIM, narrow-pack, provider env, or model routing from this dashboard.
- Do not promote a model from validation-only or unpopulated scorecard evidence.
- Do not weaken protected deterministic clinical files while improving product intelligence.
- Keep owner-visible readiness copy tied to evidence coverage and claim-language review.
- Keep Tugboat-style instruction optimization proposal-only until a reviewer approves a trace bundle, policy file, eval suite, and rollback plan.
- Use npm run vet1560:regenerate-all to refresh this evidence chain before handoff.

## Source Artifacts

- `plans/VET-1560-azure-sync-preflight.json` (05f01309f6df160cc6a96d229903d590a9378c855181e49c900c4ad225a1861f)
- `plans/VET-1560-azure-live-sync-runbook.json` (ecc5c7131a83ba9f4d5a07b5ed1fd57e3e356f51d6edb4d482f1c06af37bdf35)
- `plans/VET-1560-project-manager-sync-readiness.json` (674a17b560f3ba7ffc3be5ce773c3253047bce9adf58c8cab9a91faf29ce7088)
- `plans/VET-1560-project-manager-local-sync.json` (3dcaf9b97e308e3f963f771c1d0769e57cb7f06e866d7491eccd7bcc03803850)
- `plans/VET-1563-extraction-promotion-readiness-preflight.json` (e09fbd1e6c844f3232c69977dee286237c660dbc9fda4f443727f7101d943bf5)
- `plans/VET-1563-extraction-promotion-evidence-packet.json` (3f564395c1998a62711b32344310da99baaee6264903d6c31590093995173b94)
- `plans/VET-1563-extraction-candidate-selection-packet.json` (a8783640cbcb626d130217b0d42d60be8b7a6c901862598a29bb5628f6818e54)
- `plans/VET-1563-extraction-frozen-output-templates.json` (6fe951b6f375c471700f29c4f15b021a507fb0cafdae84d7d1f2cac46c614c80)
- `plans/VET-1563-extraction-frozen-output-status.json` (e5d6b1e8bef1e76559276ed0bce7773201cb78c70bc3433a19d1fdfa74c2dbbb)
- `plans/VET-1563-extraction-output-capture-runbook.json` (65fc509e6ea50732fdd73fdfdfb4f77a61fe3fd1347f400077b6d9ff7464bf3a)
- `plans/VET-1563-extraction-output-capture-authorization.json` (9503aa9384605c460a712f66d4943b066de3d335bc34e2813477de914abe5d5f)
- `plans/VET-1563-extraction-scorecard-review-packet.json` (de41111a0244edf9b9f72f10ce08a57ffcc65eded41af041820973d8632c1a3d)
- `plans/VET-1563-extraction-model-rollback-plan.json` (d71f0f5475f0fa87ac2bef0ac466a6950276b670ec4f4008375edfa37986ccc8)
- `plans/VET-1563-extraction-promotion-smoke-runbook.json` (5204ad6455377442f21eb066e65f38e6ac44ab95a7e4c0f0d272f3e0162f4c33)
- `plans/VET-1563-protected-clinical-diff-proof.json` (fccd0d008074d9fb6051b439e5e8bc9db00003485463c2f50508e75decbf72f8)
- `plans/VET-1563-extraction-runtime-promotion-ticket.json` (f0695218de335b09dcf0e25899ffd79e90266415f27b7d1a581a529b067c0e76)
- `plans/VET-1563-extraction-owner-approval-request.json` (63f90667f723b3176bde51f9ebaf569b76d1395a542385351f7875a30a5dbfc8)
- `plans/VET-1564C-claim-language-review.json` (543f4e0341c0e8e70656d8c172d5b7602515606a7281c24303b0c29ee95ef06d)
- `plans/VET-1564-longitudinal-readiness-contract.json` (c65bffa91a1122a927c54e3ea615e2dbb6816ceb3ceade04b580d39af5b8be96)
- `plans/VET-1564-production-readiness.json` (b4aec836949a75079d75efe7cfcc6bc8fcfdac88663ce37f0a5cb613886c009c)
- `plans/VET-1564-production-smoke-runbook.json` (1643880a8d48c9ef1c68b95d744da274a8b0b2c65b06d88470b6da667e2d56d7)
- `plans/VET-1565-tugboat-governance-plan.json` (5df3fd43414c3b2da9e8ba51304aa44edb86f51ab00826d12a26a940c058f151)
- `plans/VET-1560-regeneration-summary.json` (regeneration summary is finalized after the dashboard; hashing it here would make regeneration non-idempotent)
