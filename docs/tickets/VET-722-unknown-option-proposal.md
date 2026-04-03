# VET-722: Unknown Option Proposal for Safe Choice Families

**Date:** 2026-04-03
**Agent:** clinicallogicreviewer
**Branch:** `copilot/qwenvet-722-unknown-option`
**Depends on:** VET-715 (schema audit findings)
**Source files referenced:**
- `src/lib/clinical-matrix.ts` — FOLLOW_UP_QUESTIONS (lines 1492–2114)
- `docs/vet-715-schema-audit.md` — audit findings (read-only reference)

---

## Purpose

VET-715 established that no `choice`-type question in the current schema carries an explicit `unknown` value.
When an owner replies "I don't know", "not sure", or "can't tell" to a choice question, the coercion layer must
recognize this via heuristic regex rather than a deterministic schema match. That is fragile.

This document decides, **per question family**, which families are safe to widen with an explicit `unknown` option and
which must not be widened. It does not change any schema. That is follow-up implementation work.

---

## Scope

All sixteen `data_type: "choice"` questions in `FOLLOW_UP_QUESTIONS` as of the current source.

Questions are grouped into named families based on the clinical domain and the type of information they collect.

---

## Classification Key

| Label | Meaning |
|---|---|
| **SAFE** | Adding `unknown` makes the schema deterministic for "I don't know" responses without clinical harm. |
| **UNSAFE** | Adding `unknown` would suppress a clinically required answer or obscure a red-flag signal. |
| **NEEDS DECISION** | The correct handling depends on a product or clinical policy choice that is not resolvable from schema alone. |

---

## Family 1: Limping Progression Family

### `limping_progression` — line 1510

```
choices: ["better", "worse", "same"]
critical: true
```

**Observation:** A progression trajectory is directly informative but not immediately red-flag-gating on its own.
An owner may genuinely not know whether the limp is improving. The question is `critical: true`, but "unknown"
does not block triage — it reduces precision without triggering a false emergency path.

**Classification:** **SAFE**

**Reason:** Owner uncertainty on progression is clinically plausible and should not be treated as a recovery
failure. An explicit `unknown` value makes this deterministic without clinical harm. The downstream disease
probability logic does not reduce to a binary on this field alone.

---

### `weight_bearing` — line 1519

```
choices: ["weight_bearing", "partial", "non_weight_bearing"]
critical: true
```

**Observation:** Weight-bearing status is a direct physical observation. A fully non-weight-bearing dog is a
meaningful red-flag signal. The owner can observe this directly; "I don't know" is implausible for most
presentations. If the owner cannot determine this, it more likely indicates a moderate rather than severe case.

**Classification:** **UNSAFE**

**Reason:** This question is observable. An "unknown" path would mask a non-weight-bearing signal that may
indicate fracture, cruciate rupture, or severe soft-tissue injury — all of which require urgent escalation.
If the owner genuinely cannot assess, the clarification path (not a stored `unknown`) is appropriate.
**Unknown must remain a clarification path here, not a stored answer.**

---

## Family 2: Appetite and Intake Family

### `appetite_status` — line 1623

```
choices: ["normal", "decreased", "none"]
critical: false
```

**Observation:** Appetite is observable and directly clinically meaningful. Not eating at all (`none`) is a
strong urgency signal across multiple disease families (hepatic, renal, gastrointestinal). The question is
`critical: false` but contributes to probability weighting.

**Classification:** **NEEDS DECISION**

**Reason:** "I haven't checked" or "I'm not sure" is a plausible owner state. However, "appetite: none" is a
meaningful urgency signal and should not be obscured by a casual `unknown` capture. If product decides to add
`unknown`, the downstream probability logic must not allow `unknown` to reduce urgency for conditions where
absent appetite is a required differentiator (e.g., parvovirus, hepatic encephalopathy).
This is a product/clinical policy decision before implementation.

---

### `water_intake` — line 1638

```
choices: ["normal", "more_than_usual", "less_than_usual", "not_drinking"]
critical: true
```

**Observation:** Polydipsia (`more_than_usual`) is a diagnostic signal for Cushing's, diabetes, and renal disease.
`not_drinking` is an urgency signal. Both require accurate capture. Owner may genuinely be unsure of exact
water consumption relative to baseline.

**Classification:** **SAFE**

**Reason:** An explicit `unknown` here is clinically acceptable because uncertainty about baseline hydration
is common and does not mask a red-flag signal on its own. The owner can report that something looks different
without knowing which direction. Approximate signals ("seems to be drinking more but I'm not sure") are still
clinically useful even if stored as `unknown`. The coercion chain for `unknown` must not resolve to `normal`.

---

