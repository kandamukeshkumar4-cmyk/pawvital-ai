import { computeConversationProgress } from "@/lib/symptom-checker/session-progress";
import { createSession } from "@/lib/triage-engine";

describe("computeConversationProgress", () => {
  it("counts answered questions and pending follow-up separately", () => {
    const session = createSession();
    session.answered_questions = ["water_intake", "appetite_duration"];
    session.last_question_asked = "weight_loss";
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["vomit_frequency"],
      pending_question_id: "weight_loss",
    };

    expect(computeConversationProgress(session)).toEqual({
      answered: 2,
      total: 4,
    });
  });

  it("does not double-count pending question already in unresolved list", () => {
    const session = createSession();
    session.answered_questions = ["water_intake"];
    session.last_question_asked = "appetite_duration";
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["appetite_duration"],
      pending_question_id: "appetite_duration",
    };

    expect(computeConversationProgress(session)).toEqual({
      answered: 1,
      total: 2,
    });
  });

  it("does not crash on malformed legacy session payloads", () => {
    const malformedSession = {
      answered_questions: { water_intake: true },
      case_memory: {
        unresolved_question_ids: "appetite_duration",
        pending_question_id: 42,
      },
      last_question_asked: "weight_loss",
    };

    expect(
      computeConversationProgress(
        malformedSession as unknown as Parameters<
          typeof computeConversationProgress
        >[0]
      )
    ).toEqual({
      answered: 0,
      total: 1,
    });
  });
});
