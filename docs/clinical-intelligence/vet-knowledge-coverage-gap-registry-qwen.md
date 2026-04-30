# VET-1419Q: Vet-Knowledge Coverage Gap Registry

## Status

**Metadata-only scaffold.** This module does NOT perform live retrieval, RAG calls, URL fetching, or any external network requests. It creates a coverage assessment layer that shows which complaint modules have enough curated source support and which need future source curation.

## What this is

A coverage gap registry that:

1. Assesses source coverage level for each merged complaint module
2. Tracks owner-visible citation coverage availability
3. Identifies missing source needs per module
4. Recommends publisher types for future source curation
5. Maintains safety notes that are free of diagnosis/treatment language
6. Validates duplicate IDs, module existence, and safety note compliance
7. Supports `future_pending` status for modules not yet merged

## What this is NOT

- **Not live RAG.** No vector store calls, no embedding lookups, no LLM retrieval.
- **Not open-web search.** No web scraping, no external URL fetching.
- **Not clinical behavior.** No diagnosis, treatment, medication, dosage, or home-care generation.
- **Not wired into production.** No integration with symptom-chat, planner, triage-engine, clinical-matrix, emergency sentinel, or complaint modules.
- **Not runtime retrieval.** Pure metadata assessment layer.

## Files

| File | Purpose |
|------|---------|
| `src/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry.ts` | Coverage gap registry with validation |
| `tests/clinical-intelligence/vet-knowledge-coverage-gap-registry.test.ts` | Tests for coverage correctness and safety |

## Coverage Assessment

### Active Modules (9)

| Module ID | Source Coverage | Owner-Visible Citation | Key Gaps |
|-----------|----------------|----------------------|----------|
| `skin_itching_allergy` | partial | emergency_only | dermatology source, allergy differentiation |
| `gi_vomiting_diarrhea` | strong | available | — |
| `limping_mobility_pain` | partial | emergency_only | musculoskeletal source, orthopedic triage |
| `respiratory_distress` | strong | available | — |
| `seizure_collapse_neuro` | partial | emergency_only | neurology source, seizure first-aid |
| `urinary_obstruction` | missing | missing | urinary/renal source, blockage guidance |
| `toxin_poisoning_exposure` | partial | emergency_only | toxicology source, ASPCA reference |
| `bloat_gdv` | partial | emergency_only | breed risk stratification, post-op reference |
| `collapse_weakness` | partial | emergency_only | collapse differential, cardiac emergency |

### Future Pending Modules (0)

No modules are currently future_pending. All 9 complaint modules have coverage entries.

## Entry Shape

```typescript
interface CoverageGapEntry {
  complaintModuleId: string;
  status: "active" | "future_pending";
  sourceCoverage: "strong" | "partial" | "missing";
  ownerVisibleCitationCoverage: "available" | "emergency_only" | "missing";
  missingSourceNeeds: string[];
  recommendedPublisherTypes: VetKnowledgePublisher[];
  safetyNotes: string[];
}
```

## Coverage Level Definitions

| Level | Meaning |
|-------|---------|
| `strong` | Dedicated sources exist for this module's complaint families with owner-visible citation support |
| `partial` | Some sources cover this module but gaps remain (usually emergency-only citations or missing domain-specific sources) |
| `missing` | No dedicated source coverage; only generic emergency or internal notes apply |

## Owner-Visible Citation Definitions

| Level | Meaning |
|-------|---------|
| `available` | Owner-facing citations are available from curated sources |
| `emergency_only` | Citations only available when emergency red flags are present |
| `missing` | No owner-visible citation source exists for this module |

## Exports

- `getAllCoverageEntries()` — returns all coverage entries as defensive clones
- `getCoverageByModuleId(moduleId)` — returns a single entry by module ID, or undefined
- `filterBySourceCoverage(level)` — filters entries by source coverage level
- `filterByOwnerVisibleCitationCoverage(level)` — filters entries by owner-visible citation level
- `validateCoverageRegistry()` — validates duplicate IDs, module existence, and safety note compliance

## Safety Constraints

1. **Defensive clones** — all returned entries are cloned to prevent mutation of internal registry
2. **Unknown module returns undefined** — `getCoverageByModuleId` returns undefined for unknown IDs
3. **No throw behavior** — all functions handle unknown inputs gracefully
4. **Validation checks** — `validateCoverageRegistry()` verifies:
   - No duplicate complaint module IDs
   - Every active module ID exists in the complaint module registry
   - No safety note contains diagnosis/treatment/dosage language
5. **No clinical advice** — safety notes are metadata-only, never contain diagnosis/treatment/dosage/home-care text
6. **Future pending exemption** — `future_pending` modules are not validated against the complaint module registry

## Validation Behavior

The `validateCoverageRegistry()` function returns:

```typescript
interface CoverageValidationResult {
  valid: boolean;
  duplicateIds: string[];
  missingModuleIds: string[];
  safetyNoteViolations: string[];
}
```

- `duplicateIds` — complaint module IDs that appear more than once
- `missingModuleIds` — active module IDs not found in the complaint module registry
- `safetyNoteViolations` — safety notes containing forbidden diagnosis/treatment language

## Tests

Run with:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-coverage-gap-registry.test.ts
```

### Test coverage

- All 9 complaint modules covered (all active)
- Active modules exist in complaint module registry
- Source coverage level correctness
- Owner-visible citation coverage correctness
- Missing source needs arrays
- Recommended publisher types validity
- Safety notes contain no diagnosis/treatment language
- Defensive clone behavior for all exports
- Filter by source coverage
- Filter by owner-visible citation coverage
- Unknown module returns undefined safely
- validateCoverageRegistry passes with no errors
- Entry shape validation

## Integration Notes

This scaffold is intentionally isolated. Future work may:

- Use coverage gaps to prioritize source curation efforts
- Wire coverage assessments into the retrieval planner for source-aware routing
- Surface owner-visible citation gaps in admin dashboards
- Track coverage improvement over time as new sources are added

Until then, this module remains a metadata-only coverage assessment layer with no production integration.