### `appetite_change` — line 1889

```
choices: ["increased", "decreased", "normal"]
critical: true
```

**Observation:** This is the weight-loss context variant of appetite. Used when weight loss is already
confirmed. The combination of `weight_loss` + `appetite_change: increased` strongly suggests diabetes or
hyperthyroidism. `weight_loss` + `appetite_change: decreased` suggests malignancy or organ failure.

**Classification:** **UNSAFE**

**Reason:** In the context of confirmed weight loss, appetite direction is a critical differentiator that
materially changes disease probability. An owner who says "I don't know" about appetite in this context is
clinically unusual — confirmed weight loss is a significant event an observant owner would have context for.
**Unknown must remain a clarification path here, not a stored answer.** The system should re-ask or
prompt for clarification before storing a non-deterministic value.

---

## Family 3: Severity and Acuity Family

### `lethargy_severity` — line 1653

```
choices: ["mild", "moderate", "severe"]
critical: true
```

**Observation:** Severity assessment is inherently subjective and owner-defined. A single `severe` answer may
trigger different urgency than `mild`. Owners frequently hedge on severity scales. Owner perception of severity
is still useful even when uncertain.

**Classification:** **SAFE**

**Reason:** Owner hedging on severity scales is expected and does not imply clinical danger. An explicit
`unknown` value allows the system to avoid forcing a false severity characterization while still acknowledging
that lethargy is present. The probability model should treat `unknown` severity as a degraded signal — not
equivalent to `severe`, not equivalent to `mild`. This is preferable to heuristic regex capture.

---

### `consciousness_level` — line 1919

```
choices: ["alert", "dull", "unresponsive"]
critical: true
```

**Observation:** Consciousness level is a direct observational red-flag differentiator. An unresponsive dog is
an immediate emergency escalation. A dull but responsive dog requires urgent evaluation. This is not a scale
that should ever be `unknown` — if the owner is interacting with the system about a dog, they have direct
observation of the animal.

**Classification:** **UNSAFE**

**Reason:** Consciousness level is directly observable by any owner who is physically present. "I don't know"
is not a valid response to whether a dog is alert or unresponsive. If the owner cannot assess this, the
correct action is an immediate emergency recommendation, not `unknown` storage. **Unknown must remain an
emergency-redirect path here, not a stored answer.**

---

## Family 4: Stool and GI Family

### `stool_consistency` — line 1679

```
choices: ["formed", "soft", "watery", "mucus"]
critical: false
```

**Observation:** Stool consistency is directly observable by anyone who sees the stool. However, not all owners
see every stool, especially in multi-pet households or outdoor access scenarios. This is `critical: false`.

**Classification:** **SAFE**

**Reason:** Owner uncertainty is plausible (not all stool is witnessed) and `stool_consistency: unknown` does
not mask a red-flag signal on its own. The stool blood question (`stool_blood`) carries the acute signal.
Consistency unknown degrades the GI differential precision but does not create a safety hazard.

---

### `blood_color` — line 2016

```
choices: ["bright_red", "dark_tarry"]
critical: true
```

**Observation:** Blood color in stool is a critical differentiator between lower GI bleeding (bright red:
hematochezia) and upper GI/gastric bleeding (dark tarry: melena). Melena implies significantly higher urgency.
The owner may have seen blood but cannot always characterize the color in low light or with small amounts.

**Classification:** **NEEDS DECISION**

**Reason:** "I saw blood but can't tell the color" is clinically plausible. However, both `bright_red` and
`dark_tarry` carry high urgency — the difference is in disease localization and treatment approach, not in
whether to escalate. A product decision is needed: should `unknown` here trigger the higher-urgency branch
(melena default) or a separate "blood present, color unknown" pathway? This cannot be resolved from schema
alone without upstream product alignment on how the probability model treats this ambiguity.

---

### `blood_amount` — line 2024

```
choices: ["streaks", "mixed_in", "mostly_blood"]
critical: true
```

**Observation:** Blood amount is a severity proxy. `mostly_blood` is a higher urgency signal than `streaks`.
Owner may have limited observational context (did not see the full stool, limited lighting, etc.).

**Classification:** **NEEDS DECISION**

**Reason:** Similar to `blood_color` — both ends of the spectrum are urgent. The question is whether `unknown`
should default to the most conservative (highest urgency) interpretation or be handled as a separate pathway.
Requires the same product/clinical alignment as `blood_color`. These two questions should be resolved together
and not in isolation.

---

## Family 5: Respiratory Family

### `cough_type` — line 1696

```
choices: ["dry_honking", "wet_productive", "gagging"]
critical: true
```

