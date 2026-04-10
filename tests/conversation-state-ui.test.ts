import {
  clientSessionToControlSnapshot,
  getSymptomCheckerConversationUiConfig,
  parseConversationStateApi,
  resolveConversationStateFromSession,
} from "@/app/(dashboard)/symptom-checker/conversation-state-ui";

/** API-style snake_case and internal tokens must not appear in owner-facing strings. */
const FORBIDDEN_LEAKS = [
  "needs_clarification",
  "answered_unconfirmed",
  "state_transition",
  "observer",
  "protected control",
];

function assertNoInternalTokenLeak(
  config: ReturnType<typeof getSymptomCheckerConversationUiConfig>
) {
  const blob = [
    config.badgeLabel,
    config.railHeadline,
    config.railBody,
    config.clarificationComposerHelperText,
    config.reportCtaHeading,
    config.reportCtaSubcopy,
  ].join(" ");
  const lower = blob.toLowerCase();
  for (const s of FORBIDDEN_LEAKS) {
    expect(lower).not.toContain(s);
  }
}

describe("VET-833: getSymptomCheckerConversationUiConfig", () => {
  it("idle: muted guidance and no clarification helper", () => {
    const c = getSymptomCheckerConversationUiConfig("idle", false);
    expect(c.tone).toBe("muted");
    expect(c.railBody).toContain("Waiting to start");
    expect(c.showClarificationComposerHelper).toBe(false);
    expect(c.elevateReportCta).toBe(false);
    assertNoInternalTokenLeak(c);
  });

  it("asking: neutral copy", () => {
    const c = getSymptomCheckerConversationUiConfig("asking", false);
    expect(c.tone).toBe("neutral");
    expect(c.railBody).toContain("gathering key clinical");
    expect(c.showClarificationComposerHelper).toBe(false);
    assertNoInternalTokenLeak(c);
  });

  it("needs_clarification: warning + composer helper", () => {
    const c = getSymptomCheckerConversationUiConfig("needs_clarification", false);
    expect(c.tone).toBe("warning");
    expect(c.railHeadline.length).toBeGreaterThan(0);
    expect(c.showClarificationComposerHelper).toBe(true);
    expect(c.clarificationComposerHelperText.length).toBeGreaterThan(10);
    expect(c.railBody).toContain("specific enough");
    assertNoInternalTokenLeak(c);
  });

  it("confirmed: success rail", () => {
    const c = getSymptomCheckerConversationUiConfig("confirmed", false);
    expect(c.tone).toBe("success");
    expect(c.railBody).toContain("confirmed");
    expect(c.showClarificationComposerHelper).toBe(false);
    assertNoInternalTokenLeak(c);
  });

  it("confirmed + readyForReport elevates report CTA", () => {
    const off = getSymptomCheckerConversationUiConfig("confirmed", false);
    const on = getSymptomCheckerConversationUiConfig("confirmed", true);
    expect(off.elevateReportCta).toBe(false);
    expect(on.elevateReportCta).toBe(true);
    expect(on.reportCtaHeading).not.toEqual(off.reportCtaHeading);
    expect(on.reportCtaSubcopy.length).toBeGreaterThan(off.reportCtaSubcopy.length);
    assertNoInternalTokenLeak(on);
  });

  it("null conversationState behaves as idle", () => {
    const c = getSymptomCheckerConversationUiConfig(null, false);
    expect(c.tone).toBe("muted");
    expect(c.railBody).toContain("Waiting to start");
  });

  it("parseConversationStateApi rejects unknown strings", () => {
    expect(parseConversationStateApi("needs_clarification")).toBe("needs_clarification");
    expect(parseConversationStateApi("bogus")).toBeNull();
  });

  it("falls back to inferred state when API state is missing", () => {
    expect(
      resolveConversationStateFromSession(
        {
          last_question_asked: "water_intake",
          answered_questions: [],
          extracted_answers: {},
          case_memory: { unresolved_question_ids: [] },
        },
        null
      )
    ).toBe("asking");
  });

  it("prefers valid API state over inferred session state", () => {
    expect(
      resolveConversationStateFromSession(
        {
          last_question_asked: "water_intake",
          answered_questions: [],
          extracted_answers: {},
          case_memory: { unresolved_question_ids: [] },
        },
        "needs_clarification"
      )
    ).toBe("needs_clarification");
  });

  it("maps client session payloads into control snapshots", () => {
    expect(
      clientSessionToControlSnapshot({
        last_question_asked: "q1",
        answered_questions: ["q0"],
        extracted_answers: { q0: "yes" },
        case_memory: { unresolved_question_ids: ["q1"] },
      })
    ).toEqual({
      answeredQuestionIds: ["q0"],
      extractedAnswers: { q0: "yes" },
      unresolvedQuestionIds: ["q1"],
      clarificationReasons: {},
      lastQuestionAsked: "q1",
    });
  });
});
