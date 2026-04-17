# Evidence Provenance Registry — PawVital AI

> **Version:** 1.0.0
> **Date:** 2026-04-10
> **Purpose:** Track the source, review date, and evidence level for every clinical rule, modifier, and red flag.

---

## Design Principles

1. **Every high-stakes rule has a provenance entry.**
2. **Evidence is tiered** — not all sources are equal.
3. **Review dates expire** — rules need periodic re-validation.
4. **The deterministic engine is the source of truth** — retrieval provides support only.

---

## Evidence Tiers

| Tier | Label | Description | Examples |
|------|-------|-------------|----------|
| A | Board-reviewed | Directly from veterinary board-certified literature or guidelines | Merck Vet Manual, ACVIM consensus |
| B | Peer-reviewed | Published in peer-reviewed veterinary journal | JAVMA, JVIM, BMC Veterinary Research |
| C | Textbook | Standard veterinary textbook reference | Ettinger, Nelson & Couto |
| D | Expert consensus | Veterinary expert opinion, not formally published | Vet advisor review panel |
| E | Epidemiological | Population-level data (prevalence, breed risk) | VetCompass, Banfield State of Pet Health |
| F | Internal | PawVital internal analysis, not yet externally validated | Conversation analytics, failure analysis |

---

## Provenance Schema

```typescript
interface ProvenanceEntry {
  rule_id: string;          // e.g., "red_flag.blue_gums", "disease.gdv", "modifier.breed_gsd_ivdd"
  rule_type: "red_flag" | "disease" | "modifier" | "question" | "disposition" | "guardrail";
  evidence_tier: "A" | "B" | "C" | "D" | "E" | "F";
  source: string;           // Citation or reference
  source_url: string | null; // Link to source if available
  review_date: string;      // ISO date of last review
  next_review: string;      // ISO date when review expires (6 months for A/B, 12 months for C/D)
  reviewer: string | null;  // Who reviewed (vet name or "internal")
  notes: string | null;     // Additional context
}
```

---

## Provenance Registry (Initial Entries)

### Red Flag Provenance

| Rule ID | Evidence Tier | Source | Review Date |
|---|---|---|---|
| `red_flag.blue_gums` | A | Merck Vet Manual — Cyanosis as emergency indicator | 2026-04-10 |
| `red_flag.pale_gums` | A | Merck Vet Manual — Pale mucous membranes = shock | 2026-04-10 |
| `red_flag.unproductive_retching` | A | Merck Vet Manual — GDV pathognomonic sign | 2026-04-10 |
| `red_flag.toxin_confirmed` | A | ASPCA Poison Control — Known toxin list | 2026-04-10 |
| `red_flag.rat_poison_confirmed` | A | ASPCA Poison Control — Anticoagulant rodenticide | 2026-04-10 |
| `red_flag.collapse` | A | Merck Vet Manual — Collapse evaluation | 2026-04-10 |
| `red_flag.seizure_activity` | A | Veterinary Emergency & Critical Care | 2026-04-10 |
| `red_flag.large_blood_volume` | A | Merck Vet Manual — Hemorrhage assessment | 2026-04-10 |
| `red_flag.rapid_onset_distension` | A | Merck Vet Manual — GDV progression | 2026-04-10 |
| `red_flag.face_swelling` | A | Merck Vet Manual — Anaphylaxis signs | 2026-04-10 |
| `red_flag.no_water_24h` | B | Clinical veterinary practice guideline | 2026-04-10 |
| `red_flag.puppy_vomiting_diarrhea` | A | Merck Vet Manual — Parvovirus risk in puppies | 2026-04-10 |
| `red_flag.urinary_blockage` | A | Veterinary Emergency & Critical Care | 2026-04-10 |
| `red_flag.dystocia_active` | A | Veterinary Obstetrics guidelines | 2026-04-10 |
| `red_flag.sudden_blindness` | B | ACVO guidelines — Sudden blindness = emergency | 2026-04-10 |
| `red_flag.inability_to_stand` | B | Veterinary neurology practice | 2026-04-10 |

### Disease Provenance (Selected High-Stakes)

