# Vet Knowledge Source Registry — Qwen Delivery Notes

> **Ticket:** VET-1410Q
> **Date:** 2026-04-29
> **Agent:** Qwen 3.6 Plus

---

## Scope Delivered

### Files Created

1. **`src/lib/clinical-intelligence/vet-knowledge/source-registry.ts`**
   - `VetKnowledgeSource` interface with all required fields.
   - Type exports for `VetKnowledgePublisher`, `VetKnowledgeLicenseStatus`, `VetKnowledgeAllowedUse`.
   - `getAllSources()` — returns defensive clones of all registered sources.
   - `getSourceById(id)` — safe lookup returning `undefined` for unknown IDs, defensive clone.
   - `getSourcesByComplaintFamily(family)` — filter by complaint family.
   - `getSourcesByRedFlag(redFlag)` — filter by red flag identifier.
   - `getSourcesByAllowedUse(use)` — filter by allowed use constraint.
   - `validateRegistry(sources?)` — validates duplicate IDs, required fields, `lastReviewedAt`, and treatment instruction patterns.
   - `setRegistry(sources)` — internal setter for test injection.

2. **`src/lib/clinical-intelligence/vet-knowledge/source-summaries.ts`**
   - `VET_KNOWLEDGE_SOURCES` array with 5 minimum source groups:
     - `merck-emergency-triage-xabcde` — Merck emergency triage / XABCDE
     - `aaha-pet-emergency-signs` — AAHA pet emergency signs
     - `avma-teletriage-vcpr` — AVMA teletriage / VCPR framing
     - `cornell-bloat-gdv-owner` — Cornell bloat / GDV owner resource
     - `internal-vet-reviewed-question-notes` — Internal vet-reviewed question notes
   - Helper functions `getAllVetKnowledgeSummaries()` and `getVetKnowledgeSummaryById()`.

3. **`docs/vet-knowledge-source-policy.md`**
   - Safety policy covering:
     - Curated sources only — no random open-web search.
     - Sources support red-flag awareness, question metadata, short rationale, vet handoff.
     - Sources must NOT generate diagnosis, treatment, medication, dosage, or home-care instructions.
     - Retrieval failure must never block emergency guidance.
     - Long copied source passages must not be exposed.
     - License status and allowed use enforcement.
     - Publisher trust tiers.
     - Change control process.

4. **`tests/clinical-intelligence/vet-knowledge-source-registry.test.ts`**
   - Tests for all registry functions.
   - Tests for minimum source groups (all 5 publishers).
   - Tests for complaint family, red flag, and allowed use filtering.
   - Tests for validation: duplicate IDs, missing fields, missing `lastReviewedAt`, treatment instruction violations.
   - Tests for diagnosis/treatment policy constraints.
   - Tests for license status and allowed use validity.
   - Tests for metadata completeness.
   - Defensive clone mutation tests.

---

## Design Decisions

### Treatment Instruction Detection

The `containsTreatmentInstructions()` function uses regex patterns to detect treatment instruction language in source titles and topics. Patterns cover:
- Dosage expressions (`give X mg`, `administer X ml`)
- Prescription language (`prescribe`, `dosage is/of/:`)
- Treatment plans (`treatment plan/protocol/regimen`)
- Home care instructions (`home-care instructions/steps/tips`)
- Topical application (`apply bandage/ointment/cream/compress`)
- Feeding instructions (`feed your pet/dog/cat`)

This is a conservative detection — it may produce false positives on legitimate emergency guidance that mentions "do NOT give X" patterns, but false positives are safer than false negatives for this safety gate.

### Defensive Clones

All registry getter functions return shallow clones (`{ ...s }`) to prevent callers from mutating the internal registry state. This follows the pattern established in `question-card-registry.ts`.

### No Runtime Integration

Per the hard scope constraints, this registry is not wired into:
- The planner (`next-question-planner.ts`)
- The symptom-chat route
- Emergency sentinels
- RAG runtime
- Any production behavior

The registry is a standalone data layer ready for future clinical-intelligence modules.

---

## Validation Results

To be confirmed by running:
```bash
npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-registry.test.ts
npm run lint
npm run build
```