**Observation:** Cough character is a differentiator for kennel cough (dry honking), pneumonia (wet productive),
and reverse sneezing or partial obstruction (gagging). Owners often cannot distinguish cough types without
clinical guidance. Owner uncertainty is clinically common.

**Classification:** **SAFE**

**Reason:** Cough type is a differentiator but not a direct red-flag trigger on its own. An owner who cannot
characterize the cough type is a normal clinical presentation. An explicit `unknown` avoids forcing a false
characterization while preserving the data that coughing is present. The presence of cough + other signals
(breathing rate, gum color) carries the urgency signal.

---

### `breathing_onset` — line 1735

```
choices: ["sudden", "gradual"]
critical: true
```

**Observation:** Sudden onset of breathing difficulty is a direct emergency differentiator (pneumothorax,
acute congestive heart failure, foreign body obstruction). Gradual onset suggests a developing process with
lower immediate urgency.

**Classification:** **UNSAFE**

**Reason:** An owner who reports breathing difficulty and then cannot say whether it was sudden or gradual is
clinically implausible in most cases — sudden onset of labored breathing is a memorable and alarming event.
If the owner genuinely cannot determine onset, the safety-conservative answer is to treat it as sudden and
escalate. **Unknown must remain an emergency-redirect path here, not a stored answer.**

---

### `gum_color` — line 1743

```
choices: ["pink_normal", "pale_white", "blue", "bright_red", "yellow"]
critical: true
```

**Observation:** Gum color is a direct clinical red-flag indicator. Blue gums (cyanosis) are an immediate
emergency. Pale/white gums indicate shock or severe anemia. Yellow indicates jaundice. Pink is normal. This
is a safety-critical observable fact.

**Classification:** **UNSAFE**

**Reason:** Gum color is a direct observable. An owner who can look at the dog can assess gum color —
the question text provides guidance ("Pink is normal. Blue, white, or bright red is concerning."). An `unknown`
response to gum color in the context of a respiratory emergency should trigger escalation, not storage.
**Unknown must remain an emergency-redirect path here, not a stored answer.** Adding `unknown` to the schema
would risk normalizing non-observation of a critical diagnostic indicator.

---

## Family 6: Trembling and Neurological Family

### `trembling_timing` — line 1911

```
choices: ["constant", "intermittent"]
critical: false
```

**Observation:** Trembling pattern informs whether the presentation is an acute episode (constant) or
episodic (intermittent, possibly idiopathic or pain-related). This is `critical: false` and the owner
can usually assess whether trembling is happening right now versus comes and goes.

**Classification:** **SAFE**

**Reason:** Owner uncertainty on pattern is plausible — some presentations transition between states between
observation and the conversation. An explicit `unknown` is clinically harmless here. The urgency signal
comes from other fields (consciousness level, red flags). This is a low-stakes differentiator.

---

## Family 7: Skin and Allergy Family

### `seasonal_pattern` — line 1784

```
choices: ["seasonal", "year_round"]
critical: false
```

**Observation:** Seasonal vs. year-round scratching helps differentiate environmental allergy (seasonal)
from food allergy or contact allergy (year-round). This is `critical: false` and purely a differential
refinement signal.

**Classification:** **SAFE**

**Reason:** Many owners have not had the dog long enough to assess seasonality, or the current episode is the
first. Owner uncertainty is clinically common. An explicit `unknown` avoids forcing a false characterization
with no safety risk.

---

## Family 8: Wound Family

### `wound_discharge` — line 2093

```
choices: ["none", "clear_fluid", "pus", "blood", "mixed"]
critical: true
```

**Observation:** Wound discharge type is an infection indicator. `pus` and `mixed` imply active infection.
`blood` may indicate active bleeding. `none` vs `clear_fluid` helps characterize the phase of wound healing.
Owner can directly observe this.

**Classification:** **NEEDS DECISION**

**Reason:** The owner can observe discharge, but may not characterize it confidently — the difference between
`clear_fluid` and `mixed` is not always obvious. However, `pus` and `blood` are recognizable. A product
decision is needed: should `unknown` discharge default to infection-suspect behavior (conservative escalation),
or should it only be allowed when none of the enumerated types fit? This cannot be resolved from schema alone.

---

## Summary Table

