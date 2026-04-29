# Next-Best-Question Planner — Qwen Implementation Notes

> **Ticket:** VET-1407Q
> **Date:** 2026-04-28
> **Author:** Qwen 3.6 Plus
> **Scope:** Pure TypeScript utilities + tests. Not wired into production flow.

---

## Files

| File | Purpose |
|------|---------|
| `src/lib/clinical-intelligence/next-question-planner.ts` | Deterministic planner: scoring, candidate selection, fallback |
| `src/lib/clinical-intelligence/question-card-types.ts` | ClinicalQuestionCard interface stub (full version in VET-1400) |
| `src/lib/clinical-intelligence/question-card-registry.ts` | Registry stub (full version in VET-1400) |
| `tests/clinical-intelligence/next-question-planner.test.ts` | 25 unit tests covering all acceptance criteria |

---

## Planner Output Type

```typescript
interface PlannedQuestion {
  questionId: string;
  ownerText: string;
  shortReason: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  screenedRedFlags: string[];
  selectedBecause: "emergency_screen" | "highest_information_gain" | "urgency_changing" | "report_value" | "clarification";
}
```

---

## Scoring Formula

```
score =
  emergencyValue * 5        // 0-15: phase=emergency_screen or positive/unknown red flags
+ urgencyImpact * 4         // 0-12: from question card
+ discriminativeValue * 3   // 0-9: from question card
+ reportValue * 2           // 0-6: from question card
+ ownerAnswerability * 2    // 0-6: from question card
+ modulePhasePriority       // 30/15/12/8/5/3: emergency_screen > characterize > discriminate > timeline > history > handoff_detail
- repetitionPenalty         // -50: if card was already asked
- alreadyKnownPenalty       // -20: if skipIfAnswered keys are in explicitAnswers
- offTopicPenalty           // -15: if card doesn't match active complaint module
- tooManyQuestionsPenalty   // -10: if askedQuestionIds >= maxQuestionsPerTurn
```

### Module Phase Priority
| Phase | Priority |
|-------|----------|
| emergency_screen | 30 |
| characterize | 15 |
| discriminate | 12 |
| timeline | 8 |
| history | 5 |
| handoff_detail | 3 |

---

## Core Functions

### Planning
- `planNextClinicalQuestion(caseState, options?)` — main entry point; returns `PlannedQuestion` or `PlannerFallbackResult`
- `getCandidateQuestionCards(caseState, options?)` — filters registry by active module, excludes answered/asked
- `filterAnsweredOrAskedQuestions(cards, caseState, options?)` — removes answered/skipIfAnswered/asked cards
- `selectHighestScoringQuestion(scoredQuestions)` — picks max score from scored list

### Scoring
- `scoreQuestionCard(card, caseState, options?)` — computes total score
- `buildQuestionScoreBreakdown(card, caseState, options?)` — returns per-component breakdown

### Fallback
- `fallbackToSafeEmergencyQuestion(caseState)` — returns emergency card or `no_valid_questions` fallback

---

## Safety Rules

1. **Never return an already answered question** — filtered by `answeredQuestionIds` and `skipIfAnswered` keys in `explicitAnswers`
2. **Never return an already asked question** — unless `options.allowClarification === true`
3. **Emergency-screen cards outrank routine characterization** — phase priority (30 vs 15) + emergency value scoring
4. **Emergency urgency returns handoff sentinel** — if `currentUrgency === "emergency"`, returns `emergency_handoff` instead of routine questions
5. **No diagnosis or treatment text** — `ownerText` and `shortReason` come directly from question cards
6. **No invented question text** — planner only selects from existing registry cards
7. **No bucket label exposure** — `PlannedQuestion` has no concern-bucket fields
8. **Cannot downgrade emergency urgency** — planner only reads urgency, never modifies it

---

## selectedBecause Logic

| Condition | selectedBecause |
|-----------|----------------|
| `card.phase === "emergency_screen"` | `emergency_screen` |
| `urgencyImpact >= 8 && trajectory === "worsening"` | `urgency_changing` |
| `reportValue >= discriminativeValue && reportValue >= 4` | `report_value` |
| Card was previously asked (`allowClarification === true`) | `clarification` |
| Default | `highest_information_gain` |

---

## Fallback Behavior

| Scenario | Result |
|----------|--------|
| `currentUrgency === "emergency"` + emergency cards available | Returns emergency card |
| `currentUrgency === "emergency"` + no emergency cards | `{ type: "emergency_handoff" }` |
| No valid candidate cards | `{ type: "no_valid_questions" }` |
| All cards scored to zero | `{ type: "no_valid_questions" }` |

---

## Dependencies

- `case-state.ts` — `ClinicalCaseState` type, `createInitialClinicalCaseState()`
- `case-state-update.ts` — `updateRedFlagStatus`, `recordAnsweredQuestion`, `recordAskedQuestion`
- `question-card-types.ts` — `ClinicalQuestionCard` interface (stub; full in VET-1400)
- `question-card-registry.ts` — `getAllQuestionCards()` (stub; full in VET-1400)

---

## NOT Done (Out of Scope)

- No wiring into live symptom-check flow
- No API route changes
- No UI changes
- No model/RAG changes
- No emergency threshold changes
- No new question text generation

---

## Next Steps (Separate Ticket Required — Codex GPT-5.4)

1. Wire planner into symptom-check session loop after VET-1399, VET-1400, VET-1401Q, VET-1406Q are merged
2. Replace stub registry with VET-1400's full question-card registry
3. Integrate concern bucket scores into `modulePhasePriority` or as a separate scoring component
4. Build admin UI for planner inspection
5. Add clarification loop support with `allowClarification` option
