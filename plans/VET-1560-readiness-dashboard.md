# VET-1560 Readiness Dashboard

Generated: 2026-05-31T00:00:00.000Z
Mode: review-only-dashboard
Overall status: BLOCKED

2 lane(s) blocked before the full objective is complete.

## Lanes

| Lane | Status | Summary | Next action |
|---|---|---|---|
| Project-manager sync | READY | 5 tickets queued in the local project-manager fallback; queue validation=passed; 5/5 verifier artifacts present; 3/3 dependency edges ordered; Azure live sync remains blocked by: AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT. | Use plans/VET-1560-project-manager-local-sync.json as the current execution queue; add Azure credentials only in a separate live-sync pass. |
| Model/NIM promotion | BLOCKED | 5 blocked evidence categories; candidate selection resolved=false; candidate evidence provenance resolved=false; No approved candidate model or adapter identity was found in the VET-1562 offline package or narrow-pack experiment manifest. Sources inspected: vet-1562-offline-experiment-package=unresolved-candidate-identity, runpod-narrow-model-pack-manifest=experiment-manifest-only; candidate approval intake status=blocked, missing fields=11; promotion ticket candidate resolved=false; owner approval request ready=false; 0/3 candidate output hashes populated; candidate capture gates blocked=3; diagnostic candidate content hashes without evidence hash=0; evidence packet has 5 attachment slots; capture runbook has 5 gated steps; capture authorization ready=false; promotion smoke runbook has 5 evidence steps; promotion ticket blockers=6. | validation=0, holdout=0, threshold=4.2 |
| Launch/public beta readiness | BLOCKED | 7 launch gates reviewed; public beta=hold; model promotion=hold; owner-visible UX proof=partial; backend readout proof=hold. | Critical production, Cohort 1, monitoring, product-intelligence, model-promotion, and support/privacy evidence remains incomplete. |
| Claim-language review | READY | 397 strings reviewed with no blocked findings. | Rerun npm run product:claim-language-review after any owner-visible copy change. |
| Whoop-style product contract | READY | 4 implementation tickets defined; production smoke ready=true, live migration applied=false; smoke runbook has 5 evidence steps. | Apply the approved Supabase migration, then run the authenticated production owner workflow smoke from plans/VET-1564-production-readiness.json. |
| Instruction governance | READY | VET-1565 defines a proposal-only Tugboat adoption plan with 4 phases and 6 PawVital boundaries. | Use VET-1565 for any Tugboat-style instruction observability work; do not install, run llmff, or apply instruction patches without a separate approved trace bundle and reviewer decision. |

## Blockers

- Model/NIM promotion: 5 blocked evidence categories; candidate selection resolved=false; candidate evidence provenance resolved=false; No approved candidate model or adapter identity was found in the VET-1562 offline package or narrow-pack experiment manifest. Sources inspected: vet-1562-offline-experiment-package=unresolved-candidate-identity, runpod-narrow-model-pack-manifest=experiment-manifest-only; candidate approval intake status=blocked, missing fields=11; promotion ticket candidate resolved=false; owner approval request ready=false; 0/3 candidate output hashes populated; candidate capture gates blocked=3; diagnostic candidate content hashes without evidence hash=0; evidence packet has 5 attachment slots; capture runbook has 5 gated steps; capture authorization ready=false; promotion smoke runbook has 5 evidence steps; promotion ticket blockers=6.
- Launch/public beta readiness: 7 launch gates reviewed; public beta=hold; model promotion=hold; owner-visible UX proof=partial; backend readout proof=hold.

## Guardrails

- Do not treat local project-manager fallback evidence as Azure Boards live-sync evidence.
- Do not mutate runtime NIM, narrow-pack, provider env, or model routing from this dashboard.
- Do not promote a model from validation-only or unpopulated scorecard evidence.
- Do not weaken protected deterministic clinical files while improving product intelligence.
- Keep owner-visible readiness copy tied to evidence coverage and claim-language review.
- Keep Tugboat-style instruction optimization proposal-only until a reviewer approves a trace bundle, policy file, eval suite, and rollback plan.
- Use npm run vet1560:regenerate-all to refresh this evidence chain before handoff.
- Keep launch/public-beta GO separate from review-only roadmap readiness; public beta requires current production evidence.

## Source Artifacts

