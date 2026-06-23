import { createSession } from "@/lib/triage-engine";
import { orchestrateNextQuestion } from "@/lib/symptom-chat/next-question-orchestration";

const mockGetNextQuestionAvoidingRepeat = jest.fn();
const mockDeriveBrainQuestionTrace = jest.fn();

jest.mock("@/lib/symptom-chat/answer-coercion", () => ({
  getNextQuestionAvoidingRepeat: (...args: unknown[]) =>
    mockGetNextQuestionAvoidingRepeat(...args),
  deriveBrainQuestionTrace: (...args: unknown[]) =>
    mockDeriveBrainQuestionTrace(...args),
}));

describe("orchestrateNextQuestion — Dog Brain priority wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNextQuestionAvoidingRepeat.mockReturnValue(null);
    mockDeriveBrainQuestionTrace.mockReturnValue(null);
  });

  it("forwards brainPrioritySymptoms to the selector as the third argument", () => {
    const session = createSession();
    session.known_symptoms = ["lethargy"];

    orchestrateNextQuestion({
      session,
      incomingUnresolvedIds: [],
      pendingQResolvedThisTurn: false,
      turnFocusSymptoms: ["lethargy"],
      visualEvidence: null,
      brainPrioritySymptoms: ["diarrhea"],
    });

    expect(mockGetNextQuestionAvoidingRepeat).toHaveBeenCalledWith(
      session,
      ["lethargy"],
      ["diarrhea"],
    );
  });

  it("Brain memory cannot override a pending-clarification re-ask (urgency/anchor safety)", () => {
    // The selector would return a Brain-driven question, but an unresolved
    // pending question must take priority and be re-asked instead.
    mockGetNextQuestionAvoidingRepeat.mockReturnValue("diarrhea_duration");

    const session = createSession();
    session.last_question_asked = "breathing_effort";
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 3,
      unresolved_question_ids: ["breathing_effort"],
    };

    const result = orchestrateNextQuestion({
      session,
      incomingUnresolvedIds: ["breathing_effort"],
      pendingQResolvedThisTurn: false,
      turnFocusSymptoms: [],
      visualEvidence: null,
      brainPrioritySymptoms: ["diarrhea"],
    });

    expect(result.needsClarificationQuestionId).toBe("breathing_effort");
    expect(result.nextQuestionId).toBe("breathing_effort");
    // Pending clarification wins ⇒ NO Brain trace, and the trace helper is never
    // even consulted on a clarification turn.
    expect(result.brainQuestionTrace).toBeNull();
    expect(mockDeriveBrainQuestionTrace).not.toHaveBeenCalled();
  });

  it("emits the brainQuestionTrace returned by the helper when Brain drove the question", () => {
    mockGetNextQuestionAvoidingRepeat.mockReturnValue("diarrhea_duration");
    const trace = {
      source: "dog_brain" as const,
      signal_type: "stool_change" as const,
      selected_symptom_key: "diarrhea",
      selected_question_id: "diarrhea_duration",
      evidence_summary: "The latest log shows a stool change.",
      safety_note: "Supportive context only; not a diagnosis.",
    };
    mockDeriveBrainQuestionTrace.mockReturnValue(trace);

    const session = createSession();
    session.known_symptoms = [];

    const result = orchestrateNextQuestion({
      session,
      incomingUnresolvedIds: [],
      pendingQResolvedThisTurn: false,
      turnFocusSymptoms: [],
      visualEvidence: null,
      brainPrioritySymptoms: ["diarrhea"],
      brainPrioritySymptomEvidence: {
        diarrhea: {
          signal_type: "stool_change",
          evidence_summary: "The latest log shows a stool change.",
        },
      },
    });

    expect(result.brainQuestionTrace).toEqual(trace);
    // Helper receives the actually-selected question id + the evidence map.
    expect(mockDeriveBrainQuestionTrace).toHaveBeenCalledWith(
      session,
      [],
      ["diarrhea"],
      {
        diarrhea: {
          signal_type: "stool_change",
          evidence_summary: "The latest log shows a stool change.",
        },
      },
      "diarrhea_duration",
    );
  });

  it("defaults to no Brain preference when the field is omitted (backward compatible)", () => {
    const session = createSession();
    session.known_symptoms = ["lethargy"];

    orchestrateNextQuestion({
      session,
      incomingUnresolvedIds: [],
      pendingQResolvedThisTurn: false,
      turnFocusSymptoms: ["lethargy"],
      visualEvidence: null,
    });

    expect(mockGetNextQuestionAvoidingRepeat).toHaveBeenCalledWith(
      session,
      ["lethargy"],
      [],
    );
  });
});
