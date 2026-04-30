# VET-1411Q: Veterinary Knowledge Retrieval Integration Scaffold

## Status

**Scaffold only.** This module does NOT perform live retrieval, RAG calls, or any external network requests. It is a metadata-only selection layer built on top of the curated vet-knowledge source registry (VET-1410Q).

## What this is

A retrieval-planning scaffold that allows future clinical-intelligence modules to:

1. Select eligible curated sources by metadata (complaint family, red flags, allowed use)
2. Enforce policy constraints at plan time
3. Return safe, defensive-clone results without any fetched content

## What this is NOT

- **Not live RAG.** No vector store calls, no embedding lookups, no LLM retrieval.
- **Not open-web search.** No web scraping, no external URL fetching.
- **Not clinical behavior.** No diagnosis, treatment, medication, dosage, or home-care generation.
- **Not wired into production.** No integration with symptom-chat, planner, triage-engine, clinical-matrix, emergency sentinel, or complaint modules.

## Files

| File | Purpose |
|------|---------|
| `src/lib/clinical-intelligence/vet-knowledge/retrieval-policy.ts` | Policy constants and constraint helpers |
| `src/lib/clinical-intelligence/vet-knowledge/retrieval-planner.ts` | Metadata-only retrieval planning |
| `tests/clinical-intelligence/vet-knowledge-retrieval-planner.test.ts` | Tests for policy and planner |

## Retrieval Policy (`retrieval-policy.ts`)

### Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `CURATED_ONLY` | `true` | Only curated registry sources are eligible |
| `OPEN_WEB_SEARCH_ALLOWED` | `false` | Open-web search is disabled |
| `RUNTIME_SOURCE_FETCH_ALLOWED` | `false` | Runtime URL fetching is disabled |
| `DIAGNOSIS_GENERATION_ALLOWED` | `false` | Diagnosis text generation is disabled |
| `TREATMENT_GENERATION_ALLOWED` | `false` | Treatment text generation is disabled |
| `MEDICATION_GENERATION_ALLOWED` | `false` | Medication text generation is disabled |
| `DOSAGE_GENERATION_ALLOWED` | `false` | Dosage text generation is disabled |
| `HOME_CARE_GENERATION_ALLOWED` | `false` | Home-care text generation is disabled |
| `DEFAULT_MAX_SOURCES` | `5` | Safe default limit on returned sources |
| `OWNER_VISIBLE_ALLOWED_USE` | `"owner_visible_citation"` | Allowed use for owner-facing citations |

### Helpers

- `isOwnerVisibleAllowed(allowedUse)` — checks if a source is eligible for owner-visible citation
- `containsForbiddenContent(text)` — checks text against forbidden content patterns (dosage, treatment, diagnosis, home-care)
- `getPolicyConstraints()` — returns all policy constraints as a record

## Retrieval Planner (`retrieval-planner.ts`)

### Request shape

```typescript
interface VetKnowledgeRetrievalRequest {
  complaintFamily?: string;
  redFlags?: string[];
  allowedUse?: VetKnowledgeAllowedUse;
  maxSources?: number;
}
```

### Result shape

```typescript
interface VetKnowledgeRetrievalPlan {
  sources: VetKnowledgeSource[];
  blockedReasons: string[];
  policyWarnings: string[];
}
```

### Behavior

1. **Source selection**: Filters `VET_KNOWLEDGE_SOURCES` by complaint family, red flags, and allowed use
2. **Case-insensitive matching**: Complaint families and red flags are matched case-insensitively
3. **Unknown family**: Returns empty safe result with blocked reason
4. **Unknown red flags**: If ALL red flags are unknown, returns empty safe result with blocked reason
5. **maxSources**: Enforces limit with safe default of 5
6. **Defensive clones**: All returned sources are cloned to prevent mutation of registry
7. **No URL fetching**: Sources contain only registry metadata, never fetched content
8. **No synthesis**: Never generates diagnosis, treatment, medication, dosage, or home-care text
9. **Failure safety**: Any error returns a safe empty plan (no throw)

### Convenience function

- `getOwnerVisibleSources(request)` — shorthand for `planRetrieval({ ...request, allowedUse: "owner_visible_citation" })`

## Safety Constraints

1. **Curated sources only** — no open-web or external sources
2. **No runtime fetch** — URLs in sources are never fetched
3. **No diagnosis/treatment generation** — forbidden content patterns are checked
4. **Owner-visible citations only from allowedUse = "owner_visible_citation"** — enforced by policy
5. **Retrieval failure never blocks emergency guidance** — empty result is safe, no throw
6. **Defensive clones prevent mutation** — registry sources cannot be modified through planner results

## Integration Notes

This scaffold is intentionally isolated. Future work may:

- Wire `planRetrieval()` into a live retrieval pipeline
- Connect to a vector store for semantic search
- Add RAG runtime calls

Until then, this module remains a metadata-only selection layer with no production integration.

## Tests

Run with:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-retrieval-planner.test.ts
```

### Test coverage

- Source selection by complaint family
- Source selection by red flag (single and multiple)
- Source selection by allowed use
- Owner-visible citation filtering
- maxSources limiting
- Unknown complaint family returns empty safe result
- Unknown red flag returns empty safe result
- Defensive clone behavior
- No URL fetching / no external call behavior
- No diagnosis/treatment/dosage/home-care policy text in planner output
- Retrieval failure policy: empty result is safe and does not throw
- Combined filters (complaint family + red flag + allowed use)
- Plan result shape validation
- Policy constant verification
- Forbidden content pattern detection
