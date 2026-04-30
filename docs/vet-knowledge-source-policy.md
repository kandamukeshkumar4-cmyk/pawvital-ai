# Veterinary Knowledge Source Policy

> **Document:** vet-knowledge-source-policy.md
> **Version:** 1.0.0
> **Date:** 2026-04-29
> **Scope:** Curated veterinary knowledge source registry for PawVital AI clinical-intelligence modules.
> **Owner:** Clinical Intelligence Team

---

## 1. Purpose

This policy governs the curation, registration, and use of veterinary knowledge sources that may inform future clinical-intelligence modules in PawVital AI. It ensures that any source-based retrieval or citation remains safe, traceable, and strictly bounded to non-diagnostic, non-treatment purposes.

---

## 2. Core Principles

### 2.1 Curated Sources Only

- Only sources explicitly registered in the `VET_KNOWLEDGE_SOURCES` registry may be used by clinical-intelligence modules.
- **No random open-web search is permitted in production triage.** All source material must pass through the registry validation pipeline before use.
- New sources require review, metadata completion, and explicit registration before they become available to any module.

### 2.2 Source Boundaries

Registered sources support the following purposes only:

- **Red-flag awareness:** Helping the system recognize and escalate emergency signs.
- **Question metadata:** Informing the structure and relevance of follow-up questions.
- **Short rationale:** Providing brief, owner-facing clinical context for urgency assessment.
- **Vet handoff support:** Enabling appropriate referral to veterinary professionals.

### 2.3 Prohibited Uses

Sources **must not** be used to generate:

- **Diagnosis** — No source may produce or imply a specific medical diagnosis.
- **Treatment** — No source may produce treatment instructions or protocols.
- **Medication** — No source may recommend specific medications.
- **Dosage** — No source may provide dosage information for any substance.
- **Home-care instructions** — No source may produce step-by-step home-care guidance.

Any source whose summary or metadata contains treatment instructions fails registry validation.

---

## 3. Safety Constraints

### 3.1 Retrieval Failure Must Not Block Emergency Guidance

- If source retrieval fails, times out, or returns no results, **emergency guidance must still be provided**.
- Deterministic emergency signals (red flags, composite rules) remain the source of truth for emergency escalation.
- No model, RAG result, or source lookup may downgrade or suppress deterministic emergency signals.

### 3.2 No Long Copied Source Passages

- Long verbatim passages from registered sources **must not be exposed** to users.
- Only short, paraphrased summaries or citations are permitted in owner-facing output.
- Internal reasoning modules may reference source metadata but must not reproduce source text verbatim.

### 3.3 License and Use Enforcement

- Each source carries a `licenseStatus` (`link_only`, `summarized`, `internal_allowed`) and an `allowedUse` (`retrieval_summary_only`, `owner_visible_citation`, `internal_reasoning`).
- Modules must respect these constraints. A source with `link_only` must not have its content reproduced. A source with `internal_reasoning` must not appear in owner-facing output.

---

## 4. Source Registration Requirements

Every registered source must include:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (no duplicates allowed) |
| `title` | Yes | Human-readable title |
| `publisher` | Yes | One of: Merck, Cornell, AAHA, AVMA, InternalVetReviewed |
| `url` | No | Source URL (recommended for link_only sources) |
| `topic` | Yes | Short description of source scope |
| `complaintFamilies` | Yes | Non-empty array of complaint family identifiers |
| `redFlags` | Yes | Array of emergency red flag identifiers (may be empty) |
| `lastReviewedAt` | Yes | ISO date string of last review |
| `licenseStatus` | Yes | One of: link_only, summarized, internal_allowed |
| `allowedUse` | Yes | One of: retrieval_summary_only, owner_visible_citation, internal_reasoning |

### 4.1 Validation Rules

- Duplicate source IDs cause validation failure.
- Missing required fields cause validation failure.
- Missing `lastReviewedAt` causes validation failure.
- Any source summary containing treatment instruction patterns causes validation failure.

---

## 5. Publisher Trust Tiers

| Publisher | Trust Level | Notes |
|-----------|-------------|-------|
| Merck | High | Peer-reviewed veterinary reference; gold standard for emergency triage frameworks |
| Cornell | High | Academic veterinary medical center; owner-facing educational resources |
| AAHA | High | Accreditation body; practice standards and owner education |
| AVMA | High | Professional association; telehealth, VCPR, and ethics guidance |
| InternalVetReviewed | Medium | Internally reviewed by licensed veterinarians; requires periodic re-review |

---

## 6. Change Control

- Any addition, removal, or modification of a registered source requires:
  1. Metadata review by a veterinarian or clinical lead.
  2. Registry validation pass (no duplicate IDs, all required fields, no treatment instructions).
  3. Test coverage for the new or modified source.
- Changes to this policy require clinical safety review and documentation update.

---

## 7. Relationship to Clinical Intelligence Safety Contract

This policy extends the [Clinical Intelligence Safety Contract](./clinical-intelligence-safety-contract.md) with source-specific constraints. All rules from that contract remain in effect, including:

- PawVital does not diagnose.
- PawVital does not prescribe treatment.
- PawVital does not replace a veterinarian.
- Emergency guidance must not be blocked by any failure mode (auth, payment, RAG, model, or source retrieval).

---

## 8. Non-Goals

This registry and policy do not:

- Implement RAG runtime retrieval.
- Integrate with live web search.
- Modify the planner, symptom-chat route, or emergency sentinel behavior.
- Generate diagnosis, treatment, or medication recommendations.
- Replace veterinary professional judgment.
