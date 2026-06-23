import { createSession } from "@/lib/triage-engine";
import { orchestrateNextQuestion } from "@/lib/symptom-chat/next-question-orchestration";

const mockGetNextQuestionWithSource = jest.fn();
const mockDeriveBrainQuestionTrace = jest.fn();

jest.mock("@/lib/symptom-chat/answer-coercion", () => ({
  getNextQuestionWithSource: (...args: unknown[]) =>
    mockGetNextQuestionWithSource(...args),
  deriveBrainQuestionTrace: (...args: unknown[]) =>
    mockDeriveBrainQuestionTrace(...args),
}));

describe("orchestrateNextQuestion — Dog Brain priority wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNextQuestionWithSource.mockReturnValue({
      questionId: null,
      source: null,
    });
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

    expect(mockGetNextQuestionWithSource).toHaveBeenCalledWith(
      session,
      ["lethargy"],
      ["diarrhea"],
    );
  });

  it("Brain memory cannot override a pending-clarification re-ask (urgency/anchor safety)", () => {
    // The selector would return a Brain-driven question, but an unresolved
    // pending question must take priority and be re-asked instead.
    mockGetNextQuestionWithSource.mockReturnValue({
      questionId: "diarrhea_duration",
      source: "brain",
    });

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
    // Pending clarification wins ⇒ NO Brain trace, and the selector + trace
    // helper are never even consulted on a clarification turn.
    expect(result.brainQuestionTrace).toBeNull();
    expect(mockGetNextQuestionWithSource).not.toHaveBeenCalled();
    expect(mockDeriveBrainQuestionTrace).not.toHaveBeenCalled();
  });

  it("emits the brainQuestionTrace returned by the helper when Brain drove the question", () => {
    mockGetNextQuestionWithSource.mockReturnValue({
      questionId: "diarrhea_duration",
      source: "brain",
    });
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
    // Helper receives the selector's source + the evidence map + selected id —
    // no re-derivation of which branch won.
    expect(mockDeriveBrainQuestionTrace).toHaveBeenCalledWith(
      "brain",
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

    expect(mockGetNextQuestionWithSource).toHaveBeenCalledWith(
      session,
      ["lethargy"],
      [],
    );
  });
});
