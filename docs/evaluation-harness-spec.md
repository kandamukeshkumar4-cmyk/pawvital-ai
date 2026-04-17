# Evaluation Harness Specification — PawVital AI

> **Version:** 1.0.0
> **Date:** 2026-04-10
> **Purpose:** Automated scoring of the PawVital symptom checker against vet-adjudicated benchmark cases.

---

## Metrics

### Primary Metrics (Safety-Critical)

| Metric | Formula | Target | Weight |
|---|---|---|---|
| **Emergency Recall** | TP_emergency / (TP_emergency + FN_emergency) | > 98% | Highest |
| **Unsafe Downgrade Rate** | Unsafe_downgrades / Total_cases | < 1% | Highest |
| **Abstention Correctness** | Correct_abstentions / Total_abstentions | > 90% | High |

### Secondary Metrics (Quality)

| Metric | Formula | Target | Weight |
|---|---|---|---|
| **Question Efficiency** | Must_ask_answered / Total_questions_asked | > 0.7 | Medium |
| **Repeat-Question Rate** | Repeated_questions / Total_questions | < 5% | Medium |
| **Disposition Agreement** | Matching_dispositions / Total_cases | > 85% | Medium |
| **Over-Escalation Rate** | Over_escalations / Total_cases | < 15% | Low |

### Tertiary Metrics (Experience)

| Metric | Formula | Target |
|---|---|---|
| **Red Flag Detection Rate** | Detected_red_flags / Expected_red_flags | > 95% |
| **Must-Ask Coverage** | Must_ask_questions_covered / Total_must_ask | > 80% |
| **OOD Detection Rate** | Correctly_flagged_OOD / Total_OOD_cases | > 95% |

---

## Scoring Harness Architecture

```
benchmark_cases.jsonl (500-1000 cases)
         │
         ▼
┌─────────────────────────┐
│   Case Runner           │
│   - Inject pet profile  │
│   - Feed owner_input    │
│   - Simulate Q&A turns  │
│   - Capture output      │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   Scorer                │
│   - Compare disposition │
│   - Check red flags     │
│   - Count questions     │
│   - Detect repeats      │
│   - Check abstentions   │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   Scorecard             │
│   - Per-metric scores   │
│   - Per-category scores │
│   - Failure breakdown   │
│   - Version comparison  │
└─────────────────────────┘
```

---

## Test Case Simulation Protocol

Each benchmark case is simulated as follows:

1. **Initialize:** Create triage session with pet profile
2. **Input:** Feed owner_input to symptom extraction
3. **Question Loop:**
   a. Get next question from triage engine
   b. If question is in `must_ask_questions` or `nice_to_ask_questions`, provide the pre-written answer from the benchmark case
   c. If question is NOT in the case's expected questions, mark as "unexpected question"
   d. Continue until triage engine gives disposition OR max questions reached
4. **Capture:** Record final disposition, red flags detected, questions asked
5. **Score:** Compare against adjudicated labels

---

## Scorecard Output Format

```json
{
  "run_id": "EVAL-2026-04-10-001",
  "timestamp": "2026-04-10T12:00:00Z",
  "version": "commit-hash",
  "benchmark_version": "v1.0",
  "total_cases": 500,

  "primary_metrics": {
    "emergency_recall": 0.97,
    "emergency_recall_pass": false,
    "unsafe_downgrade_rate": 0.008,
    "unsafe_downgrade_pass": true,
    "abstention_correctness": 0.92,
    "abstention_correctness_pass": true
  },

  "secondary_metrics": {
    "question_efficiency": 0.74,
    "question_efficiency_pass": true,
    "repeat_question_rate": 0.03,
    "repeat_question_pass": true,
    "disposition_agreement": 0.82,
    "disposition_agreement_pass": false,
    "over_escalation_rate": 0.12,
    "over_escalation_pass": true
  },

  "by_category": {
    "common": { "cases": 175, "disposition_agreement": 0.91, "emergency_recall": 1.0 },
    "dangerous": { "cases": 100, "disposition_agreement": 0.85, "emergency_recall": 0.96 },
    "ambiguous": { "cases": 75, "disposition_agreement": 0.72, "abstention_rate": 0.4 },
    "contradictory": { "cases": 50, "contradiction_detected": 0.8, "resolution_correct": 0.7 },
    "low_information": { "cases": 50, "abstention_rate": 0.6, "escalation_rate": 0.3 },
    "rare_but_critical": { "cases": 50, "emergency_recall": 0.94, "over_escalation": 0.15 }
  },

  "failures": [
    {
      "case_id": "BENCH-0042",
      "category": "missed_emergency",
      "subcategory": "missed_emergency.composite",
      "severity": "CRITICAL",
      "expected": "emergency_vet_now",
      "actual": "vet_within_48h",
      "description": "GDV composite rule not triggered"
    }
  ],

  "pass_fail": "FAIL",
  "blocking_failures": 3
}
```

---

## Canonical Wave 3 Suite Contract

The canonical dog-only Wave 3 suite contract lives at:

- `data/benchmarks/dog-triage/wave3-freeze-manifest.json`

This ticket standardizes the existing `wave3-freeze-manifest.json` instead of introducing a second manifest path because the required validation and coverage commands already consume that file directly. The manifest is now the single source of truth for:

- `suiteId`
- `suiteVersion`
- `generatedAt`
- `manifestHash`
- `caseIds`
- `shardPaths`
- `totalCases`
- `complaintFamilyCounts`
- `riskTierCounts`
- `modalityCounts`

Contract invariants:

- `caseIds` must be unique and lexicographically sorted after de-duplicating cases that appear in multiple Wave 3 strata.
- `shardPaths` must be valid repo-relative paths into `data/benchmarks/dog-triage/wave3-freeze/` and remain in the same order as the manifest `strata` array so existing loaders preserve slice precedence.
- `totalCases` must match the unique canonical case count derived from the shards and stay aligned with the legacy `uniqueCaseCount` compatibility field.
- Every shard and every benchmark case in the canonical suite must remain dog-only.
- `modalityCounts` must match the referenced multimodal slice files.
- `manifestHash` is a SHA-256 hash over the canonical contract fields above, excluding `manifestHash` itself.

The required verification commands continue to be:

```bash
npm run eval:benchmark:validate
npm run eval:benchmark:coverage
```

---

## Run Conditions

### When to Run
- Before every production deployment
- After any change to clinical-matrix.ts, triage-engine.ts, or symptom normalization
- Weekly automated run on main branch
- After any new complaint family or disease addition

### Pass Criteria
ALL of the following must be true:
- Emergency recall > 98%
- Unsafe downgrade rate < 1%
- No CRITICAL-severity failures in dangerous or rare_but_critical categories

### Fail Criteria
ANY of the following:
- Emergency recall < 98%
- Unsafe downgrade rate > 1%
- Any missed emergency in dangerous category cases
- Any unsafe downgrade in rare_but_critical category cases

---

## Implementation

The harness should be implemented as:

```bash
# Run full benchmark
npm run eval:benchmark

# Run specific category
npm run eval:benchmark -- --category=dangerous

# Run single case (for debugging)
npm run eval:benchmark -- --case=BENCH-0042

# Compare two versions
npm run eval:compare -- --before=v1.2.0 --before=v1.3.0

# Generate scorecard
npm run eval:report -- --format=markdown
```

---

## Continuous Monitoring

For live cases (post-launch):
1. Shadow mode: Run every Nth real conversation through the benchmark scorer
2. Async review: Flag cases where model output differs from deterministic triage
3. Failure aggregation: Group failures by category weekly
4. Trend tracking: Plot metrics over time
