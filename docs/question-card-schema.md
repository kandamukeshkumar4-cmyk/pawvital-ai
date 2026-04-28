# Clinical Question Card Schema

## Overview

Clinical Question Cards are reusable, owner-facing question definitions used by complaint modules and clinical planners. Each card captures what to ask, why to ask it, and how the answer should influence urgency and routing.

## File locations

- Types: `src/lib/clinical-intelligence/question-card-types.ts`
- Registry: `src/lib/clinical-intelligence/question-card-registry.ts`
- Card definitions: `src/lib/clinical-intelligence/question-cards/<domain>.ts`
- Tests: `tests/clinical-intelligence/question-card-registry.test.ts`

## Interface

```typescript
export interface ClinicalQuestionCard {
  id: string;
  ownerText: string;
  shortReason: string;

  complaintFamilies: string[];
  bodySystems: string[];

  phase:
    | "emergency_screen"
    | "characterize"
    | "discriminate"
    | "timeline"
    | "history"
    | "handoff_detail";

  ownerAnswerability: 0 | 1 | 2 | 3;
  urgencyImpact: 0 | 1 | 2 | 3;
  discriminativeValue: 0 | 1 | 2 | 3;
  reportValue: 0 | 1 | 2 | 3;

  screensRedFlags: string[];
  changesUrgencyIf: Record<string, string>;

  answerType: "boolean" | "choice" | "free_text" | "duration" | "number";
  allowedAnswers?: string[];

  skipIfAnswered: string[];
  askIfAny?: string[];
  askIfAll?: string[];

  sourceIds: string[];
  safetyNotes?: string[];
}
```

## Field descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique kebab-case or snake_case identifier. |
| `ownerText` | Yes | The exact question shown to the pet owner. Must be plain language. |
| `shortReason` | Yes | One-sentence explanation of why the question matters. No diagnosis/treatment claims. |
| `complaintFamilies` | Yes | Categories this card belongs to (e.g., `["skin", "allergy"]`). |
| `bodySystems` | Yes | Affected body systems (e.g., `["integumentary"]`). |
| `phase` | Yes | Where in the workflow this question fits. |
| `ownerAnswerability` | Yes | How easily an owner can answer: `0` = impossible without vet, `3` = trivial. |
| `urgencyImpact` | Yes | How much this answer can change urgency: `0` = none, `3` = decisive. |
| `discriminativeValue` | Yes | How much this answer narrows the differential: `0` = none, `3` = highly discriminating. |
| `reportValue` | Yes | How useful this answer is in the final report: `0` = none, `3` = essential. |
| `screensRedFlags` | Yes | List of red-flag concepts this question screens for. |
| `changesUrgencyIf` | Yes | Mapping of answer patterns to urgency guidance. Empty object allowed. |
| `answerType` | Yes | Expected answer format. |
| `allowedAnswers` | No | Required when `answerType` is `"choice"`. |
| `skipIfAnswered` | Yes | IDs of cards that, if already answered, may allow skipping this one. |
| `askIfAny` | No | Only ask if any of these card IDs have been answered positively. |
| `askIfAll` | No | Only ask if all of these card IDs have been answered positively. |
| `sourceIds` | Yes | Evidence or review sources. Use `["internal_pending_review"]` when no external source is ready. |
| `safetyNotes` | No | Required when `ownerAnswerability < 2`. Explains why the low score is acceptable. |

## Phases

- `emergency_screen` — Broad or targeted red-flag screening at triage start.
- `characterize` — Clarify what the owner is observing (location, appearance, frequency).
- `discriminate` — Narrow between likely causes or severity levels.
- `timeline` — Establish onset, progression, or pattern over time.
- `history` — Relevant prior events, exposures, or medications.
- `handoff_detail` — Deep-detail questions useful for the receiving clinician.

## Registry behavior

The registry (`question-card-registry.ts`):

1. Collects all domain card files into a single immutable array.
2. Validates that no two cards share the same `id` at load time.
3. Exports helper functions:
   - `getAllQuestionCards()` — returns every card.
   - `getQuestionCardById(id)` — safe lookup; returns `undefined` if missing.
   - `getQuestionCardsByComplaintFamily(family)` — filters by family membership.
   - `getQuestionCardsByPhase(phase)` — filters by phase.
4. Provides `validateRegistry()` — runs acceptance-criteria checks programmatically.

## Content rules

- **No diagnosis or treatment claims** in `ownerText` or `shortReason`.
- Emergency-screen cards must have `urgencyImpact === 3`.
- `ownerAnswerability` must be `>= 2` unless explicitly justified in `safetyNotes`.
- Every card must have at least one entry in `sourceIds`.
- `skipIfAnswered` must always be an array (may be empty).

## Adding new cards

1. Add the card object to the appropriate domain file under `question-cards/`.
2. Export it from that file.
3. Import and include it in the `ALL_CARDS` array inside `question-card-registry.ts`.
4. Add or update tests in `tests/clinical-intelligence/question-card-registry.test.ts`.
5. Run `npm test -- --runTestsByPath tests/clinical-intelligence/question-card-registry.test.ts`.
