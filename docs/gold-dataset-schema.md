# Gold Dataset Schema & Vet Adjudication Rubric — PawVital AI

> **Version:** 1.1.0
> **Date:** 2026-04-17
> **Purpose:** Define the schema for vet-adjudicated benchmark cases, the Wave 3 engineering freeze artifacts, and the rubric for consistent labeling.

---

## JSON Schema for Benchmark Cases

```typescript
interface BenchmarkCase {
  // === METADATA ===
  case_id: string;              // Unique identifier: "BENCH-0001"
  version: string;              // Schema version
  created_at: string;           // ISO date
  source: "synthetic" | "clinical" | "literature" | "owner_report";

  // === PRESENTATION ===
  owner_input: string;          // Raw owner language (the "chief complaint")
  normalized_complaints: string[]; // Mapped to ontology keys (e.g., "vomiting", "lethargy")
  pet_profile: PetProfileInput;

  // === VET-ADJUDICATED LABELS ===
  adjudication: {
    // Urgency
    urgency_tier: 1 | 2 | 3 | 4;  // 1=emergency, 2=urgent, 3=prompt, 4=monitor
    urgency_rationale: string;     // Why this tier was chosen

    // Must-ask questions
    must_ask_questions: string[];  // Question IDs that MUST be asked before disposition
    nice_to_ask_questions: string[]; // Question IDs that improve accuracy but aren't safety-critical
    acceptable_unknowns: string[];  // Questions that are acceptable to leave unanswered

    // Red flags
    red_flags_present: string[];   // Which red flags are triggered by this case
    red_flags_absent: string[];    // Which red flags are explicitly NOT present

    // Differentials
    likely_differentials: DifferentialLabel[];  // Acceptable diagnoses ranked
    must_not_miss: string[];       // Dangerous conditions that must be ruled out

    // Disposition
    disposition: Disposition;      // The correct safe disposition
    disposition_rationale: string;

    // Abstention rules
    should_abstain: boolean;       // Should the system say "I can't safely continue"?
    abstention_reason: string | null;

    // OOD flags
    is_out_of_distribution: boolean;
    ood_reason: string | null;     // Why this case is OOD

    // Contradiction handling
    has_contradictions: boolean;
    contradiction_details: string | null;
  };

  // === CLASSIFICATION ===
  category: {
    complaint_families: string[];  // Which ontology families this tests
    urgency_tier: 1 | 2 | 3 | 4;
    difficulty: "easy" | "moderate" | "hard" | "expert";
    case_type: "common" | "dangerous" | "ambiguous" | "contradictory" | "low_information" | "rare_but_critical";
  };

  // === EXPECTED BEHAVIOR ===
  expected_behavior: {
    min_questions_before_disposition: number;
    max_questions_before_disposition: number;
    must_detect_red_flags: string[];
    must_not_output_disposition_before_questions: string[];
    emergency_recall_required: boolean;
    unsafe_downgrade_is_failure: boolean;
  };

  // === REVIEWER INFO ===
  reviewers: Array<{
    reviewer_id: string;
    review_date: string;
    agreement: "agree" | "disagree" | "uncertain";
    notes: string;
  }>;
  adjudication_status: "single_reviewed" | "dual_reviewed" | "adjudicated";
}

interface PetProfileInput {
  species: "dog";
  breed: string;
  age_years: number;
  sex: "male" | "female";
  neutered: boolean;
  weight_kg: number | null;
}

interface DifferentialLabel {
  disease_key: string;
  confidence: "definite" | "probable" | "possible" | "rule_out";
  rationale: string;
}

type Disposition =
  | "emergency_vet_now"     // Call/go to ER immediately
  | "same_day_vet"          // See vet within 24 hours
  | "vet_within_48h"        // Schedule vet visit within 48 hours
  | "monitor_and_reassess"  // Home observation with clear escalation triggers
  | "cannot_safely_assess"; // System should abstain
```

## Wave 3 Freeze Runtime Artifacts

The canonical engineering freeze for Wave 3 lives under:

- `data/benchmarks/dog-triage/wave3-freeze/*.json`
- `data/benchmarks/dog-triage/wave3-freeze-manifest.json`
- `data/benchmarks/dog-triage/wave3-freeze-report.md`
- `data/benchmarks/dog-triage/adjudication-worklist.json`
- `data/benchmarks/dog-triage/adjudication-worklist.csv`
- `data/benchmarks/dog-triage/vet-a-packet.json`
- `data/benchmarks/dog-triage/vet-b-packet.json`

Each freeze case preserves the original runtime request/expectation contract and adds optional Wave 3 metadata:

