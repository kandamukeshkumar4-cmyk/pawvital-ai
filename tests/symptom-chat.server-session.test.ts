describe("symptom-chat server sessions", () => {
  const pet = {
    name: "Bruno",
    breed: "Golden Retriever",
    age_years: 5,
    weight: 72,
    species: "dog",
  };

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
    };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.SYMPTOM_CHAT_SESSION_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("creates, persists, and reloads a signed server-owned session", async () => {
    const {
      createSymptomChatStoredSession,
      persistSymptomChatStoredSession,
      readSymptomChatStoredSession,
    } = await import("@/lib/symptom-chat/server-session");

    const created = await createSymptomChatStoredSession(pet);
    expect(created.sessionHandle).toMatch(/^v1\./);

    const initialLoad = await readSymptomChatStoredSession(created.sessionHandle);
    expect(initialLoad?.record.pet.name).toBe("Bruno");

    if (!initialLoad) {
      throw new Error("expected stored session to load");
    }

    initialLoad.record.session.known_symptoms = ["limping"];
    initialLoad.record.messages = [
      { role: "user", content: "My dog is limping." },
      { role: "assistant", content: "Which leg is affected?" },
    ];

    await persistSymptomChatStoredSession(
      initialLoad.sessionId,
      initialLoad.record
    );

    const reloaded = await readSymptomChatStoredSession(created.sessionHandle);
    expect(reloaded?.record.session.known_symptoms).toEqual(["limping"]);
    expect(reloaded?.record.messages).toEqual([
      { role: "user", content: "My dog is limping." },
      { role: "assistant", content: "Which leg is affected?" },
    ]);
  });

  it("rejects tampered session handles", async () => {
    const {
      createSymptomChatStoredSession,
      readSymptomChatStoredSession,
    } = await import("@/lib/symptom-chat/server-session");

    const created = await createSymptomChatStoredSession(pet);
    const tamperedHandle = `${created.sessionHandle}tampered`;

    await expect(
      readSymptomChatStoredSession(tamperedHandle)
    ).resolves.toBeNull();
  });
});
