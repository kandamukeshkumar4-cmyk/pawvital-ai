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
- `plans/VET-1563-extraction-promotion-readiness-preflight.json` (9915b5034062197e9c7fc044f0e3781637681b9eca5a6022ba87b7bab2add6e0)
- `plans/VET-1563-extraction-promotion-evidence-packet.json` (0f223772ab5480e6c133d7a24a5ebb1b24b700268a779fc48c3729ed46a5c7ee)
- `plans/VET-1563-extraction-candidate-selection-packet.json` (595ce8c183d44a427bfd6c03cf536e3fe6afc4fe31c1b4c5920c4b025976ebdb)
- `plans/VET-1563-extraction-frozen-output-templates.json` (3ef7680dff1e1f533c0715cb04f5a3018d3855150f2c24f842ff83041138245e)
- `plans/VET-1563-extraction-frozen-output-status.json` (9af4494ed969d7e3d33da74f7d6b583555a19d75e9bfee070416763cba70c4c8)
- `plans/VET-1563-extraction-output-capture-runbook.json` (bf14e26a278aacbe02b7ff0fdd5ccdec9d77e72e64e35d7643b06cbbe602e720)
- `plans/VET-1563-extraction-output-capture-authorization.json` (ef28ca464bc154831b5af5bd25619851bb20a206d6c4ac71b51cdfddfd8098ba)
- `plans/VET-1563-extraction-scorecard-review-packet.json` (086505008ea2f35564742159102b38bd7869399566ba20b9f42254eee5f05d7d)
- `plans/VET-1563-extraction-model-rollback-plan.json` (370507e4d1ce6aade8051e66d9367433baa5d04cd434b4bf1b51291c76ef639e)
- `plans/VET-1563-extraction-promotion-smoke-runbook.json` (2bb486dd98f5cfc950eaabd094cbd18eba533931ad048cfdc56bc515acf94d38)
- `plans/VET-1563-protected-clinical-diff-proof.json` (fccd0d008074d9fb6051b439e5e8bc9db00003485463c2f50508e75decbf72f8)
- `plans/VET-1563-extraction-runtime-promotion-ticket.json` (82e8384c49bcd045c25205376d7b96083970ac5e9d0277322acc99bad2000ec0)
- `plans/VET-1563-extraction-owner-approval-request.json` (8ccc2134cd84cbaab10dee0bca55cca0f13cf89f47f74af4d9e5301f9878e7be)
- `plans/VET-1564C-claim-language-review.json` (543f4e0341c0e8e70656d8c172d5b7602515606a7281c24303b0c29ee95ef06d)
- `plans/VET-1564-longitudinal-readiness-contract.json` (c65bffa91a1122a927c54e3ea615e2dbb6816ceb3ceade04b580d39af5b8be96)
- `plans/VET-1564-production-readiness.json` (b4aec836949a75079d75efe7cfcc6bc8fcfdac88663ce37f0a5cb613886c009c)
- `plans/VET-1564-production-smoke-runbook.json` (1643880a8d48c9ef1c68b95d744da274a8b0b2c65b06d88470b6da667e2d56d7)
- `plans/VET-1565-tugboat-governance-plan.json` (5df3fd43414c3b2da9e8ba51304aa44edb86f51ab00826d12a26a940c058f151)
- `plans/VET-1560-regeneration-summary.json` (regeneration summary is finalized after the dashboard; hashing it here would make regeneration non-idempotent)
