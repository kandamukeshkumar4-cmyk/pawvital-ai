# VET-1416Q: Vet-Knowledge Complaint Source Map

## Status

**Scaffold only.** This module does NOT perform live retrieval, RAG calls, or any external network requests. It creates a metadata-only mapping layer between merged complaint modules and the vet-knowledge source registry/retrieval/citation scaffolds.

## What this is

A mapping layer that:

1. Associates each complaint module ID with vet-knowledge complaint families
2. Maps complaint module red flags to vet-knowledge source red flags
3. Defines retrieval and citation intent for each complaint module
4. Provides rationale notes for future integration planning
5. Validates that all mapped module IDs exist in the complaint module registry
6. Validates that mapped families/red flags return safe metadata from vet-knowledge scaffolds

## What this is NOT

- **Not live RAG.** No vector store calls, no embedding lookups, no LLM retrieval.
- **Not open-web search.** No web scraping, no external URL fetching.
- **Not clinical behavior.** No diagnosis, treatment, medication, dosage, or home-care generation.
- **Not wired into production.** No integration with symptom-chat, planner, triage-engine, clinical-matrix, emergency sentinel, or complaint modules.
- **Not runtime retrieval.** Uses retrieval planner and citation builder only for validation, not production behavior.

## Files

| File | Purpose |
|------|---------|
| `src/lib/clinical-intelligence/vet-knowledge/complaint-source-map.ts` | Complaint module to vet-knowledge source mapping |
| `tests/clinical-intelligence/vet-knowledge-complaint-source-map.test.ts` | Tests for mapping correctness and safety |

## Complaint Module Coverage

### Pack 1 (MVP)

| Module ID | Display Name | Vet-Knowledge Families | Retrieval Intent | Citation Intent |
|-----------|-------------|----------------------|-----------------|----------------|
| `skin_itching_allergy` | Skin Itching / Allergy | dermatological, emergency | internal_reasoning | owner_visible_citation |
| `gi_vomiting_diarrhea` | GI Vomiting / Diarrhea | gastrointestinal, emergency | internal_reasoning | owner_visible_citation |
| `limping_mobility_pain` | Limping / Mobility Pain | musculoskeletal, trauma, emergency | internal_reasoning | owner_visible_citation |

### Pack 2

| Module ID | Display Name | Vet-Knowledge Families | Retrieval Intent | Citation Intent |
|-----------|-------------|----------------------|-----------------|----------------|
| `respiratory_distress` | Respiratory Distress / Coughing | respiratory, emergency | internal_reasoning | owner_visible_citation |
| `seizure_collapse_neuro` | Seizure / Collapse / Neuro | neurological, emergency | internal_reasoning | owner_visible_citation |
| `urinary_obstruction` | Urinary Obstruction | emergency | internal_reasoning | none |

### Pack 3

| Module ID | Display Name | Vet-Knowledge Families | Retrieval Intent | Citation Intent |
|-----------|-------------|----------------------|-----------------|----------------|
| `toxin_poisoning_exposure` | Toxin / Poisoning / Exposure | gastrointestinal, emergency | internal_reasoning | owner_visible_citation |

## Mapping Entry Shape

```typescript
interface ComplaintSourceMapEntry {
  complaintModuleId: string;
  displayName: string;
  vetKnowledgeFamilies: string[];
  relevantRedFlags: string[];
  retrievalIntent: VetKnowledgeAllowedUse | "none";
  citationIntent: VetKnowledgeAllowedUse | "none";
  rationaleNotes: string[];
}
```

## Result Shape

```typescript
interface ComplaintSourceMapResult {
  entry: ComplaintSourceMapEntry | null;
  retrievalSourceCount: number;
  citationCount: number;
}
```

## Exports

- `getAllComplaintSourceMapEntries()` — returns all 7 mapping entries as defensive clones
- `getComplaintSourceMapEntry(moduleId)` — returns a single entry by module ID, or undefined
- `getComplaintSourceMapForModule(moduleId)` — returns entry with retrieval source count and citation count
- `validateComplaintSourceMap()` — validates all mappings against complaint module registry and vet-knowledge scaffolds

## Safety Constraints

1. **Defensive clones** — all returned entries are cloned to prevent mutation of the internal map
2. **Unknown module returns empty safe result** — `getComplaintSourceMapEntry` returns undefined, `getComplaintSourceMapForModule` returns `{ entry: null, retrievalSourceCount: 0, citationCount: 0 }`
3. **No throw behavior** — all functions handle unknown inputs gracefully
4. **Validation checks** — `validateComplaintSourceMap()` verifies all mapped module IDs exist in registry, all families return safe metadata, and all owner-visible citation intents have eligible sources
5. **No clinical advice** — rationale notes are metadata-only, never contain diagnosis/treatment/dosage/home-care text

## Integration Notes

This scaffold is intentionally isolated. Future work may:

- Wire `getComplaintSourceMapForModule()` into the next-question planner for source-aware questioning
- Use mapping entries to pre-select relevant vet-knowledge sources during complaint assessment
- Connect citation results to owner-facing handoff summaries

Until then, this module remains a metadata-only mapping layer with no production integration.

## Tests

Run with:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-complaint-source-map.test.ts
```

### Test coverage

- All 7 complaint modules are mapped
- Mapped module IDs exist in complaint module registry
- Complaint families cover vet-knowledge sources
- Red flags are relevant to each module
- Citation/retrieval intent behavior is valid
- Owner-visible citation intent only uses eligible sources
- Rationale notes contain no forbidden clinical advice
- Defensive clone behavior
- Unknown module returns empty safe result
- getComplaintSourceMapForModule returns valid results
- validateComplaintSourceMap passes with no errors
- Entry shape validation
- Pack 1/2/3 coverage
- Vet-knowledge scaffold integration (retrieval planner, citation builder)
