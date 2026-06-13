import {
  getConfiguredTurnDepth,
  resolveTurnDepth,
  shouldRunMiniMaxCompression,
  shouldRunNemotronQuestionGate,
  shouldRunNemotronQuestionVerify,
} from "@/lib/symptom-chat/turn-depth";

describe("turn-depth policy", () => {
  const originalDepth = process.env.SYMPTOM_CHAT_TURN_DEPTH;

  afterEach(() => {
    if (originalDepth === undefined) {
      delete process.env.SYMPTOM_CHAT_TURN_DEPTH;
    } else {
      process.env.SYMPTOM_CHAT_TURN_DEPTH = originalDepth;
    }
  });

  it("defaults to standard depth for plain text turns", () => {
    delete process.env.SYMPTOM_CHAT_TURN_DEPTH;
    expect(getConfiguredTurnDepth()).toBe("standard");
    expect(
      resolveTurnDepth({
        hasImage: false,
        redFlagsTriggered: false,
        isReportTurn: false,
        isEmergencyEscalation: false,
      })
    ).toBe("standard");
  });

  it("uses deep depth when an image is present", () => {
    expect(
      resolveTurnDepth({
        hasImage: true,
        redFlagsTriggered: false,
        isReportTurn: false,
        isEmergencyEscalation: false,
      })
    ).toBe("deep");
  });

  it("forces deep depth when SYMPTOM_CHAT_TURN_DEPTH=deep", () => {
    process.env.SYMPTOM_CHAT_TURN_DEPTH = "deep";
    expect(
      resolveTurnDepth({
        hasImage: false,
        redFlagsTriggered: false,
        isReportTurn: false,
        isEmergencyEscalation: false,
      })
    ).toBe("deep");
  });

  it("skips optional model stages on standard depth", () => {
    expect(shouldRunNemotronQuestionGate("standard")).toBe(false);
    expect(shouldRunNemotronQuestionVerify("standard")).toBe(false);
    expect(shouldRunMiniMaxCompression("standard")).toBe(false);
    expect(shouldRunNemotronQuestionGate("deep")).toBe(true);
    expect(shouldRunNemotronQuestionVerify("deep")).toBe(true);
    expect(shouldRunMiniMaxCompression("deep")).toBe(true);
  });
});
