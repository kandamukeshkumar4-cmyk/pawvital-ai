# VET-1560 Readiness Dashboard

Generated: 2026-05-31T00:00:00.000Z
Mode: review-only-dashboard
Overall status: BLOCKED

2 lane(s) blocked before the full objective is complete.

## Lanes

| Lane | Status | Summary | Next action |
|---|---|---|---|
| Project-manager sync | READY | 5 tickets queued in the local project-manager fallback; Azure live sync remains blocked by: AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT. | Use plans/VET-1560-project-manager-local-sync.json as the current execution queue; add Azure credentials only in a separate live-sync pass. |
| Model/NIM promotion | BLOCKED | 5 blocked evidence categories; candidate selection resolved=false; promotion ticket candidate resolved=false; owner approval request ready=false; 0/3 candidate output hashes populated; candidate capture gates blocked=3; diagnostic candidate content hashes without evidence hash=0; evidence packet has 5 attachment slots; capture runbook has 3 gated steps; capture authorization ready=false; promotion smoke runbook has 5 evidence steps; promotion ticket blockers=6. | validation=0, holdout=0, threshold=4.2 |
| Claim-language review | BLOCKED | missing review inputs: src/lib/product-intelligence.ts, src/components/analytics/product-intelligence-panel.tsx | Resolve blocked claim-language findings before expanding product copy. |
| Whoop-style product contract | READY | 3 implementation tickets defined; production smoke ready=false, live migration applied=false; smoke runbook has 5 evidence steps. | Apply the approved Supabase migration, then run the authenticated production owner workflow smoke from plans/VET-1564-production-readiness.json. |
| Instruction governance | READY | VET-1565 defines a proposal-only Tugboat adoption plan with 4 phases and 6 PawVital boundaries. | Use VET-1565 for any Tugboat-style instruction observability work; do not install, run llmff, or apply instruction patches without a separate approved trace bundle and reviewer decision. |

## Blockers

- Model/NIM promotion: 5 blocked evidence categories; candidate selection resolved=false; promotion ticket candidate resolved=false; owner approval request ready=false; 0/3 candidate output hashes populated; candidate capture gates blocked=3; diagnostic candidate content hashes without evidence hash=0; evidence packet has 5 attachment slots; capture runbook has 3 gated steps; capture authorization ready=false; promotion smoke runbook has 5 evidence steps; promotion ticket blockers=6.
- Claim-language review: missing review inputs: src/lib/product-intelligence.ts, src/components/analytics/product-intelligence-panel.tsx

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
- `plans/VET-1560-project-manager-sync-readiness.json` (a729f82e726d028dbb2ddc1ac2c6c9f9c1aba3da1028e3c6146f3ff59d93ca1a)
- `plans/VET-1560-project-manager-local-sync.json` (5febb8eda6290d19b99bb1d77e2d20873cb5023bd01227b4608c77cb85425c8d)
- `plans/VET-1563-extraction-promotion-readiness-preflight.json` (b7551eaf04974a4235988e6b0300e3f66c2f9e7ac87f4e55b7966fc00a6f1497)
- `plans/VET-1563-extraction-promotion-evidence-packet.json` (b02a4a2a7d913307317da49c717a1d0d3a88b409cfe73bf1975256844399f17f)
- `plans/VET-1563-extraction-candidate-selection-packet.json` (a4bc894840e56b8bbe65fdbf2100284de5863d643ad428c609a8a75822427b6d)
- `plans/VET-1563-extraction-frozen-output-templates.json` (8e64adcdb2a561e865531245b8b627cf995e42a48f58a42713e09fdff141aff9)
- `plans/VET-1563-extraction-frozen-output-status.json` (c787bce0e2074f27f6717befebb3f6b36264bffae43e97e0b135a4f914fbd92b)
- `plans/VET-1563-extraction-output-capture-runbook.json` (23b365c7f311ff925fd9c482b326c959010f6e832b3c3d8d1dfb240bcc1513fb)
- `plans/VET-1563-extraction-output-capture-authorization.json` (a2ed39d42d982401087d506b18fd277b9e6e71d4bff468f398fdb3f713891c9b)
- `plans/VET-1563-extraction-scorecard-review-packet.json` (bab1402bb28bf875177ee74f38f986e74af7bbf5750a8616fb22b616226dbc88)
- `plans/VET-1563-extraction-model-rollback-plan.json` (2f75f73b1a3e3ca6ed57f16318f7c89f100ab06912c50c40e29bf79a8b9dd326)
- `plans/VET-1563-extraction-promotion-smoke-runbook.json` (0b823268c555cafd9f8eb598ebd34dd6124308d797188dc12f0ae0c8118606b9)
- `plans/VET-1563-protected-clinical-diff-proof.json` (fccd0d008074d9fb6051b439e5e8bc9db00003485463c2f50508e75decbf72f8)
- `plans/VET-1563-extraction-runtime-promotion-ticket.json` (76e39951537d0c2ac6a1cc06fd2450de8ddeb1c863c4836b3a2fa5aafb647f0e)
- `plans/VET-1563-extraction-owner-approval-request.json` (23698c963e7012ceba85b96940649d6f498d72a1a92343ef44a0024505713199)
- `plans/VET-1564C-claim-language-review.json` (f658182b3c14797a333901b84a20b1697d9b8b6641f44534edbc5aa88e441bde)
- `plans/VET-1564-longitudinal-readiness-contract.json` (21ff009788c937303f812e0f7cf972f6767fb15d030810a3635f1fb3e108aeda)
- `plans/VET-1564-production-readiness.json` (f151580f6611020087e3e1d45fc76f04af7ae2bdc9a4b38bf314cb950fe6e766)
- `plans/VET-1564-production-smoke-runbook.json` (5045cf8a82183dbabde6b662926844e00542fcdd9cf7be52a0d6472dfdd913c4)
- `plans/VET-1565-tugboat-governance-plan.json` (e170f2f7a1d90bc3195a88141900be716e121cc55857c0eaddadcd1e378feb42)
- `plans/VET-1560-regeneration-summary.json` (17e1630c85024355b1fab9db3d0b666c3fccf78974be1a9c84254c2b3fffb968)
