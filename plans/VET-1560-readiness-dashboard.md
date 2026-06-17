# VET-1560 Readiness Dashboard

Generated: 2026-05-31T00:00:00.000Z
Mode: review-only-dashboard
Overall status: BLOCKED

2 lane(s) blocked before the full objective is complete.

## Lanes

| Lane | Status | Summary | Next action |
|---|---|---|---|
| Project-manager sync | READY | 5 tickets queued in the local project-manager fallback; queue validation=passed; 5/5 verifier artifacts present; 3/3 dependency edges ordered; Azure live sync remains blocked by: AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT. | Use plans/VET-1560-project-manager-local-sync.json as the current execution queue; add Azure credentials only in a separate live-sync pass. |
| Model/NIM promotion | BLOCKED | 6 blocked evidence categories; candidate selection resolved=false; candidate evidence provenance resolved=false; No approved candidate model or adapter identity was found in the VET-1562 offline package or narrow-pack experiment manifest. Sources inspected: vet-1562-offline-experiment-package=unresolved-candidate-identity, runpod-narrow-model-pack-manifest=experiment-manifest-only; candidate approval intake status=blocked, missing fields=11; promotion ticket candidate resolved=false; owner approval request ready=false; 0/3 candidate output hashes populated; candidate capture gates blocked=3; diagnostic candidate content hashes without evidence hash=0; evidence packet has 6 attachment slots; capture runbook has 5 gated steps; capture authorization ready=false; promotion smoke runbook has 5 evidence steps; promotion ticket blockers=7. | validation=0, holdout=0, threshold=4.2 |
| Launch/public beta readiness | BLOCKED | 7 launch gates reviewed; public beta=hold; model promotion=hold; owner-visible UX proof=partial; backend readout proof=hold. | Critical production, Cohort 1, monitoring, product-intelligence, model-promotion, and support/privacy evidence remains incomplete. |
| Claim-language review | READY | 516 strings reviewed with no blocked findings. | Rerun node scripts/build-product-claim-language-review.mjs --write after any owner-visible copy change. |
| Whoop-style product contract | READY | 4 implementation tickets defined; product-intelligence persistence=go-current-production; write deployment=dpl_Bo7RYGjXjV6HGNs5XXUMA97zs7FL; current deployment=dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb; current smoke=current-deployment-write-exercised; historical readiness row=8815e992-9b9b-4b1d-9fb4-8690578ecc24; current readiness row=61c44ae9-5b30-482d-8207-efbaf6598140; recovery checkpoint status=schema-and-route-ready-production-write-not-exercised. | Current-deployment daily readiness write proof passed; capture recovery-checkpoint production write or blocked-reason smoke before claiming recovery write coverage. |
| Instruction governance | READY | VET-1565 defines a proposal-only Tugboat adoption plan with 4 phases and 6 PawVital boundaries. | Use VET-1565 for any Tugboat-style instruction observability work; do not install, run llmff, or apply instruction patches without a separate approved trace bundle and reviewer decision. |

## Blockers

- Model/NIM promotion: 6 blocked evidence categories; candidate selection resolved=false; candidate evidence provenance resolved=false; No approved candidate model or adapter identity was found in the VET-1562 offline package or narrow-pack experiment manifest. Sources inspected: vet-1562-offline-experiment-package=unresolved-candidate-identity, runpod-narrow-model-pack-manifest=experiment-manifest-only; candidate approval intake status=blocked, missing fields=11; promotion ticket candidate resolved=false; owner approval request ready=false; 0/3 candidate output hashes populated; candidate capture gates blocked=3; diagnostic candidate content hashes without evidence hash=0; evidence packet has 6 attachment slots; capture runbook has 5 gated steps; capture authorization ready=false; promotion smoke runbook has 5 evidence steps; promotion ticket blockers=7.
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
- `plans/VET-1563-extraction-promotion-readiness-preflight.json` (27d3d3b08b8e3e582462fc56f5a66b4d048700de8e4ac5de180af920bd02b4c9)
- `plans/VET-1563-extraction-promotion-evidence-packet.json` (6287822c2bb799b90de287a8b9386b19a08025f79580c7a4f731b39244e3e803)
- `plans/VET-1563-extraction-candidate-selection-packet.json` (3a522d4010138144e30be00d7e83b1650452beadbfad013040813788b7f1cf22)
- `plans/VET-1563-extraction-frozen-output-templates.json` (f5576de6c0f2e30c994068c18ac9e4aa7c5b12ed9188b0375045b13464dbff83)
- `plans/VET-1563-extraction-frozen-output-status.json` (714b0e63be9f2d47dd5ac4a76e4b1441718266bfadf01dc9e7bf1f9425db092c)
- `plans/VET-1563-extraction-output-capture-runbook.json` (5d116ed224f288a66aacca4605346ffce5b60dcc2ddece54c3eb93ea54900425)
- `plans/VET-1563-extraction-output-capture-authorization.json` (c30fc7b18274f4f6df77f0e3429761bbe14ee4b1160fd1191ec270f460ae2936)
- `plans/VET-1563-extraction-candidate-approval-intake.json` (502be343f17255ecbd74c9c630080a37406ebb137fc737e419c8611dc6e98c5a)
- `plans/VET-1563-extraction-scorecard-review-packet.json` (eaae8ce183ace9a8e022b96a62046e00945473cfa8f8bdedeb3f9567ce769c64)
- `plans/VET-1563-extraction-model-rollback-plan.json` (d71f0f5475f0fa87ac2bef0ac466a6950276b670ec4f4008375edfa37986ccc8)
- `plans/VET-1563-extraction-promotion-smoke-runbook.json` (94ec9b8ba4b3bc0deab4068f723934c4fcfe30960ad90f64231dddeaa52f804d)
- `plans/VET-1563-protected-clinical-diff-proof.json` (2295dbe3d7c5c28622c974e42c9efdab4736f5e5b7532951d94265706e828dab)
- `plans/VET-1563-extraction-runtime-promotion-ticket.json` (621fff9520fd12a8aa8a5b8491b2e089bde956cd6453258bb37ca5b1fa6063c4)
- `plans/VET-1563-extraction-owner-approval-request.json` (1b7082aea51683d65c07170637878acba43449c2342b1b8e2ad8a5d1b8016d91)
- `plans/VET-1564C-claim-language-review.json` (96d593f77fcced2bada64d726bc8027b6bf942ee0f10034661cc7df4aec879e9)
- `plans/VET-1564-longitudinal-readiness-contract.json` (acb29570db047d175af91eb2f7346df5e20e162618c60ef40b0670cfb6107f59)
- `plans/VET-1564-production-readiness.json` (d2ca44ae75ebd2021bbd14593ece78917f38c54e23188a5e88885e59498b6df6)
- `plans/VET-1564-production-smoke-runbook.json` (ec068314652ba8ab12e3df7867d7209b5e6bb7dd85c76cf118874359bbeb1ba3)
- `plans/VET-1565-tugboat-governance-plan.json` (5df3fd43414c3b2da9e8ba51304aa44edb86f51ab00826d12a26a940c058f151)
- `plans/VET-1560-regeneration-summary.json` (regeneration summary is finalized after the dashboard; hashing it here would make regeneration non-idempotent)
