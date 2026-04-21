import {
  createOrGetSession,
  deleteSession,
  getSession,
  updateSession,
} from "@/lib/session-store";

const RETIRED_PAYLOAD = {
  error: "The legacy triage proxy endpoint has been retired.",
  code: "LEGACY_TRIAGE_ENDPOINT_DISABLED",
  message: "Use /api/ai/symptom-chat for active symptom-check conversations.",
} as const;

const SEEDED_SESSION_ID = "legacy-route-existing-session";
const HOSTILE_SESSION_ID = "legacy-route-attacker-session";
const SECRET_NOTE = "owner-secret-note";

describe("legacy triage proxy route", () => {
  afterEach(() => {
    deleteSession(SEEDED_SESSION_ID);
    deleteSession(HOSTILE_SESSION_ID);
    jest.resetModules();
  });

  it("returns 410 for GET requests", async () => {
    const { GET } = await import("@/app/api/triage/next/route");
    const response = await GET(
      new Request("https://pawvital.test/api/triage/next")
    );
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual(RETIRED_PAYLOAD);
  });

  it("returns 410 for POST requests", async () => {
    const { POST } = await import("@/app/api/triage/next/route");
    const response = await POST(
      new Request("https://pawvital.test/api/triage/next", { method: "POST" })
    );
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual(RETIRED_PAYLOAD);
  });

  it("ignores hostile headers, attacker session ids, and seeded session data", async () => {
    const seededConversationHistory = [
      { role: "user" as const, content: SECRET_NOTE },
      { role: "assistant" as const, content: "internal-triage-state" },
    ];

    createOrGetSession(SEEDED_SESSION_ID, {
      name: "Scout",
      breed: "Mixed Breed",
      age_years: 5,
      weight: 24,
    });
    updateSession(SEEDED_SESSION_ID, {
      conversationHistory: seededConversationHistory,
    });

    const originalSession = getSession(SEEDED_SESSION_ID);
    expect(originalSession).not.toBeNull();
    const originalLastActiveAt = originalSession!.lastActiveAt;

    const { POST } = await import("@/app/api/triage/next/route");
    const response = await POST(
      new Request("https://pawvital.test/api/triage/next", {
        method: "POST",
        headers: {
          host: "attacker.example",
          origin: "https://attacker.example",
          referer: "https://attacker.example/phish",
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
          "x-session-id": HOSTILE_SESSION_ID,
          cookie: `legacySessionId=${HOSTILE_SESSION_ID}; trustedSessionId=${SEEDED_SESSION_ID}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId: HOSTILE_SESSION_ID,
          petProfile: {
            name: "Scout",
            breed: "Mixed Breed",
            age_years: 5,
            weight: 24,
          },
          conversationHistory: seededConversationHistory,
        }),
      })
    );
    const payload = await response.json();
    const serializedPayload = JSON.stringify(payload);

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(payload).toEqual(RETIRED_PAYLOAD);

    expect(serializedPayload).not.toContain("attacker.example");
    expect(serializedPayload).not.toContain(HOSTILE_SESSION_ID);
    expect(serializedPayload).not.toContain(SEEDED_SESSION_ID);
    expect(serializedPayload).not.toContain(SECRET_NOTE);
    expect(serializedPayload).not.toContain("internal-triage-state");

    expect(getSession(HOSTILE_SESSION_ID)).toBeNull();
    expect(getSession(SEEDED_SESSION_ID)?.conversationHistory).toEqual(
      seededConversationHistory
    );
    expect(getSession(SEEDED_SESSION_ID)?.lastActiveAt).toBe(originalLastActiveAt);
  });
});
