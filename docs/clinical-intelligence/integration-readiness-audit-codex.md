# VET-1415C: Clinical Intelligence Integration Readiness Audit

## Audit Scope

This audit covers the newly merged clinical-intelligence scaffold surfaces after:

- VET-1412K / PR #413: `86df4aa2d1ba861db8d970b303ad34e23c3c932f`
- VET-1413Q / PR #412: `0859839bc6d743c4eaa5557076faec6b1c270858`
- VET-1414K / PR #414: `0df994330fe019b613fa118f02e4babf44b6c3ec`

Inspected areas:

- `src/lib/clinical-intelligence/complaint-modules/`
- `src/lib/clinical-intelligence/vet-knowledge/`
- `tests/clinical-intelligence/`
- `docs/clinical-intelligence/`

This is a readiness audit only. It does not wire the scaffolds into symptom chat, planner behavior, triage logic, emergency sentinel logic, or production UI/API surfaces.

## Complaint Modules Available

The complaint-module registry currently exports seven modules:

| Module ID | Purpose | Status |
| --- | --- | --- |
| `skin_itching_allergy` | Skin, itching, allergy, rash, swelling concern routing | Scaffold available |
| `gi_vomiting_diarrhea` | Vomiting, diarrhea, bloat, toxin, dehydration concern routing | Scaffold available |
| `limping_mobility_pain` | Limping, lameness, mobility, trauma concern routing | Scaffold available |
| `respiratory_distress` | Coughing, wheezing, breathing difficulty concern routing | Scaffold available |
| `seizure_collapse_neuro` | Seizure, collapse, neurologic concern routing | Scaffold available |
| `urinary_obstruction` | Urination problem and possible obstruction concern routing | Scaffold available |
| `toxin_poisoning_exposure` | Toxin, poisoning, ingestion, and exposure concern routing | Scaffold available |

Readiness status:

- All seven modules are exported from `src/lib/clinical-intelligence/complaint-modules/index.ts`.
- Each module has triggers, aliases, emergency-screen question IDs, phases, stop conditions, report fields, and safety notes.
- `validateComplaintModules()` checks unique IDs, known question-card references, stop conditions, report fields, diagnosis/treatment language, valid phase IDs, and positive phase limits.
- Focused tests confirm trigger matching, boundary-aware lexical matching, emergency-first phase order, known question-card references, and valid red-flag/signal IDs.

## Vet-Knowledge Scaffolds Available

The vet-knowledge scaffold currently includes:

| Surface | File | Status |
| --- | --- | --- |
| Source metadata registry | `source-registry.ts`, `source-summaries.ts` | Available |
| Retrieval policy | `retrieval-policy.ts` | Available |
| Retrieval planner | `retrieval-planner.ts` | Available |
| Citation policy | `citation-policy.ts` | Available |
| Citation builder | `citation-builder.ts` | Available |

Current curated source IDs:

- `merck-emergency-triage-xabcde`
- `aaha-pet-emergency-signs`
- `avma-teletriage-vcpr`
- `cornell-bloat-gdv-owner`
- `internal-vet-reviewed-question-notes`

Readiness status:

- Registry validation passes for duplicate IDs, required fields, `lastReviewedAt`, treatment-instruction patterns, publisher coverage, license status, allowed use, and source metadata completeness.
- Retrieval policy is explicitly curated-only and disallows open-web search, runtime source fetching, diagnosis generation, treatment generation, medication generation, dosage generation, and home-care generation.
- Retrieval planner selects sources from curated metadata only, supports complaint-family, red-flag, allowed-use, and max-source filters, returns defensive clones, and returns safe empty plans for unknown filters.
- Citation builder consumes retrieval plans, emits metadata-only citation objects, filters to `owner_visible_citation`, and excludes internal/retrieval-summary-only sources from owner-visible citation output.

## ID Consistency Status

Complaint modules:

- Module IDs are unique across all seven modules.
- All emergency-screen and phase question IDs referenced by the modules exist in the question-card registry.
- Stop-condition red flags are covered by emitted question-card red flags or canonical emergency red-flag IDs.
- Stop-condition signal IDs are covered by `clinical-signal-detector.ts`.
- Tests explicitly reject known short-trigger false positives such as `rash` in `trash`, `lame` in `inflamed`, `cough` in `scoffing`, `fit` in `benefit`, `uti` in `cuticle`, and `pee` in `speed`.
- Pack 3 tests also reject toxin trigger false positives such as `ate` in `later`, `toxic` in `nontoxic`, and `pills` in `spills`.

