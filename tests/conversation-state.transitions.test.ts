import {
  buildTransitionNote,
  hasControlStateChanged,
  inferConversationState,
  inferQuestionState,
} from "@/lib/conversation-state";
import type { ConversationControlStateSnapshot } from "@/lib/conversation-state";

function createSnapshot(
  overrides: Partial<ConversationControlStateSnapshot> = {}
): ConversationControlStateSnapshot {
  return {
    answeredQuestionIds: [],
    extractedAnswers: {},
    unresolvedQuestionIds: [],
    clarificationReasons: {},
    lastQuestionAsked: undefined,
    ...overrides,
  };
}

describe("conversation-state transition helpers", () => {
  it("infers conversation states from protected control state", () => {
    expect(inferConversationState(createSnapshot())).toBe("idle");
    expect(
      inferConversationState(createSnapshot({ lastQuestionAsked: "water_intake" }))
    ).toBe("asking");
    expect(
      inferConversationState(
        createSnapshot({
          answeredQuestionIds: ["water_intake"],
          lastQuestionAsked: "water_intake",
        })
      )
    ).toBe("answered_unconfirmed");
    expect(
      inferConversationState(
        createSnapshot({ unresolvedQuestionIds: ["trauma_history"] })
      )
    ).toBe("needs_clarification");
    expect(
      inferConversationState(
        createSnapshot({ answeredQuestionIds: ["duration"] })
      )
    ).toBe("confirmed");
  });

  it("infers question states conservatively", () => {
    const snapshot = createSnapshot({
      answeredQuestionIds: ["duration"],
      unresolvedQuestionIds: ["trauma_history"],
      lastQuestionAsked: "water_intake",
    });

    expect(inferQuestionState(snapshot, "duration")).toBe("confirmed");
    expect(inferQuestionState(snapshot, "water_intake")).toBe("asked");
    expect(inferQuestionState(snapshot, "trauma_history")).toBe(
      "needs_clarification"
    );
    expect(inferQuestionState(snapshot, "swelling")).toBe("pending");
  });

  it("detects when protected control state changes", () => {
    const before = createSnapshot({ lastQuestionAsked: "water_intake" });
    const same = createSnapshot({ lastQuestionAsked: "water_intake" });
    const after = createSnapshot({
      answeredQuestionIds: ["water_intake"],
      extractedAnswers: { water_intake: "less" },
      lastQuestionAsked: "water_intake",
    });

    expect(hasControlStateChanged(before, same)).toBe(false);
    expect(hasControlStateChanged(before, after)).toBe(true);
    expect(
      hasControlStateChanged(
        before,
        createSnapshot({
          lastQuestionAsked: "water_intake",
          unresolvedQuestionIds: ["water_intake"],
          clarificationReasons: {
            water_intake: "pending_recovery_failed",
          },
        })
      )
    ).toBe(true);
  });

  it("builds readable transition notes from pure inputs", () => {
    const before = createSnapshot({ lastQuestionAsked: "water_intake" });
    const after = createSnapshot({
      answeredQuestionIds: ["water_intake"],
      extractedAnswers: { water_intake: "less" },
      lastQuestionAsked: "water_intake",
    });

    expect(
      buildTransitionNote({
        before,
        after,
        from: "asked",
        questionId: "water_intake",
        reason: "turn_answer_recorded",
        to: "answered_this_turn",
      })
    ).toBe(
      "question=water_intake | question_state=asked->answered_this_turn | conversation_state=asking->answered_unconfirmed | reason=turn_answer_recorded | answered=1 | unresolved=0"
    );

    expect(
      buildTransitionNote({
        before: createSnapshot({
          unresolvedQuestionIds: ["water_intake"],
        }),
        after: createSnapshot({
          unresolvedQuestionIds: ["water_intake"],
          clarificationReasons: {
            water_intake: "pending_recovery_failed",
          },
        }),
        from: "needs_clarification",
        questionId: "water_intake",
        reason: "pending_recovery_failed",
        to: "needs_clarification",
      })
    ).toContain("clarification_reason=pending_recovery_failed");
  });
});
