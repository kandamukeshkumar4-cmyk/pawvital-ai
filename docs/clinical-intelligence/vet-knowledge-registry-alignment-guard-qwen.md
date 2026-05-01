# VET-1425Q: Vet-Knowledge Registry Alignment Guard

## Status

**Validation-only guard.** This is a test suite and documentation artifact. It does not add runtime retrieval, RAG, open-web search, symptom-chat changes, planner changes, triage-engine changes, clinical-matrix changes, symptom-memory changes, complaint-module behavior changes, or emergency sentinel changes.

## What this is

A cross-registry alignment guard that prevents future complaint-module additions from forgetting vet-knowledge metadata entries. This directly prevents the PR #425 failure from recurring by ensuring:

1. Every registered complaint module has a complaint-source-map entry
2. Every registered complaint module has a coverage-gap-registry entry
3. Every registered complaint module has a source-gap-plan entry
4. Every mapped red flag is a string without forbidden treatment/dosage language
5. Every source ID referenced by metadata exists in source-registry
6. Owner-visible citation intent only references sources allowed for owner-visible citation
7. Unknown or missing source coverage is represented as partial/missing, not silently omitted
8. No long copied source passages (max 500 chars per text field)
9. No diagnosis/treatment/medication/dosage/home-care language in any metadata field

## What this is NOT

- **Not live RAG.** No vector store calls, no embedding lookups, no LLM retrieval.
- **Not open-web search.** No web scraping, no external URL fetching.
- **Not clinical behavior.** No diagnosis, treatment, medication, dosage, or home-care generation.
- **Not wired into production.** No integration with symptom-chat, planner, triage-engine, clinical-matrix, emergency sentinel, or complaint modules.
- **Not runtime retrieval.** Pure validation test suite.

## Files

| File | Purpose |
|------|---------|
| `tests/clinical-intelligence/vet-knowledge-registry-alignment.test.ts` | Cross-registry alignment guard tests |
| `docs/clinical-intelligence/vet-knowledge-registry-alignment-guard-qwen.md` | This document |

## Registries guarded

The alignment guard validates consistency across four registries:

| Registry | Source file | Purpose |
|----------|-------------|---------|
| Complaint Modules | `src/lib/clinical-intelligence/complaint-modules/index.ts` | Core complaint module definitions |
| Complaint Source Map | `src/lib/clinical-intelligence/vet-knowledge/complaint-source-map.ts` | Maps modules to vet-knowledge families, red flags, retrieval/citation intent |
| Coverage Gap Registry | `src/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry.ts` | Tracks source coverage level and owner-visible citation coverage per module |
| Source Gap Plan | `src/lib/clinical-intelligence/vet-knowledge/source-gap-plan.ts` | Derives gap priority and action items from coverage registry |
| Source Registry | `src/lib/clinical-intelligence/vet-knowledge/source-registry.ts` | Curated vet-knowledge sources with publisher, topic, allowed-use metadata |

## Guard checks

### 1. Module -> Source-Map alignment

Every module ID returned by `getComplaintModules()` must have a corresponding entry in the complaint source map. The test verifies:

- Count equality: `sourceMapEntries.length === registeredModules.length`
- ID presence: every `mod.id` exists in `sourceMapEntries`
- Shape validity: each entry has `complaintModuleId`, `displayName`, `vetKnowledgeFamilies[]`, `relevantRedFlags[]`, `rationaleNotes[]`

### 2. Module -> Coverage-Gap alignment

Every registered module must have a coverage-gap entry. The test verifies:

- Count equality: `coverageEntries.length === registeredModules.length`
- ID presence: every `mod.id` exists in `coverageEntries`
- Shape validity: each entry has valid `sourceCoverage` and `ownerVisibleCitationCoverage` enums

### 3. Module -> Source-Gap-Plan alignment

Every registered module must have a source-gap-plan entry. The test verifies:

- Count equality: `gapEntries.length === registeredModules.length`
- ID presence: every `mod.id` exists in `gapEntries`
- Shape validity: each entry has valid `coverageStatus` and `priority` enums

