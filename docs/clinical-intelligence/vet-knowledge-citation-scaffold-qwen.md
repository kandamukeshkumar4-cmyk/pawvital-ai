# VET-1413Q: Vet Knowledge Owner Citation Scaffold

## Status

**Scaffold only.** This module does NOT perform live retrieval, RAG calls, or any external network requests. It consumes curated source metadata and retrieval plans to produce safe citation objects for future handoff/rationale modules.

## What this is

A citation scaffold that:

1. Accepts metadata-only requests (complaint family, red flags, max citations)
2. Uses the retrieval planner to select owner-visible sources
3. Produces safe, metadata-only citation objects
4. Enforces policy constraints: only `allowedUse = "owner_visible_citation"` sources appear in output

## What this is NOT

- **Not live RAG.** No vector store calls, no embedding lookups, no LLM retrieval.
- **Not open-web search.** No web scraping, no external URL fetching.
- **Not clinical behavior.** No diagnosis, treatment, medication, dosage, or home-care generation.
- **Not wired into production.** No integration with symptom-chat, planner, triage-engine, clinical-matrix, emergency sentinel, or complaint modules.
- **Not source content scraping.** URLs in sources are never fetched.

## Files

| File | Purpose |
|------|---------|
| `src/lib/clinical-intelligence/vet-knowledge/citation-policy.ts` | Citation policy constants and constraint helpers |
| `src/lib/clinical-intelligence/vet-knowledge/citation-builder.ts` | Metadata-only citation building |
| `tests/clinical-intelligence/vet-knowledge-citation-builder.test.ts` | Tests for citation policy and builder |

## Citation Policy (`citation-policy.ts`)

### Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `DEFAULT_MAX_CITATIONS` | `3` | Safe default limit on returned citations |
| `OWNER_VISIBLE_ALLOWED_USES` | `["owner_visible_citation"]` | Only this allowed use is eligible for owner-visible output |

### Helpers

- `isEligibleForOwnerCitation(allowedUse)` — returns true only for `"owner_visible_citation"`
- `isExcludedFromOwnerCitation(allowedUse)` — returns true for any use that is NOT `"owner_visible_citation"`
- `validateCitationContent(text)` — checks text against forbidden content patterns, returns `{ valid, violations }`
- `getCitationPolicyConstraints()` — returns all citation policy constraints as a record

## Citation Builder (`citation-builder.ts`)

### Request shape

```typescript
interface VetKnowledgeCitationRequest {
  complaintFamily?: string;
  redFlags?: string[];
  maxCitations?: number;
}
```

### Citation shape

```typescript
interface VetKnowledgeCitation {
  sourceId: string;
  title: string;
  publisher: VetKnowledgePublisher;
  url?: string;
  topic: string;
  lastReviewedAt: string;
}
```

### Result shape

```typescript
interface VetKnowledgeCitationResult {
  citations: VetKnowledgeCitation[];
  excludedReasons: string[];
  policyWarnings: string[];
}
```

### Behavior

1. **Source selection**: Uses `planRetrieval()` with `allowedUse: "owner_visible_citation"` to get eligible sources
2. **Filtering**: Only sources with `allowedUse = "owner_visible_citation"` become citations
3. **Exclusion tracking**: Non-owner-visible sources are listed in `excludedReasons`
4. **Content validation**: Each source's title+topic is checked against forbidden content patterns
5. **maxCitations**: Enforces limit with safe default of 3
6. **Metadata-only citations**: Citation objects contain only id, title, publisher, url, topic, lastReviewedAt
7. **No internal fields**: Citations do NOT expose allowedUse, licenseStatus, complaintFamilies, or redFlags
8. **No URL fetching**: Sources are never fetched; only registry metadata is used
9. **No synthesis**: Never generates clinical advice
10. **Failure safety**: Any error returns a safe empty result (no throw)

### Convenience function

- `buildCitationsFromRetrievalPlan(retrievalPlan, maxCitations?)` — builds citations from an existing retrieval plan output, carrying over blocked reasons and policy warnings

## Safety Constraints

1. **Only owner_visible_citation sources** — internal reasoning and retrieval-summary-only sources are excluded
2. **No runtime fetch** — URLs in sources are never fetched
3. **No diagnosis/treatment generation** — forbidden content patterns are validated
4. **Metadata-only output** — citations contain no internal registry fields
5. **Citation failure never blocks emergency guidance** — empty result is safe, no throw
6. **Defensive objects** — citation objects are independent from source registry

## Integration Notes

This scaffold is intentionally isolated. Future work may:

- Wire `buildCitations()` into owner-facing handoff summaries
- Connect citations to rationale explanations
- Add citation formatting for UI display

Until then, this module remains a metadata-only citation layer with no production integration.

## Tests

Run with:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-citation-builder.test.ts
```

### Test coverage

- Owner-visible citations include only `allowedUse = "owner_visible_citation"`
- Internal reasoning sources are excluded
- Retrieval-summary-only sources are excluded
- Complaint family filtering
- Red flag filtering
- Max citation limiting
- Unknown complaint family returns empty safe result
- Unknown red flag returns empty safe result
- Citation objects are metadata-only
- No citation output contains forbidden diagnosis/treatment/dosage/home-care patterns
- Builder does not call fetch
- buildCitationsFromRetrievalPlan integration
- Citation result shape validation
- Policy constant verification
- Defensive behavior
- Failure safety
