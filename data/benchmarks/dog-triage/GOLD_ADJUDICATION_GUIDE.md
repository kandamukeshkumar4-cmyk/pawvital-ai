# Dog Gold Benchmark Adjudication Guide

This pack is engineering-ready today, but it only becomes a true gold benchmark after veterinarian review.

## Review Goal

For each case, a reviewer should confirm whether the benchmark expectations reflect safe dog triage behavior rather than perfect diagnosis.

## Required Reviewer Decisions

For every case, record:

1. `presentation_valid`
   - Does the owner phrasing match a plausible real-world canine presentation?

2. `urgency_valid`
   - Is the expected top-level response type correct?
   - Allowed categories:
     - `emergency`
     - `question`
     - `ready`
     - `report`

3. `must_not_miss`
   - If the case is dangerous, does the benchmark require escalation strongly enough?

4. `questioning_valid`
   - For non-emergency cases, is the expected next-step question behavior clinically reasonable?

5. `unknown_policy_valid`
   - If the case uses an `unknown` answer path, is the chosen behavior correct?
   - Safe options:
     - record `unknown` and continue
     - re-ask for clarification
     - escalate because the owner cannot assess a critical indicator

6. `expectation_precision`
   - Are the assertions too brittle, too weak, or appropriate?

## Reviewer Labels

Each case should end with one of:

- `approve`
- `approve_with_note`
- `needs_edit`
- `reject_case`

## Common Edit Reasons

- symptom wording is unrealistic for owners
- urgency is too low
- urgency is too high
- expectation checks the wrong symptom id
- follow-up question id is wrong
- unknown handling is unsafe
- unknown handling is too conservative
- case overlaps too much with an existing case

## Adjudication Standards

- Prioritize emergency recall over neat phrasing.
- Prefer deterministic safety over aggressive inference.
- Do not approve a case just because it is plausible; approve it only if the expected engine behavior is what PawVital should ship.
- If the presentation is ambiguous, reviewers should explicitly state what minimum safe behavior is acceptable.

## Recommended Review Workflow

1. Review all emergency cases first.
2. Review unsafe-unknown cases second.
3. Review common complaint question-flow cases third.
4. Review duration and raw-text persistence cases last.
5. Resolve disagreement cases in a second-pass panel.

## Graduation Rule

The folder `gold-candidate/` should only be renamed or promoted to a true gold pack after:

- two clinical reviewers complete independent review
- disagreement cases are reconciled
- all `needs_edit` cases are fixed
- a final version stamp is written into the suite metadata
