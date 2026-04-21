import { createSession, recordAnswer } from "@/lib/triage-engine";
import {
  hasConversationStarted,
  hasEmergencyUsageGateBypassSignal,
} from "@/lib/symptom-chat/usage-limit-gate";

describe("usage-limit-gate helpers", () => {
  it("detects when a conversation is already in progress", () => {
    const untouchedSession = createSession();
    let activeSession = createSession();
    activeSession = recordAnswer(activeSession, "appetite", false);

    expect(hasConversationStarted(undefined)).toBe(false);
    expect(hasConversationStarted(untouchedSession)).toBe(false);
    expect(hasConversationStarted(activeSession)).toBe(true);
  });

  it("bypasses the gate for emergency language even before extraction runs", () => {
    const session = createSession();

    expect(
      hasEmergencyUsageGateBypassSignal(session, [
        { role: "user", content: "My dog is struggling to breathe." },
      ])
    ).toBe(true);
    expect(
      hasEmergencyUsageGateBypassSignal(session, [
        { role: "user", content: "My dog seems itchy today." },
      ])
    ).toBe(false);
    expect(
      hasEmergencyUsageGateBypassSignal(session, [
        {
          role: "user",
          content:
            "My dog keeps trying to vomit but nothing comes up and his belly looks swollen.",
        },
      ])
    ).toBe(true);
  });
});
