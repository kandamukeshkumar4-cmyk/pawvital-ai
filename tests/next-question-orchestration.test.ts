import { createSession } from "@/lib/triage-engine";
import { orchestrateNextQuestion } from "@/lib/symptom-chat/next-question-orchestration";

const mockGetNextQuestionAvoidingRepeat = jest.fn();

jest.mock("@/lib/symptom-chat/answer-coercion", () => ({
  getNextQuestionAvoidingRepeat: (...args: unknown[]) =>
    mockGetNextQuestionAvoidingRepeat(...args),
}));

describe("orchestrateNextQuestion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNextQuestionAvoidingRepeat.mockReturnValue(null);
  });

  it("re-asks the unresolved last question and records clarification telemetry", () => {
    const session = createSession();
    session.last_question_asked = "limping_onset";
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 4,
      unresolved_question_ids: ["limping_onset"],
    };

    const result = orchestrateNextQuestion({
      session,
      incomingUnresolvedIds: ["limping_onset"],
      pendingQResolvedThisTurn: false,
      turnFocusSymptoms: [],
      visualEvidence: null,
    });

    expect(result.needsClarificationQuestionId).toBe("limping_onset");
    expect(result.nextQuestionId).toBe("limping_onset");
    expect(result.session.case_memory?.service_observations.at(-1)).toEqual(
      expect.objectContaining({
        stage: "pending_recovery",
        note: expect.stringContaining("reason=needs_clarification_re_ask"),
      })
    );
  });

  it("records repeat suppression when the selector repeats an answered question", () => {
    mockGetNextQuestionAvoidingRepeat.mockReturnValue("limping_onset");

    const session = createSession();
    session.last_question_asked = "limping_onset";
    session.answered_questions = ["limping_onset"];
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5,
      unresolved_question_ids: [],
    };

    const result = orchestrateNextQuestion({
      session,
      incomingUnresolvedIds: [],
      pendingQResolvedThisTurn: false,
      turnFocusSymptoms: ["limping"],
      visualEvidence: null,
    });

    expect(result.needsClarificationQuestionId).toBeNull();
    expect(result.nextQuestionId).toBe("limping_onset");
    expect(result.session.case_memory?.service_observations.at(-1)).toEqual(
      expect.objectContaining({
        stage: "repeat_suppression",
        note: expect.stringContaining(
          "reason=repeat_of_last_asked_question_suppressed"
        ),
      })
    );
  });

  it("updates visual evidence influence and evidence chain when the next question is image-led", () => {
    mockGetNextQuestionAvoidingRepeat.mockReturnValue("wound_size");

    const session = createSession();
    session.case_memory = {
      ...session.case_memory!,
      evidence_chain: [],
      visual_evidence: [
        {
          domain: "skin_wound",
          bodyRegion: "left hind leg",
          findings: ["raw lesion"],
          severity: "needs_review",
          confidence: 0.7,
          supportedSymptoms: ["wound_skin_issue"],
          contradictions: [],
          requiresConsult: false,
          limitations: [],
          influencedQuestionSelection: false,
        },
      ],
    };
    const visualEvidence = session.case_memory.visual_evidence[0];

    const result = orchestrateNextQuestion({
      session,
      incomingUnresolvedIds: [],
      pendingQResolvedThisTurn: false,
      turnFocusSymptoms: ["wound_skin_issue"],
      visualEvidence,
    });

    expect(result.visualEvidenceInfluencedQuestion).toBe(true);
    expect(result.session.latest_visual_evidence).toEqual(
      expect.objectContaining({
        influencedQuestionSelection: true,
      })
    );
    expect(result.session.case_memory?.visual_evidence.at(-1)).toEqual(
      expect.objectContaining({
        influencedQuestionSelection: true,
      })
    );
    expect(result.session.case_memory?.evidence_chain).toContain(
      "Visual evidence directly influenced next question: wound_size"
    );
  });
});
