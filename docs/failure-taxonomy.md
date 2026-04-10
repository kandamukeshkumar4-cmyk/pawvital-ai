# Failure Taxonomy & Review Loop — PawVital AI

> **Version:** 1.0.0
> **Date:** 2026-04-10
> **Purpose:** Structured failure labels for categorizing every failed benchmark or reviewed live case, routing each to the appropriate fix type.

---

## Design Principles

1. **Every failure has a category.** No "misc" or "other."
2. **Categories map to fix types.** Each failure type has a clear remediation path.
3. **Failures are tracked over time.** We measure improvement, not just detection.
4. **Deterministic failures are fixed deterministically.** Training is the last resort.

---

## Failure Taxonomy

### Category 1: MISSED EMERGENCY (`missed_emergency`)

**Definition:** The system failed to escalate to emergency when it should have.

| Subcategory | Description | Example | Fix Type |
|---|---|---|---|
| `missed_emergency.red_flag` | Known red flag not detected | Blue gums not flagged as emergency | Add/update red flag rule |
| `missed_emergency.composite` | Composite emergency rule not triggered | GDV: bloated + retching not combined | Add composite rule |
| `missed_emergency.prior` | Breed/age prior should have elevated urgency | Dachshund with IVDD signs not escalated | Adjust breed/age modifier |
| `missed_emergency.puppy` | Puppy-specific risk not considered | 8-week-old puppy with diarrhea not escalated | Add puppy escalation rule |
| `missed_emergency.urgency_override` | Emergency overridden by low-probability disease | GDV missed because gastroenteritis scored higher | Fix urgency floor logic |

**Severity:** CRITICAL — patient safety risk

---

### Category 2: UNSAFE DOWNGRADE (`unsafe_downgrade`)

**Definition:** The system recommended monitoring when veterinary evaluation was needed.

| Subcategory | Description | Example | Fix Type |
|---|---|---|---|
| `unsafe_downgrade.disposition` | Wrong disposition tier | Pyometra signs → "monitor" instead of "same day vet" | Fix disposition logic |
| `unsafe_downgrade.missed_must_not_miss` | Dangerous differential not considered | Bleeding disorder not in differentials for bloody stool | Add disease linkage |
| `unsafe_downgrade.insufficient_questioning` | Disposition given before critical questions answered | No toxin exposure question asked before GI disposition | Add must-ask question |

**Severity:** CRITICAL — patient safety risk

---

### Category 3: OVER-ESCALATION (`over_escalation`)

**Definition:** The system escalated to emergency/urgent when monitoring was appropriate.

| Subcategory | Description | Example | Fix Type |
|---|---|---|---|
| `over_escalation.false_red_flag` | Red flag triggered inappropriately | Mild gum redness flagged as "bright red = emergency" | Refine red flag condition |
| `over_escalation.prior_inflation` | Breed/age priors inflated urgency too much | Breed risk made low condition seem urgent | Calibrate modifier range |
| `over_escalation.composite_overreach` | Composite rule too broad | Any vomiting + any lethargy = emergency | Narrow composite criteria |
| `over_escalation.defensive_escalation` | System escalated because it "wasn't sure" | Escalated due to missing info that wasn't critical | Fix missing-info logic |

**Severity:** MODERATE — erodes trust, causes unnecessary vet visits

---

### Category 4: REPEATED QUESTION (`repeated_question`)

**Definition:** The system asked a question that was already answered.

| Subcategory | Description | Example | Fix Type |
|---|---|---|---|
| `repeated_question.state_loss` | Answered question not recorded in state | Owner said "not drinking" but system asks again | Fix state persistence |
| `repeated_question.extraction_failure` | Answer was in text but not extracted | "vomiting for 2 days" not parsed | Improve extraction |
| `repeated_question.duplicate_ask` | Same question asked in different wording | "How long vomiting?" then "Duration of vomiting?" | Deduplicate question IDs |
| `repeated_question.compression_loss` | Answer lost during context compression | MiniMax summary dropped the answer | Fix compression protection |

**Severity:** MODERATE — degrades user experience significantly

---

### Category 5: BAD NORMALIZATION (`bad_normalization`)

**Definition:** Owner's input was mapped to the wrong symptom/complaint family.

| Subcategory | Description | Example | Fix Type |
|---|---|---|---|
| `bad_normalization.wrong_symptom` | Free text mapped to wrong canonical key | "regurgitating" mapped to "vomiting" instead of "regurgitation" | Add normalization entry |
| `bad_normalization.missed_symptom` | Symptom not recognized at all | "knuckling" not recognized as neurologic | Add to SYMPTOM_MAP |
| `bad_normalization.over_broad` | Vague input mapped too specifically | "not right" mapped to "lethargy" | Use unknown_concern pathway |
| `bad_normalization.species_confusion` | Cat/general term matched as dog symptom | (Should be blocked by species check) | Add species guard |

**Severity:** HIGH — cascades into wrong triage pathway

---

### Category 6: WRONG DISPOSITION (`wrong_disposition`)

**Definition:** The disposition doesn't match the clinical picture, but it's not an emergency miss or unsafe downgrade.