```typescript
interface Wave3FreezeCase extends BenchmarkCaseRuntimeCase {
  complaint_family_tags?: string[];
  risk_tier?: "tier_1_emergency" | "tier_2_same_day" | "tier_3_48h_monitor" | "tier_4_monitor";
  uncertainty_pattern?: string;
  must_not_miss_marker?: boolean;
  provenance?: {
    source_shard: string;
    source_suite_id: string;
    freeze_date: string;
    version: string;
  };
  wave3_strata?: Array<
    | "emergency"
    | "urgent"
    | "common"
    | "ambiguous"
    | "contradictory"
    | "low-information"
    | "rare-but-critical"
  >;
  wave3_adjudication?: {
    high_risk: boolean;
    review_tier: "dual_review_required" | "single_review_allowed";
    reviewer_slots: Array<{
      role: string;
      reviewer_id: string;
      status: "pending" | "completed";
    }>;
    disagreement_status:
      | "pending_dual_review"
      | "not_required"
      | "agreement"
      | "needs_panel";
    must_ask_expectations: {
      question_ids: string[];
      status: "seeded_from_case_expectations" | "pending_clinical_definition" | string;
      notes: string;
    };
  };
}
```

The Wave 3 worklist rows are derived from the same source pack and add reviewer-facing fields such as complaint family coverage, strata, high-risk flags, disagreement status, and must-ask expectation scaffolding. They are still pre-adjudication until independent clinical review is complete.

---

## Vet Adjudication Rubric

### Urgency Tier Assignment

| Tier | Label | Criteria | Examples |
|------|-------|----------|----------|
| 1 | Emergency | Imminent life threat, minutes matter | GDV, respiratory failure, toxin ingestion with symptoms, seizure > 5 min |
| 2 | Urgent | Same-day vet evaluation needed | Urinary blockage, pyometra signs, severe bleeding, puppy vomiting/diarrhea |
| 3 | Prompt | Vet within 48 hours | Limping with weight-bearing, vomiting without red flags, new lump |
| 4 | Monitor | Home observation OK | Mild itching, minor superficial wound, seasonal allergies |

### Must-Ask Question Selection Rules

1. **Safety questions first.** Any question that detects or rules out a red flag is must-ask.
2. **Discriminating questions second.** Questions that differentiate between top differentials.
3. **Context questions third.** Questions about age, breed, neuter status that affect priors.
4. **Never ask more than 8 questions** before giving a disposition in benchmark cases.

### Acceptable Unknowns

A question is "acceptable unknown" if:
- The answer would change ranking but NOT disposition safety
- The information is genuinely unavailable to the owner
- The system can still give a safe disposition without it

### Disposition Agreement

Two reviewers independently label a case. Agreement is defined as:
- **Exact match:** Same disposition
- **Safe proximity:** Emergency ↔ Urgent (both require vet today), Prompt ↔ Monitor (both can wait)
- **Unsafe disagreement:** Emergency ↔ Monitor (one says ER now, other says wait at home) = FAILURE

### Abstention Rules

The system SHOULD abstain when:
- Owner cannot assess a critical sign (gum color, breathing rate, abdomen distension)
- Symptoms conflict with each other and no safe path exists
- The complaint falls outside the ontology entirely
- The pet is outside dog scope (cat, exotic, human)
- The case involves a medication change or dosage recommendation

### OOD Classification

A case is out-of-distribution when:
- The complaint doesn't map to any of the 50 complaint families
- The species is not dog
- The presentation involves a procedure or intervention (surgery recovery, medication dosing)
- The owner is asking for a diagnosis without any symptoms described
- The scenario is hypothetical or educational

---

## Case Distribution Targets

For the 500-1000 case benchmark set (VET-909):

| Category | Target % | Count (500) | Count (1000) |
|----------|----------|-------------|--------------|
| Common presentations | 35% | 175 | 350 |
| Dangerous but common | 20% | 100 | 200 |
| Ambiguous / unclear | 15% | 75 | 150 |
| Contradictory answers | 10% | 50 | 100 |
| Low information | 10% | 50 | 100 |
| Rare but critical | 10% | 50 | 100 |

### Complaint Family Coverage

Each of the 50 complaint families should have at minimum:
- **2 easy cases** (clear presentation, obvious disposition)
- **2 moderate cases** (some ambiguity, needs good questioning)
- **1 hard case** (conflicting info, rare presentation)
- **1 emergency case** (red flags present, immediate escalation needed)

Minimum: **6 cases × 50 families = 300 cases**
Additional cross-family and edge cases: **200-700 cases**

---

## Next Steps

1. Create benchmark case templates for each complaint family
2. Recruit veterinary reviewers for adjudication
3. Build scoring harness (VET-910)
4. Run silent trial (VET-911)