| Question ID | Line | Choices | Critical | Family | Classification | Unknown Disposition |
|---|---|---|---|---|---|---|
| `limping_progression` | 1510 | better / worse / same | true | Limping | **SAFE** | Stored as `unknown` |
| `weight_bearing` | 1519 | weight_bearing / partial / non_weight_bearing | true | Limping | **UNSAFE** | Clarification path only |
| `appetite_status` | 1623 | normal / decreased / none | false | Appetite | **NEEDS DECISION** | Requires policy alignment |
| `water_intake` | 1638 | normal / more / less / not_drinking | true | Intake | **SAFE** | Stored as `unknown`; must not resolve to `normal` |
| `lethargy_severity` | 1653 | mild / moderate / severe | true | Severity | **SAFE** | Stored as `unknown`; must not map to `mild` |
| `stool_consistency` | 1679 | formed / soft / watery / mucus | false | GI | **SAFE** | Stored as `unknown` |
| `cough_type` | 1696 | dry_honking / wet_productive / gagging | true | Respiratory | **SAFE** | Stored as `unknown` |
| `breathing_onset` | 1735 | sudden / gradual | true | Respiratory | **UNSAFE** | Emergency-redirect path only |
| `gum_color` | 1743 | pink_normal / pale_white / blue / bright_red / yellow | true | Respiratory | **UNSAFE** | Emergency-redirect path only |
| `seasonal_pattern` | 1784 | seasonal / year_round | false | Skin | **SAFE** | Stored as `unknown` |
| `appetite_change` | 1889 | increased / decreased / normal | true | Appetite/Weight | **UNSAFE** | Clarification path only |
| `trembling_timing` | 1911 | constant / intermittent | false | Neurological | **SAFE** | Stored as `unknown` |
| `consciousness_level` | 1919 | alert / dull / unresponsive | true | Neurological | **UNSAFE** | Emergency-redirect path only |
| `blood_color` | 2016 | bright_red / dark_tarry | true | GI/Blood | **NEEDS DECISION** | Resolve with `blood_amount` |
| `blood_amount` | 2024 | streaks / mixed_in / mostly_blood | true | GI/Blood | **NEEDS DECISION** | Resolve with `blood_color` |
| `wound_discharge` | 2093 | none / clear_fluid / pus / blood / mixed | true | Wound | **NEEDS DECISION** | Requires policy alignment |

---

## Classification Counts

| Classification | Count | Question IDs |
|---|---|---|
| **SAFE** | 7 | `limping_progression`, `water_intake`, `lethargy_severity`, `stool_consistency`, `cough_type`, `seasonal_pattern`, `trembling_timing` |
| **UNSAFE** | 5 | `weight_bearing`, `appetite_change`, `breathing_onset`, `gum_color`, `consciousness_level` |
| **NEEDS DECISION** | 4 | `appetite_status`, `blood_color`, `blood_amount`, `wound_discharge` |

---

## UNSAFE Case Rule

For all five UNSAFE families, the following rule applies without exception:

> When a user responds with "I don't know", "not sure", "can't tell", or equivalent to an UNSAFE question,
> the system **must not store `unknown` as the answer**. The correct path is either:
> 1. **Clarification path** — re-ask with rephrasing or additional context (for `weight_bearing`, `appetite_change`)
> 2. **Emergency-redirect path** — immediately escalate to vet contact recommendation (for `breathing_onset`, `gum_color`, `consciousness_level`)

This is not a preference. These are questions where a stored `unknown` creates clinical harm by masking
a signal that should trigger escalation.

---

## NEEDS DECISION Case Rule

For the four NEEDS DECISION families, implementation must wait on explicit product/clinical policy alignment.
The open questions for each are:

**`appetite_status`:**
- Does `unknown` appetite in a lethargic or vomiting dog default to absent-appetite urgency or reduced-confidence no-escalation?

**`blood_color` and `blood_amount`:**
- These two must be decided together.
- Does "I saw blood but cannot characterize it" default to upper-GI urgency (conservative), lower-GI urgency, or a new "blood present, characterization pending" state?

**`wound_discharge`:**
- Does `unknown` discharge default to infection-suspect (conservative) or require clarification before escalation?

---

## What Comes Next (Follow-up, Not This Ticket)

The following are implementation follow-ups. They are explicitly out of scope here:

1. **Schema widening** — Adding `unknown` to the SAFE question choices in `clinical-matrix.ts`. This requires a separate implementation ticket.
2. **Coercion rule update** — Updating the coercion layer to map "I don't know" regex patterns to the explicit `unknown` choice value for SAFE questions.
3. **Clarification routing** — Implementing the clarification-path behavior for UNSAFE questions (ask a follow-up with more guidance).
4. **Emergency redirect** — Implementing the emergency-redirect behavior for UNSAFE neurological/respiratory questions when owner cannot assess.
5. **Policy resolution** — Product/clinical alignment meeting for the four NEEDS DECISION cases.

---

## Files Changed

- `src/lib/clinical-matrix.ts` — no changes (read-only reference)
- `docs/tickets/VET-722-unknown-option-proposal.md` — new file (this document)