| Subcategory | Description | Example | Fix Type |
|---|---|---|---|
| `wrong_disposition.too_conservative` | Disposition more cautious than needed | Minor wound → "vet within 48h" when monitor is fine | Calibrate disposition thresholds |
| `wrong_disposition.too_casual` | Disposition less cautious than needed (but not unsafe) | Chronic itching → "vet within 48h" when monitor + flea prevention is fine | Calibrate disposition thresholds |
| `wrong_disposition.mismatched_rationale` | Disposition is correct but explanation doesn't match | Output mentions heart disease when disposition is for GI | Fix narrative generation |

**Severity:** LOW-MODERATE — affects quality but not safety

---

### Category 7: POOR EXPLANATION (`poor_explanation`)

**Definition:** The clinical reasoning is correct but the owner-facing explanation is confusing, alarming, or inadequate.

| Subcategory | Description | Example | Fix Type |
|---|---|---|---|
| `poor_explanation.too_technical` | Medical jargon without lay explanation | "Your dog may have GDV" without explaining what that means | Improve phrasing layer |
| `poor_explanation.too_alarming` | Non-emergency explained in scary terms | Minor skin issue described with cancer-level urgency language | Calibrate tone |
| `poor_explanation.too_reassuring` | Serious condition explained too casually | "It's probably just allergies" when pyometra is possible | Add appropriate caution language |
| `poor_explanation.missing_action` | No clear next steps given | Disposition says "see vet" but no guidance on what to tell vet | Add action guidance |
| `poor_explanation.missing_escalation_triggers` | Monitor disposition without clear "when to escalate" | "Watch at home" without saying what signs mean go to vet | Add escalation triggers |

**Severity:** LOW — doesn't affect clinical outcome but impacts trust and compliance

---

### Category 8: OUT-OF-SCOPE HANDLING (`oos_failure`)

**Definition:** The system failed to properly decline or redirect an out-of-scope request.

| Subcategory | Description | Example | Fix Type |
|---|---|---|---|
| `oos_failure.gave_advice` | Provided advice outside scope | Gave medication dosing advice | Add OOD guardrail |
| `oos_failure.wrong_species` | Treated non-dog as dog | Gave triage for cat symptoms | Add species check |
| `oos_failure.no_redirect` | Declined but didn't suggest where to go | "I can't help with that" with no alternative | Add redirect language |

**Severity:** HIGH — legal/regulatory risk

---

## Review Loop Process

### Step 1: Failure Detection
- **Benchmark failures:** Automatic detection via evaluation harness
- **Live case review:** Async review of shadow-mode comparisons
- **User feedback:** Thumbs-down reports flagged for review

### Step 2: Failure Labeling
Each failure is labeled with:
- Primary category (from taxonomy above)
- Subcategory
- Severity (CRITICAL / HIGH / MODERATE / LOW)
- Complaint families involved
- Whether it's a new failure type or regression

### Step 3: Fix Routing

| Failure Category | Fix Type | Responsible |
|---|---|---|
| `missed_emergency.*` | Add/update deterministic rule | Clinical team |
| `unsafe_downgrade.*` | Add/update rule or question | Clinical team |
| `over_escalation.*` | Calibrate rule thresholds | Clinical team |
| `repeated_question.*` | Fix state management | Engineering |
| `bad_normalization.*` | Update SYMPTOM_MAP normalization | Clinical + Engineering |
| `wrong_disposition.*` | Calibrate disposition logic | Clinical team |
| `poor_explanation.*` | Update phrasing templates | Clinical team |
| `oos_failure.*` | Add OOD guardrail | Engineering + Clinical |

### Step 4: Fix Implementation
1. Rule/question change implemented
2. Provenance registry updated
3. Benchmark case added to prevent regression
4. Full benchmark re-run
5. Score improvement verified

### Step 5: Regression Check
- Re-run full benchmark suite after every fix
- Ensure no new failures introduced
- Track failure rate over time

---

## Metrics Dashboard

Track these metrics over time:

| Metric | Target | Current | Trend |
|---|---|---|---|
| Emergency recall | > 98% | TBD | — |
| Unsafe downgrade rate | < 1% | TBD | — |
| Over-escalation rate | < 15% | TBD | — |
| Repeat-question rate | < 5% | TBD | — |
| Question efficiency | > 0.7 | TBD | — |
| Abstention correctness | > 90% | TBD | — |
| Disposition agreement | > 85% | TBD | — |
| Bad normalization rate | < 3% | TBD | — |

---

## Failure Case Log Template

```json
{
  "failure_id": "FAIL-0001",
  "date": "2026-04-10",
  "source": "benchmark" | "live_review" | "user_feedback",
  "case_id": "BENCH-0042",
  "category": "missed_emergency",
  "subcategory": "missed_emergency.composite",
  "severity": "CRITICAL",
  "description": "GDV not detected when swollen_abdomen + restlessness present without retching",
  "complaint_families": ["swollen_abdomen"],
  "is_regression": false,
  "fix_type": "Add composite rule for early GDV",
  "fix_status": "pending",
  "fix_date": null,
  "benchmark_after_fix": null
}
```

---

## Next Steps

1. Implement failure tracking in evaluation harness
2. Set up review workflow for live cases
3. Build failure dashboard
4. Establish review cadence (weekly for first month)