| Rule ID | Evidence Tier | Source | Review Date |
|---|---|---|---|
| `disease.gdv` | A | Merck Vet Manual — Gastric Dilatation-Volvulus | 2026-04-10 |
| `disease.toxin_ingestion` | A | ASPCA Poison Control Database | 2026-04-10 |
| `disease.heart_failure` | A | ACVIM Consensus Guidelines | 2026-04-10 |
| `disease.pyometra` | A | Merck Vet Manual — Pyometra | 2026-04-10 |
| `disease.parvovirus` | A | Merck Vet Manual — Canine Parvovirus | 2026-04-10 |
| `disease.ccl_rupture` | B | VOSS (Veterinary Orthopedic Sports Society) | 2026-04-10 |
| `disease.hip_dysplasia` | A | OFA/PennHIP breed prevalence data | 2026-04-10 |
| `disease.osteoarthritis` | B | AAHA Pain Management Guidelines | 2026-04-10 |
| `disease.diabetes` | B | ACVIM Diabetes consensus | 2026-04-10 |
| `disease.kidney_disease` | A | IRIS Staging Guidelines | 2026-04-10 |

### Breed Modifier Provenance (Selected)

| Rule ID | Evidence Tier | Source | Review Date |
|---|---|---|---|
| `modifier.breed_gsd_ivdd` | E | VetCompass breed prevalence data | 2026-04-10 |
| `modifier.breed_dachshund_ivdd` | A | Multiple peer-reviewed studies | 2026-04-10 |
| `modifier.breed_greatdane_gdv` | A | Glickman et al. — Breed risk factors for GDV | 2026-04-10 |
| `modifier.breed_cavalier_heart` | A | CKCS breed-specific MD studies | 2026-04-10 |
| `modifier.breed_boxer_cancer` | B | Veterinary oncology breed predisposition | 2026-04-10 |
| `modifier.breed_frenchie_breathing` | A | Brachycephalic syndrome literature | 2026-04-10 |

### Disposition Rule Provenance

| Rule ID | Evidence Tier | Source | Review Date |
|---|---|---|---|
| `disposition.any_red_flag_emergency` | A | Emergency veterinary triage standard | 2026-04-10 |
| `disposition.puppy_symptomatic_urgent` | B | Veterinary pediatric practice | 2026-04-10 |
| `disposition.not_drinking_24h_urgent` | B | Clinical dehydration assessment | 2026-04-10 |
| `disposition.min_3_questions` | F | PawVital conversation analysis | 2026-04-10 |

---

## Review Schedule

| Evidence Tier | Review Frequency | Next Review |
|---|---|---|
| A | Every 6 months | 2026-10-10 |
| B | Every 6 months | 2026-10-10 |
| C | Every 12 months | 2027-04-10 |
| D | Every 12 months | 2027-04-10 |
| E | Every 12 months | 2027-04-10 |
| F | Every 3 months | 2026-07-10 |

---

## Implementation

The provenance registry should be maintained as:
1. **JSON file** in `data/provenance-registry.json` for programmatic access
2. **Markdown document** (this file) for human review
3. **Linked to benchmark cases** — each benchmark case references provenance entries
4. **Runtime helper** in `src/lib/provenance-registry.ts` so report generation, breed-risk APIs, and release gates can resolve reviewed claims consistently

### Registry JSON Structure

```json
{
  "version": "1.0.0",
  "last_updated": "2026-04-10",
  "entries": [
    {
      "rule_id": "red_flag.blue_gums",
      "rule_type": "red_flag",
      "evidence_tier": "A",
      "source": "Merck Veterinary Manual — Cyanosis and hypoxemia",
      "source_url": "https://www.merckvetmanual.com/emergency-medicine-and-critical-care",
      "review_date": "2026-04-10",
      "next_review": "2026-10-10",
      "reviewer": "Clinical audit",
      "notes": "Cyanosis indicates severe hypoxemia — always emergency"
    }
  ]
}
```

---

## Next Steps

1. Populate full registry for all 100+ rules
2. Link each benchmark case to its relevant provenance entries
3. Set up review reminders for expiring entries
4. Add provenance to the clinical audit trail