### 4. Three-way registry consistency

The guard verifies that all three metadata registries are in sync:

- `coverage.sourceCoverage === gap.coverageStatus` for every module
- `coverage.ownerVisibleCitationCoverage === gap.ownerVisibleCitationNeed` for every module
- All three registries have the same entry count

### 5. Red flag string and forbidden-language validation

Every red flag in the source map must be a non-empty string that contains no forbidden treatment/dosage language. The forbidden patterns include:

- `diagnos`, `treat`, `prescri`, `surg`, `prognosis`, `disease`, `cure`, `heal`
- `antibiotic`, `steroid`, `vaccine`, `medicat`
- Dosage patterns: `give pet/dog/cat ... mg/ml/tablet/pill/dose`, `administer ... mg/ml`, `dosage is/of/:`
- Home-care patterns: `home-care instructions/steps/tips`

This check applies to: red flags, rationale notes, coverage-gap safety notes, source-gap-plan safety notes, and missing source topics.

### 6. Source ID validation

Any source ID pattern found in rationale notes must correspond to an actual source in the source registry. The test extracts source-ID-like patterns and verifies they exist via `getSourceById()`.

### 7. Owner-visible citation validation

For every module with `citationIntent === "owner_visible_citation"`, the guard verifies:

- `buildCitations()` returns citations that reference only eligible sources
- Every citation's source exists in the source registry
- Every citation's source has `allowedUse` that passes `isEligibleForOwnerCitation()`

### 8. Missing coverage representation

The guard verifies that no registered module is silently omitted from coverage tracking:

- Every module has an explicit coverage level (`strong`, `partial`, or `missing`)
- Modules with `missing` coverage are flagged as `critical` priority in the gap plan
- `urinary_obstruction` is explicitly tested as the canonical missing-coverage module

### 9. No long copied source passages

No text field (rationale notes, safety notes, missing source topics) may exceed 500 characters. This prevents accidental copy-paste of source content into metadata.

### 10. Forbidden language sweep

A comprehensive sweep of all text fields across all registries checks for forbidden keywords:

- `diagnos`, `treat`, `prescri`, `surg`, `prognosis`, `cure`, `heal`
- `antibiotic`, `steroid`, `vaccine`, `medicat`, `dosage`
- `home-care`, `home care`
- Dosage instruction regex patterns
- Home-care instruction regex patterns

## Future-proofing

The guard is designed to catch future module additions automatically. When a new complaint module is added to `complaint-modules/index.ts`:

1. The count-equality checks will fail (source-map, coverage-gap, and gap-plan will have fewer entries than registered modules)
2. The ID-presence checks will fail (the new module ID won't be found in any metadata registry)
3. CI will block the PR until all three registries are updated

## Tests

Run alignment guard:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-registry-alignment.test.ts
```

Run regression tests:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-complaint-source-map.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-coverage-gap-registry.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-gap-plan.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-registry.test.ts
```

Full build:

```bash
npm run build
```

## Test coverage

- Every registered module has source-map entry
- Every registered module has coverage-gap entry
- Every registered module has source-gap-plan entry
- Three-way registry consistency (counts, coverageStatus, citationNeed)
- Red flags are strings without forbidden language
- Rationale notes free of forbidden language
- Coverage-gap safety notes free of forbidden language
- Source-gap-plan safety notes free of forbidden language
- Missing source topics free of forbidden language
- Source IDs in rationale notes exist in registry
- Owner-visible citations reference eligible sources only
- Missing coverage is explicitly represented (not silently omitted)
- No text field exceeds 500 characters
- Comprehensive forbidden-language sweep across all text fields
- Future-proofing: count equality catches new modules

## Integration Notes

This guard is intentionally isolated. It is a test-only artifact that runs in CI. It does not modify any runtime behavior. Its sole purpose is to prevent the PR #425 failure pattern (missing metadata entries for a new complaint module) from recurring.
