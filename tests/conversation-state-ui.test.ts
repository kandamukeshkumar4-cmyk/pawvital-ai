import type { ConversationState } from "@/lib/conversation-state/types";
import { CONVERSATION_STATE_VALUES } from "@/lib/conversation-state/types";
import {
  clientSessionToControlSnapshot,
  getConversationStateUi,
  resolveConversationStateFromSession,
} from "@/app/(dashboard)/symptom-checker/conversation-state-ui";

/** Internal snake_case / telemetry tokens must not appear in owner-facing strings. */
const FORBIDDEN_LEAKS = [
  "needs_clarification",
  "answered_unconfirmed",
  "conversation_state",
  "question_state",
  "state_transition",
];

function assertNoInternalTokenLeak(ui: ReturnType<typeof getConversationStateUi>) {
  const blob = [ui.label, ui.title, ui.body].join(" ").toLowerCase();
  for (const token of FORBIDDEN_LEAKS) {
    expect(blob).not.toContain(token);
  }
}

describe("getConversationStateUi", () => {
  it("idle: waiting copy and no helper", () => {
    const ui = getConversationStateUi("idle", false);
    expect(ui.body).toContain("Waiting to start a triage conversation");
    expect(ui.showClarificationHelper).toBe(false);
    expect(ui.elevateReportCta).toBe(false);
    expect(ui.tone).toBe("neutral");
    assertNoInternalTokenLeak(ui);
  });

  it("asking: gathering copy", () => {
    const ui = getConversationStateUi("asking", false);
    expect(ui.body).toContain("still gathering key clinical details");
    expect(ui.showClarificationHelper).toBe(false);
    expect(ui.elevateReportCta).toBe(false);
    expect(ui.tone).toBe("info");
    assertNoInternalTokenLeak(ui);
  });

  it("needs_clarification: warning copy and composer helper flag", () => {
    const ui = getConversationStateUi("needs_clarification", false);
    expect(ui.tone).toBe("warning");
    expect(ui.body).toContain("specific enough");
    expect(ui.showClarificationHelper).toBe(true);
    expect(ui.elevateReportCta).toBe(false);
    assertNoInternalTokenLeak(ui);
  });

  it("confirmed: success copy", () => {
    const ui = getConversationStateUi("confirmed", false);
    expect(ui.tone).toBe("success");
    expect(ui.body).toContain("Enough information has been confirmed");
    expect(ui.showClarificationHelper).toBe(false);
    expect(ui.elevateReportCta).toBe(false);
    assertNoInternalTokenLeak(ui);
  });

  it("confirmed + readyForReport elevates report CTA", () => {
    const off = getConversationStateUi("confirmed", false);
    const on = getConversationStateUi("confirmed", true);
    expect(off.elevateReportCta).toBe(false);
    expect(on.elevateReportCta).toBe(true);
    assertNoInternalTokenLeak(on);
  });

  it("readyForReport alone does not elevate when not confirmed", () => {
    const ui = getConversationStateUi("asking", true);
    expect(ui.elevateReportCta).toBe(false);
  });

  it("clarification state is the only state that shows helper", () => {
    const states: ConversationState[] = [
      "idle",
      "asking",
      "answered_unconfirmed",
      "confirmed",
      "escalation",
    ];
    for (const s of states) {
      expect(getConversationStateUi(s, false).showClarificationHelper).toBe(
        false
      );
    }
    expect(
      getConversationStateUi("needs_clarification", false).showClarificationHelper
    ).toBe(true);
  });

  it("owner-facing strings do not include internal enum / telemetry tokens", () => {
    for (const state of CONVERSATION_STATE_VALUES) {
      for (const ready of [false, true]) {
        assertNoInternalTokenLeak(getConversationStateUi(state, ready));
      }
    }
  });
});

describe("resolveConversationStateFromSession", () => {
  it("uses API conversationState when valid", () => {
    const session = {
      last_question_asked: "q1",
      answered_questions: [],
      case_memory: { unresolved_question_ids: [] },
    };
    expect(
      resolveConversationStateFromSession(session, "needs_clarification")
    ).toBe("needs_clarification");
  });

  it("infers asking when last question unanswered", () => {
    const session = {
      last_question_asked: "water_intake",
      answered_questions: [] as string[],
      extracted_answers: {},
      case_memory: { unresolved_question_ids: [] },
    };
    expect(resolveConversationStateFromSession(session, null)).toBe("asking");
  });

  it("returns idle for null session without API state", () => {
    expect(resolveConversationStateFromSession(null, undefined)).toBe("idle");
  });
});

describe("clientSessionToControlSnapshot", () => {
  it("maps triage session fields into control snapshot shape", () => {
    const snap = clientSessionToControlSnapshot({
      last_question_asked: "x",
      answered_questions: ["a"],
      extracted_answers: { a: "yes" },
      case_memory: { unresolved_question_ids: ["u"] },
    });
    expect(snap).toEqual({
      answeredQuestionIds: ["a"],
      extractedAnswers: { a: "yes" },
      unresolvedQuestionIds: ["u"],
      lastQuestionAsked: "x",
    });
  });
});
