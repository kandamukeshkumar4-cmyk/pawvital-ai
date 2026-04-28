# Clinical Signal Detector (VET-1403K)

## Purpose

The Clinical Signal Detector detects **implicit owner phrases** that suggest possible red flags, without writing those signals as confirmed answers into case state.

It is a pure TypeScript utility with no production wiring, no case-state integration, and no UI changes.

## Signal Output Shape

```typescript
interface ClinicalSignal {
  id: string;                    // e.g. "possible_pale_gums"
  evidenceText: string;          // Exact or near-exact owner phrase
  confidence: number;            // 0.0 - 1.0
  canRaiseUrgency: boolean;      // Signal may raise concern
  canLowerUrgency: false;        // Signals never lower urgency
  needsConfirmation: boolean;    // True for inferred/ambiguous signals
  suggestedQuestionId?: string;  // Maps to VET-1400 question card
}
```

## Design Rules

1. **Signals may raise concern** (`canRaiseUrgency: true` for all current patterns).
2. **Signals may trigger confirmation questions** (`needsConfirmation` flag).
3. **Signals may NOT lower urgency** (`canLowerUrgency` is hardcoded `false`).
4. **Signals may NOT become confirmed answers** — this detector only flags phrases for review.
5. **Evidence preservation** — the exact owner phrase is preserved in `evidenceText` where possible.
6. **Ambiguous phrases** return lower confidence and `needsConfirmation: true`.
7. **False-positive protection** — negation words within an 8-word window suppress detection.

## Signal Library

| Signal ID | Example Trigger | Confidence | Needs Confirmation | Suggested Question |
|-----------|-----------------|------------|-------------------|-------------------|
| `possible_abdominal_pain` | "yelps when I touch his belly" | 0.75 | Yes | `emergency_global_screen` |
| `possible_nonproductive_retching` | "tries to vomit but nothing comes up" | 0.90 | No | `bloat_retching_abdomen_check` |
| `possible_pale_gums` | "gums look white" | 0.90 | No | `gum_color_check` |
| `possible_blue_gums` | "blue gums" | 0.95 | No | `gum_color_check` |
| `possible_breathing_difficulty` | "breathing weird" | 0.80 | Yes | `breathing_difficulty_check` |
| `possible_collapse_or_weakness` | "won't get up" | 0.85 | Yes | `collapse_weakness_check` |
| `possible_urinary_obstruction` | "keeps trying to pee" | 0.85 | Yes | `urinary_blockage_check` |
| `toxin_exposure` | "ate chocolate" | 0.90 | No | `toxin_exposure_check` |
| `possible_heat_stroke` | "panting heavily after being outside in the heat" | 0.80 | Yes | `emergency_global_screen` |
| `possible_neuro_emergency` | "had a seizure and is not acting normal" | 0.90 | No | `seizure_neuro_check` |
| `possible_trauma` | "hit by a car" | 0.95 | No | `emergency_global_screen` |
| `possible_bloat_gdv` | "belly looks swollen and hard" | 0.85 | No | `bloat_retching_abdomen_check` |
| `possible_bloody_vomit` | "vomiting blood" | 0.90 | No | `emergency_global_screen` |
| `possible_bloody_diarrhea` | "blood in diarrhea" | 0.85 | No | `emergency_global_screen` |

## False-Positive Protections

The detector scans for negation words in the 8-word window before a match:

- "he is breathing **normally**" → no breathing signal
- "he vomited once but is now **normal**" → no retching signal
- "he is tired after playing" → no collapse signal (no negation needed, no match)
- "he **peed normally** after trying once" → no urinary obstruction signal
- "gums look **pink and normal**" → no pale gums signal
- "he **isn't** breathing weird anymore" → no breathing signal

## API

### `detectSignals(ownerMessage: string): ClinicalSignal[]`

Returns an array of detected signals for a given owner message.

```typescript
import { detectSignals } from "@/lib/clinical-intelligence/clinical-signal-detector";

const signals = detectSignals("gums look white and he won't get up");
// [
//   { id: "possible_pale_gums", confidence: 0.9, ... },
//   { id: "possible_collapse_or_weakness", confidence: 0.85, ... }
// ]
```

### `detectSignalsWithExplanations(ownerMessage: string)`

Returns signals plus human-readable explanations.

```typescript
const { signals, explanations } = detectSignalsWithExplanations("ate chocolate");
// explanations: ['Detected "toxin_exposure" with confidence 0.9 from phrase: "ate chocolate"']
```

## Scope Boundaries

- **No production behavior change.**
- **No API route changes.**
- **No UI changes.**
- **No planner cutover.**
- **No case-state integration yet.**
- **No model/RAG changes.**
- **Do not downgrade urgency.**
- **Do not write clinical signals into explicitAnswers.**

Codex GPT-5.4 will review and integrate this into the live symptom checker after the VET-1399 baseline is complete.

## Validation

Run the dedicated test suite:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/clinical-signal-detector.test.ts
```

Also run lint and build:

```bash
npm run lint
npm run build
```
