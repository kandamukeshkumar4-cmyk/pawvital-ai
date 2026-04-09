import { createSession, type TriageSession } from "@/lib/triage-engine";
import type { ConversationControlStateSnapshot } from "@/lib/conversation-state";

const mockGetStateSnapshot = jest.fn();
const mockObserveTransition = jest.fn();

jest.mock("@/lib/conversation-state/observer", () => ({
  getStateSnapshot: (...args: unknown[]) => mockGetStateSnapshot(...args),
  observeTransition: (...args: unknown[]) => mockObserveTransition(...args),
}));

import { transitionToConfirmed } from "@/lib/conversation-state/confirmation";

function createSnapshot(): ConversationControlStateSnapshot {
  return {
    answeredQuestionIds: ["vomit_duration"],
    extractedAnswers: { vomit_duration: "2 days" },
    unresolvedQuestionIds: [],
    lastQuestionAsked: "vomit_duration",
  };
}

function createConfirmedSession(): TriageSession {
  return {
    ...createSession(),
    answered_questions: ["vomit_duration"],
    extracted_answers: { vomit_duration: "2 days" },
    last_question_asked: "vomit_duration",
  };
}

describe("transitionToConfirmed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    const snapshot = createSnapshot();
    mockGetStateSnapshot.mockReturnValue(snapshot);
    mockObserveTransition.mockImplementation((session: TriageSession) => session);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calls observeTransition with synthetic after snapshot (clears lastQuestionAsked)", () => {
    const session = createConfirmedSession();
    const snapshot = createSnapshot();

    transitionToConfirmed({
      session,
      reason: "all_questions_answered",
    });

    expect(mockObserveTransition).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        before: snapshot,
        after: { ...snapshot, lastQuestionAsked: undefined },
        questionId: "vomit_duration",
        reason: "all_questions_answered",
        to: "confirmed",
      })
    );
  });

  it("does not mutate answered_questions or extracted_answers", () => {
    const answeredQuestions = ["vomit_duration"];
    const extractedAnswers = { vomit_duration: "2 days" };
    const session: TriageSession = {
      ...createSession(),
      answered_questions: answeredQuestions,
      extracted_answers: extractedAnswers,
      last_question_asked: "vomit_duration",
    };

    const updated = transitionToConfirmed({
      session,
      reason: "all_questions_answered",
    });

    expect(updated.answered_questions).toBe(answeredQuestions);
    expect(updated.extracted_answers).toBe(extractedAnswers);
  });

  it("returns a triage session", () => {
    const session = createConfirmedSession();
    const updated = transitionToConfirmed({
      session,
      reason: "all_questions_answered",
    });

    expect(updated).toBe(session);
    expect(updated).toBeTruthy();
  });
});