Vet knowledge:

- Source IDs are unique.
- Allowed-use values are restricted to the declared `VetKnowledgeAllowedUse` union.
- Owner-visible citation output is limited to sources whose `allowedUse` is `owner_visible_citation`.
- Source complaint-family labels are metadata labels, not complaint-module IDs. Runtime integration needs an explicit mapping layer before module-selected complaints can drive vet-knowledge retrieval.

Cross-surface status:

- No direct runtime coupling currently exists between complaint modules and vet-knowledge scaffolds.
- No direct references from `symptom-chat`, `triage-engine`, `clinical-matrix`, `symptom-memory`, planner runtime code, or emergency sentinel logic were found during this audit.
- The scaffold surfaces are internally consistent as standalone TypeScript utilities, but they are not yet integration-ready for production behavior without a mapping and acceptance-test layer.

## Known Non-Goals Preserved

- No symptom-chat wiring.
- No planner behavior change.
- No triage-engine changes.
- No clinical-matrix changes.
- No symptom-memory changes.
- No emergency sentinel logic changes.
- No API route changes.
- No UI changes.
- No runtime RAG calls.
- No open-web search.
- No URL fetching or source scraping.
- No diagnosis, treatment, medication, dosage, or home-care generation.

## Exact Prerequisites Before Runtime Integration

Before any production wiring starts, add a focused integration design and test slice that covers:

1. Complaint-module to vet-knowledge family mapping.
   - Example: `gi_vomiting_diarrhea` maps to `gastrointestinal`; `limping_mobility_pain` maps to `musculoskeletal`; `seizure_collapse_neuro` maps to `neurological`; `toxin_poisoning_exposure` needs an explicit toxicology or emergency-family mapping decision because no dedicated toxin complaint family exists in the current vet-knowledge source metadata.
   - This mapping should be explicit and tested rather than inferred from display names or trigger text.

2. Red-flag translation contract.
   - Module stop-condition red flags and question-card red flags do not always have one-to-one coverage in `VET_KNOWLEDGE_SOURCES.redFlags`.
   - Integration should define which module or case-state red flags are eligible to become retrieval filters and which should be used only for urgency routing.

3. Source-of-truth decision for source metadata.
   - `source-registry.ts` exposes a mutable registry API, while the retrieval planner currently reads `VET_KNOWLEDGE_SOURCES` directly from `source-summaries.ts`.
   - Runtime integration should choose one source path and document initialization expectations before any route or planner consumes it.

4. Owner-visible citation boundary.
   - Citation output must remain metadata-only.
   - Internal reasoning and retrieval-summary-only sources must not be exposed in owner-facing copy.
   - Owner-visible citations should be connected only to a reviewed handoff/rationale surface, not emergency escalation text by default.

5. Failure and fallback behavior.
   - Empty retrieval plans and empty citation results should never block emergency routing or handoff.
   - Unknown families/red flags should produce safe empty metadata results plus internal observability, not owner-facing errors.

6. Runtime acceptance tests.
   - Add tests that prove any future wiring does not alter deterministic urgency decisions.
   - Add route or planner-level tests only after a scoped integration ticket authorizes runtime behavior changes.

## Risks And Blockers

No blocker was found for keeping the current scaffolds merged as isolated metadata utilities.

Runtime integration is blocked until the following are resolved:

- No explicit complaint-module to vet-knowledge family mapping exists.
- No red-flag translation contract exists between module stop conditions, question-card emitted flags, case-state signals, and vet-knowledge source red flags.
- The source metadata source-of-truth is not yet settled between `source-registry.ts` and `source-summaries.ts`.
- No runtime acceptance tests exist to prove future citation/retrieval integration cannot mutate urgency routing, emergency guidance, or protected clinical control state.

## Validation

Executed on branch `codex/vet-1415c-clinical-intelligence-readiness-audit` from `origin/master` at `0df994330fe019b613fa118f02e4babf44b6c3ec`.

| Command | Result |
| --- | --- |
| `npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-mvp.test.ts` | Passed, 50 tests |
| `npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack2.test.ts` | Passed, 57 tests |
| `npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack3.test.ts` | Passed, 29 tests |
| `npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-registry.test.ts` | Passed, 43 tests |
| `npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-retrieval-planner.test.ts` | Passed, 64 tests |
| `npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-citation-builder.test.ts` | Passed, 58 tests |
| `npm run build` | Passed |
