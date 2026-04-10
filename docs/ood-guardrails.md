# Uncertainty, Contradiction, and OOD Guardrails — PawVital AI

> **Version:** 1.0.0
> **Date:** 2026-04-10
> **Purpose:** Deterministic handling for conflicting answers, unsupported symptom combinations, missing critical info, and out-of-scope complaints.

---

## Design Principles

1. **Never force a bad answer.** If the system can't safely assess, it says so.
2. **Never guess at emergencies.** Missing critical emergency data = escalate, not assume.
3. **Never contradict yourself.** If the owner gives conflicting answers, flag and clarify.
4. **Deterministic, not LLM-based.** These are code-level rules.

---

## 1. Contradictory Answer Handling

### Detection Rules

```typescript
interface ContradictionRule {
  id: string;
  description: string;
  detect: (answers: Record<string, unknown>) => boolean;
  resolution: "clarify" | "escalate" | "take_worst_case";
}
```

### Known Contradictions

| Contradiction | Conflicting Answers | Resolution |
|---|---|---|
| `appetite_conflict` | appetite_status = "normal" AND extracted "not eating" from text | clarify |
| `energy_conflict` | lethargy_severity = "mild" AND owner says "barely moving" | clarify |
| `onset_conflict` | limping_onset = "gradual" AND owner says "happened suddenly today" | clarify |
| `water_conflict` | water_intake = "not_drinking" AND owner says "drinking fine" | clarify |
| `gum_conflict` | gum_color = "pink_normal" AND owner describes "white gums" | escalate (take worst case) |
| `breathing_conflict` | breathing_status = "normal" AND difficulty_breathing symptom reported | escalate (take worst case) |
| `puppy_age_conflict` | puppy_concern but age > 1 year | clarify |

### Resolution Strategy

```
IF contradiction detected:
  IF resolution == "clarify":
    → Ask clarifying question: "You mentioned [X] earlier, but also [Y]. Can you help me understand?"
    → Do NOT proceed to disposition until resolved
    → If owner cannot resolve after 1 attempt → escalate to "cannot safely assess"
  IF resolution == "escalate":
    → Take the worst-case interpretation
    → Proceed with emergency/urgent pathway
  IF resolution == "take_worst_case":
    → Use the more concerning answer for safety calculations
    → Note the contradiction in the output
```

---

## 2. Out-of-Distribution (OOD) Detection

### Detection Rules

```
IF input doesn't match any of the 50 complaint families → OOD
IF species !== "dog" → OOD
IF input is purely educational/hypothetical ("what if my dog...") → OOD
IF input asks for medication dosing → OOD
IF input asks for surgery/procedure advice → OOD
IF input describes a non-animal scenario → OOD
IF input is too vague to map to any complaint ("my dog is weird") → UNKNOWN_CONCERN pathway
```

### OOD Response

```
DETERMINISTIC OOD RESPONSE:
"I can't safely assess this situation with my current knowledge. This falls outside what I'm designed to evaluate.

Please contact your veterinarian for guidance on this.

📞 For general vet advice: [local vet number]
🚨 For emergencies: [nearest emergency vet]"
```

### Partial OOD

When some symptoms map but others don't:
1. Process the mapped symptoms through the normal triage pathway
2. Note the unmapped symptoms: "I can assess [X], but I'm not able to evaluate [Y]."
3. If the unmapped symptoms could be emergency-related → escalate
4. If the mapped symptoms are low-urgency but unmapped could be high → escalate

---

## 3. Missing Critical Information Handling

### Critical Information Checklist

Before giving ANY disposition, the system must have assessed:

| Critical Sign | If Missing | Action |
|---|---|---|
| Breathing status | Owner cannot assess or didn't report | Ask directly. If still unknown and any respiratory symptom → escalate |
| Gum color | Owner cannot assess | Ask with guidance. If still unknown and any systemic sign → escalate |
| Consciousness level | Not reported | Ask. If unresponsive → emergency |
| Toxin exposure possibility | Not asked when vomiting/trembling | Must ask. If unknown and symptoms present → treat as possible toxin |
| Water intake | Not reported when not eating | Must ask. Not drinking > 24h → urgent |
| Puppy age | Not reported when puppy concern | Must ask. < 12 weeks with symptoms → urgent |
| Intact female status | Not reported when drinking more/lethargic | Must ask. Intact female + signs → pyometra screen |
| Abdomen distension | Not reported when vomiting/retching | Must ask. Distended + retching → GDV emergency |

