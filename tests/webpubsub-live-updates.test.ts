import { parseTriageLiveUpdate } from "@/components/symptom-checker/use-webpubsub-live-updates";

describe("parseTriageLiveUpdate", () => {
  it("accepts metadata-only triage update JSON", () => {
    expect(
      parseTriageLiveUpdate(
        JSON.stringify({
          action: "chat",
          generatedAt: "2026-05-29T18:00:00.000Z",
          sessionId: "session-1",
          status: "response_ready",
          type: "triage_update",
        }),
      ),
    ).toEqual({
      action: "chat",
      generatedAt: "2026-05-29T18:00:00.000Z",
      sessionId: "session-1",
      status: "response_ready",
      type: "triage_update",
    });
  });

  it("rejects malformed or non-triage messages", () => {
    expect(parseTriageLiveUpdate("{")).toBeNull();
    expect(parseTriageLiveUpdate({ type: "chat_message" })).toBeNull();
    expect(
      parseTriageLiveUpdate({
        action: "chat",
        generatedAt: "2026-05-29T18:00:00.000Z",
        rawSymptoms: "vomiting blood",
        sessionId: "session-1",
        status: "response_ready",
        type: "triage_update",
      }),
    ).toBeNull();
  });
});
