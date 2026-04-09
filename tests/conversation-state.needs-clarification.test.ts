import { createSession } from "@/lib/triage-engine";
import {
  transitionToAnswered,
  transitionToNeedsClarification,
} from "@/lib/conversation-state";

describe("conversation-state needs clarification transitions", () => {
  it("records clarification metadata and keeps the question unresolved", () => {
    const session = createSession();

    const updated = transitionToNeedsClarification({
      session: {
        ...session,
        last_question_asked: "water_intake",
      },
      questionId: "water_intake",
      reason: "pending_recovery_failed",
    });

    expect(updated.case_memory?.unresolved_question_ids).toContain(
      "water_intake"
    );
    expect(updated.case_memory?.clarification_reasons).toEqual({
      water_intake: "pending_recovery_failed",
    });
  });

  it("clears clarification metadata once the answer is recorded", () => {
    const session = transitionToNeedsClarification({
      session: {
        ...createSession(),
        last_question_asked: "water_intake",
      },
      questionId: "water_intake",
      reason: "pending_recovery_failed",
    });

    const answered = transitionToAnswered({
      session,
      questionId: "water_intake",
      value: "drinking normally",
      reason: "pending_question_recovered",
    });

    expect(answered.case_memory?.unresolved_question_ids).not.toContain(
      "water_intake"
    );
    expect(answered.case_memory?.clarification_reasons).toEqual({});
  });
});