- `plans/VET-1560-azure-sync-preflight.json` (05f01309f6df160cc6a96d229903d590a9378c855181e49c900c4ad225a1861f)
- `plans/VET-1560-azure-live-sync-runbook.json` (ecc5c7131a83ba9f4d5a07b5ed1fd57e3e356f51d6edb4d482f1c06af37bdf35)
- `plans/VET-1560-project-manager-sync-readiness.json` (674a17b560f3ba7ffc3be5ce773c3253047bce9adf58c8cab9a91faf29ce7088)
- `plans/VET-1560-project-manager-local-sync.json` (3dcaf9b97e308e3f963f771c1d0769e57cb7f06e866d7491eccd7bcc03803850)
- `plans/VET-1560-launch-readiness-gates.json` (63fb04dced0c675df9e92348f7bfe80de54de78296c6d794d9611781ed4d07be)
- `plans/VET-1563-extraction-promotion-readiness-preflight.json` (0d5134776f860d18c1ba7611a70ca883856456c5647e460c91f8e936d934d01a)
- `plans/VET-1563-extraction-promotion-evidence-packet.json` (e3b16647dea0bdad36cf28bd120b8eb790c5c5ba476c4a636fcdbc7e16b7531e)
- `plans/VET-1563-extraction-candidate-selection-packet.json` (3a522d4010138144e30be00d7e83b1650452beadbfad013040813788b7f1cf22)
- `plans/VET-1563-extraction-frozen-output-templates.json` (f5576de6c0f2e30c994068c18ac9e4aa7c5b12ed9188b0375045b13464dbff83)
- `plans/VET-1563-extraction-frozen-output-status.json` (714b0e63be9f2d47dd5ac4a76e4b1441718266bfadf01dc9e7bf1f9425db092c)
- `plans/VET-1563-extraction-output-capture-runbook.json` (5d116ed224f288a66aacca4605346ffce5b60dcc2ddece54c3eb93ea54900425)
- `plans/VET-1563-extraction-output-capture-authorization.json` (be04aa08468bca3ab2e9b8e4f34aa0d1e870fb2a002e08bb77a77a680e39a9d1)
- `plans/VET-1563-extraction-candidate-approval-intake.json` (d4b1aca32bf82fe8f10e576c5a735f77d87147e694a57ebc0526a2f922fa4be6)
- `plans/VET-1563-extraction-scorecard-review-packet.json` (eaae8ce183ace9a8e022b96a62046e00945473cfa8f8bdedeb3f9567ce769c64)
- `plans/VET-1563-extraction-model-rollback-plan.json` (d71f0f5475f0fa87ac2bef0ac466a6950276b670ec4f4008375edfa37986ccc8)
- `plans/VET-1563-extraction-promotion-smoke-runbook.json` (4469c84fbc4d709206b19b3183503d399f2d393c028652867e8c1d7af043ff73)
- `plans/VET-1563-protected-clinical-diff-proof.json` (fccd0d008074d9fb6051b439e5e8bc9db00003485463c2f50508e75decbf72f8)
- `plans/VET-1563-extraction-runtime-promotion-ticket.json` (1bdbd79ca1c9f3a2d05470b0e8d3e0c4143980f1aab60d85b739ea811136464f)
- `plans/VET-1563-extraction-owner-approval-request.json` (5af6d83182802c37a365c78de62ce67f99df3d54aa0317a7dd90528efe8b7243)
- `plans/VET-1564C-claim-language-review.json` (9f9c2ab488c54d175942d573dc6bf1da19dc630fbbe04b2ed2b7adb57f768a21)
- `plans/VET-1564-longitudinal-readiness-contract.json` (54948b3b05e18fcfedd684f604810d57f60275ea8bb9606674108a8f9872e34f)
- `plans/VET-1564-production-readiness.json` (ff1f5ab73ada60269c5b8efc92d6f1e0a5c3159c79f2ec9d29bc8f3cc7f767e9)
- `plans/VET-1564-production-smoke-runbook.json` (39d890717cd92f3245c79da1f519cc7c232a094027737cf5cf1b9562dd472349)
- `plans/VET-1565-tugboat-governance-plan.json` (5df3fd43414c3b2da9e8ba51304aa44edb86f51ab00826d12a26a940c058f151)
- `plans/VET-1560-regeneration-summary.json` (regeneration summary is finalized after the dashboard; hashing it here would make regeneration non-idempotent)
