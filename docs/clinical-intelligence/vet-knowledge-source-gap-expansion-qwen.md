# VET-1422Q: Vet-Knowledge Source Gap Expansion Plan

## Status

**Metadata-only scaffold.** This module does NOT perform live retrieval, RAG calls, URL fetching, or any external network requests. It creates an expansion plan that identifies which complaint modules lack strong curated-source coverage and defines candidate source slots for future curation.

## What this is

A source gap expansion plan that:

1. Derives gap entries from the coverage-gap-registry for all active complaint modules
2. Identifies missing source topics per module
3. Recommends publisher types for future source curation
4. Tracks owner-visible citation need per module
5. Tracks internal reasoning need per module
6. Assigns priority levels (critical, high, medium, low, not_needed)
7. Maintains safety notes free of diagnosis/treatment/medication/dosage/home-care language
8. Validates duplicate IDs, module existence, and safety note compliance
9. Returns defensive clones on all exports

## What this is NOT

- **Not live RAG.** No vector store calls, no embedding lookups, no LLM retrieval.
- **Not open-web search.** No web scraping, no external URL fetching.
- **Not clinical behavior.** No diagnosis, treatment, medication, dosage, or home-care generation.
- **Not wired into production.** No integration with symptom-chat, planner, triage-engine, clinical-matrix, emergency sentinel, or complaint modules.
- **Not runtime retrieval.** Pure metadata planning layer.
- **Not source addition.** Does not create or add any new sources to the registry.

## Files

| File | Purpose |
|------|---------|
| `src/lib/clinical-intelligence/vet-knowledge/source-gap-plan.ts` | Source gap expansion plan with validation |
| `tests/clinical-intelligence/vet-knowledge-source-gap-plan.test.ts` | Tests for gap plan correctness and safety |

## Gap Plan Entries

### Critical Priority (1)

| Module ID | Coverage | Owner-Visible Citation | Missing Topics |
|-----------|----------|----------------------|----------------|
| `urinary_obstruction` | missing | missing | urinary/renal source, blockage recognition, feline urinary syndrome |

### High Priority (6)

| Module ID | Coverage | Owner-Visible Citation | Missing Topics |
|-----------|----------|----------------------|----------------|
| `skin_itching_allergy` | partial | emergency_only | dermatology source, allergy differentiation |
| `limping_mobility_pain` | partial | emergency_only | musculoskeletal source, orthopedic triage |
| `seizure_collapse_neuro` | partial | emergency_only | neurology source, seizure first-aid |
| `toxin_poisoning_exposure` | partial | emergency_only | toxicology source, ASPCA reference, household toxin list |
| `bloat_gdv` | partial | emergency_only | breed risk stratification, post-operative reference |
| `collapse_weakness` | partial | emergency_only | collapse differential, cardiac emergency, metabolic crisis |

### Not Needed (2)

| Module ID | Coverage | Owner-Visible Citation |
|-----------|----------|----------------------|
| `gi_vomiting_diarrhea` | strong | available |
| `respiratory_distress` | strong | available |

## Entry Shape

```typescript
interface SourceGapPlanEntry {
  moduleId: string;
  coverageStatus: "strong" | "partial" | "missing";
  missingSourceTopics: string[];
  neededPublisherTypes: VetKnowledgePublisher[];
  ownerVisibleCitationNeed: "available" | "emergency_only" | "missing";
  internalReasoningNeed: boolean;
  priority: "critical" | "high" | "medium" | "low" | "not_needed";
  safetyNotes: string[];
}
```

## Priority Assignment

| Priority | Condition |
|----------|-----------|
| `critical` | Source coverage is "missing" |
| `high` | Source coverage is "partial" with emergency_only or missing owner-visible citations |
| `medium` | Source coverage is "partial" with available owner-visible citations |
| `low` | Source coverage is "partial" with available citations but other minor gaps |
| `not_needed` | Source coverage is "strong" |

## Exports

- `getAllGapEntries()` — returns all gap entries as defensive clones
- `getGapByModuleId(moduleId)` — returns a single entry by module ID, or undefined
- `filterByPriority(level)` — filters entries by priority level
- `filterByCoverageStatus(status)` — filters entries by coverage status
- `getCriticalGaps()` — returns only critical priority entries
- `getHighPriorityGaps()` — returns only high priority entries
- `validateGapPlan()` — validates duplicate IDs, module existence, and safety note compliance

## Imports

This module imports only from:
- `source-registry.ts` (VetKnowledgePublisher type)
- `coverage-gap-registry.ts` (coverage data, types, and functions)
- `../complaint-modules` (module existence validation)

## Safety Constraints

1. **Defensive clones** — all returned entries are cloned to prevent mutation of internal plan
2. **Unknown module returns undefined** — `getGapByModuleId` returns undefined for unknown IDs
3. **No throw behavior** — all functions handle unknown inputs gracefully
4. **Validation checks** — `validateGapPlan()` verifies:
   - No duplicate module IDs
   - Every module ID exists in the complaint module registry
   - No safety note contains diagnosis/treatment/medication/dosage/home-care language
5. **No clinical advice** — safety notes and missing source topics are metadata-only
6. **No source ID references** — gap plan entries do not reference specific source IDs from the registry
7. **Derived from coverage registry** — gap entries are derived from coverage-gap-registry data, ensuring consistency

## Validation Behavior

The `validateGapPlan()` function returns:

```typescript
interface GapPlanValidationResult {
  valid: boolean;
  duplicateIds: string[];
  missingModuleIds: string[];
  safetyNoteViolations: string[];
}
```

- `duplicateIds` — module IDs that appear more than once
- `missingModuleIds` — module IDs not found in the complaint module registry
- `safetyNoteViolations` — safety notes containing forbidden clinical instruction language

## Tests

Run with:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-gap-plan.test.ts
```

### Test coverage

- All 9 active complaint modules represented
- Urinary obstruction flagged as missing owner-visible source coverage
- No nonexistent source IDs referenced
- No diagnosis/treatment/medication/dosage/home-care language in safety notes or topics
- Duplicate ID validation
- Defensive clone behavior for all exports
- Filter by priority
- Filter by coverage status
- Critical and high priority gap retrieval
- Unknown module returns undefined safely
- validateGapPlan passes with no errors
- Entry shape validation
- Coverage distribution (critical, high, not_needed, missing, partial, strong)
- Consistency with coverage-gap-registry data

## Integration Notes

This scaffold is intentionally isolated. Future work may:

- Use gap priorities to sequence source curation efforts
- Wire gap plan into admin dashboards for coverage tracking
- Connect missing source topics to source intake workflows
- Track gap closure over time as new sources are curated and added to the registry

Until then, this module remains a metadata-only expansion planning layer with no production integration.
