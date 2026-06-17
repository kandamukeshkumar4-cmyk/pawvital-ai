import { parseTriageLiveUpdate } from "@/components/symptom-checker/use-webpubsub-live-updates";

const LIVE_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("parseTriageLiveUpdate", () => {
  it("accepts metadata-only triage update JSON", () => {
    expect(
      parseTriageLiveUpdate(
        JSON.stringify({
          action: "chat",
          generatedAt: "2026-05-29T18:00:00.000Z",
          sessionId: LIVE_SESSION_ID,
          status: "response_ready",
          type: "triage_update",
        }),
      ),
    ).toEqual({
      action: "chat",
      generatedAt: "2026-05-29T18:00:00.000Z",
      sessionId: LIVE_SESSION_ID,
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
        sessionId: "owner-name-or-free-text",
        status: "response_ready",
        type: "triage_update",
      }),
    ).toBeNull();
    expect(
      parseTriageLiveUpdate({
        action: "chat",
        generatedAt: "2026-05-29T18:00:00.000Z",
        rawSymptoms: "vomiting blood",
        sessionId: LIVE_SESSION_ID,
        status: "response_ready",
        type: "triage_update",
      }),
    ).toBeNull();
  });
});