### Missing Info Escalation Ladder

```
Step 1: Ask the critical question directly (1 attempt)
Step 2: If owner says "I can't tell" or "I don't know":
  → Provide guidance on how to check ("Lift their lip gently...")
  → If still cannot assess → escalate
Step 3: If owner doesn't answer or gives vague response:
  → Rephrase once
  → If still unclear → proceed with worst-case assumption
Step 4: If 2+ critical signs remain unknown:
  → "I cannot safely continue without this information. Please contact your vet."
```

---

## 4. Unsupported Symptom Combinations

### Detection

Some symptom combinations are clinically implausible or suggest a different problem:

| Combination | Issue | Action |
|---|---|---|
| vomiting + diarrhea + NOT lethargic + eating normally (for > 48h) | Unlikely if true GI disease | Note inconsistency, ask about energy |
| limping on all 4 legs + no trauma + normal energy | Systemic not orthopedic | Shift to generalized_stiffness pathway |
| seizure + fully normal within 1 minute | Unlikely true seizure | Ask about episode details |
| bleeding from multiple sites + otherwise normal | Coagulopathy or toxin | Escalate to emergency |
| swollen abdomen + eating normally + playing | May not be true distension | Ask about abdomen firmness |

### Resolution

```
IF unsupported combination detected:
  → Acknowledge both findings
  → Ask clarifying question about the inconsistency
  → If owner confirms both → shift diagnostic pathway
  → If owner is uncertain → proceed with more conservative pathway
```

---

## 5. Out-of-Scope Complaint Handling

### Scope Definition

PawVital is designed for:
- Dog symptom assessment and triage
- Emergency detection and escalation
- Owner-facing guidance (not veterinary diagnosis)

NOT designed for:
- Medication dosing or prescription advice
- Surgical or procedural guidance
- Cat or exotic animal triage
- Breeding or reproduction management
- Nutrition formulation
- Behavioral training (beyond pain-based aggression screening)
- Insurance or billing questions
- Post-surgical follow-up beyond incision monitoring

### Out-of-Scope Response

```
"This is outside what I can safely advise. For [topic], please speak with your veterinarian.

If your dog is showing symptoms I can help assess, please describe what you're noticing."
```

---

## 6. Implementation in Triage Engine

The guardrails integrate into the existing triage flow:

```
User Input
  → Normalize to complaint families (normalizeSymptom)
  → IF no match → OOD handler
  → IF match → extract symptoms, check red flags
  → IF contradictory answers detected → clarify or escalate
  → IF critical info missing → ask, then escalate if still missing
  → IF unsupported combination detected → shift pathway
  → IF out-of-scope → decline and redirect
  → Normal triage flow (question → answer → disposition)
  → IF at any point safety cannot be assured → abstain
```

### New Red Flag Types for Guardrails

| Flag | Meaning | Trigger |
|---|---|---|
| `contradiction_detected` | Owner gave conflicting answers | Contradiction rule match |
| `critical_info_missing` | Must-know information unavailable | Missing info checklist fail |
| `ood_complaint` | No ontology match | normalizeSymptom returns null |
| `out_of_scope` | Request outside pawvital scope | Keyword/pattern detection |
| `cannot_assess` | Owner cannot evaluate critical sign | After 2 attempts to guide |
| `unsafe_combination` | Symptom combo suggests misclassification | Unsupported combination rule |

---

## 7. Testing Requirements

Each guardrail must be tested with:

1. **True positive cases** — where the guardrail should fire
2. **True negative cases** — where similar-but-valid inputs should NOT fire
3. **Edge cases** — ambiguous inputs that test the boundary
4. **Safety cases** — ensuring the guardrail doesn't suppress a legitimate emergency pathway

Minimum: **10 test cases per guardrail type × 6 types = 60 test cases**
