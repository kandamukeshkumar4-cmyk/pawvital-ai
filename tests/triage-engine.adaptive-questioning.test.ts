import {
  createSession,
  addSymptoms,
  recordAnswer,
  getNextQuestion,
  getMissingQuestions,
  isReadyForDiagnosis,
  type TriageSession,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS } from "@/lib/clinical-matrix";

const ADDITIONAL_CONTEXT_ID = "additional_context";
const MAX_QUESTIONS = 12; // mirrors MAX_QUESTIONS_BEFORE_READY in triage-engine

// Ticket 1 — deeper adaptive questioning.
// The engine must keep asking targeted follow-ups (not stop the moment the
// critical questions clear), offer one open-ended capture turn before
// concluding, stay bounded, and still short-circuit on red flags.
describe("Ticket 1 — deeper adaptive questioning", () => {
  it("registers a non-critical, free-text open-ended capture question", () => {
    const q = FOLLOW_UP_QUESTIONS[ADDITIONAL_CONTEXT_ID];
    expect(q).toBeDefined();
    expect(q.critical).toBe(false);
    expect(q.data_type).toBe("string");
  });

  it("does not conclude the moment the critical questions are cleared", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);

    const criticalsRemain = (s: TriageSession) =>
      getMissingQuestions(s).some((id) => FOLLOW_UP_QUESTIONS[id]?.critical);

    let guard = 0;
    while (criticalsRemain(session) && guard < 20) {
      const q = getNextQuestion(session);
      if (!q) break;
      session = recordAnswer(session, q, "no");
      guard++;
    }

    // With the criticals answered, there is still more to gather (non-critical
    // follow-ups and/or the capture turn) — the engine must not be "ready" yet.
    expect(session.answered_questions.length).toBeLessThan(MAX_QUESTIONS);
    expect(isReadyForDiagnosis(session)).toBe(false);
    expect(getNextQuestion(session)).not.toBeNull();
  });

  it("offers the open-ended capture turn exactly once, then concludes", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);

    // Drain every structured follow-up (criticals, non-criticals, trajectory).
    let guard = 0;
    while (guard < 30) {
      const q = getNextQuestion(session);
      if (!q || q === ADDITIONAL_CONTEXT_ID) break;
      session = recordAnswer(session, q, "no");
      guard++;
    }

    // We must reach the capture turn before the hard ceiling.
    expect(session.answered_questions.length).toBeLessThan(MAX_QUESTIONS);
    expect(getNextQuestion(session)).toBe(ADDITIONAL_CONTEXT_ID);
    expect(isReadyForDiagnosis(session)).toBe(false);

    // After it is answered, the engine concludes and never re-asks it.
    session = recordAnswer(session, ADDITIONAL_CONTEXT_ID, "nothing else really");
    expect(getNextQuestion(session)).toBeNull();
    expect(isReadyForDiagnosis(session)).toBe(true);
  });

  it("still concludes immediately when a red flag fires (regression guard)", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_blood", true);
    expect(session.red_flags_triggered.length).toBeGreaterThan(0);
    expect(isReadyForDiagnosis(session)).toBe(true);
  });

  it("is bounded — concludes at the hard ceiling even if questions remain", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);
    // Force the answered count to the ceiling with synthetic ids.
    session.answered_questions = Array.from(
      { length: MAX_QUESTIONS },
      (_, i) => `synthetic_q_${i}`
    );
    expect(getNextQuestion(session)).toBeNull();
    expect(isReadyForDiagnosis(session)).toBe(true);
  });

  it("never exceeds the ceiling while draining a multi-symptom case", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting", "not_eating"]);
    let guard = 0;
    while (!isReadyForDiagnosis(session) && guard < 40) {
      const q = getNextQuestion(session);
      if (!q) break;
      session = recordAnswer(session, q, "no");
      guard++;
    }
    expect(isReadyForDiagnosis(session)).toBe(true);
    expect(session.answered_questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
  });

  it("keeps isReadyForDiagnosis consistent with getNextQuestion in the normal band", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);
    for (let i = 0; i < 8; i++) {
      if (
        session.answered_questions.length < MAX_QUESTIONS &&
        session.red_flags_triggered.length === 0
      ) {
        expect(isReadyForDiagnosis(session)).toBe(
          getNextQuestion(session) === null
        );
      }
      const q = getNextQuestion(session);
      if (!q) break;
      session = recordAnswer(session, q, "no");
    }
  });
});
