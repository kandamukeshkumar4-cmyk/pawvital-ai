import {
  TESTER_ACKNOWLEDGEMENT_STORAGE_KEY,
  TESTER_ACKNOWLEDGEMENT_VERSION,
  getTesterAcknowledgement,
  hasTesterAcknowledgement,
  recordTesterAcknowledgement,
} from "@/lib/tester-acknowledgement";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    length: 0,
    clear: () => {
      values.clear();
    },
    getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } as Storage;
}

describe("tester acknowledgement storage", () => {
  it("stores separate versioned acknowledgements for signed-in and anonymous testers", () => {
    const storage = createMemoryStorage();
    const userRecord = recordTesterAcknowledgement(
      "user-123",
      storage,
      new Date("2026-04-20T12:00:00.000Z")
    );
    const anonymousRecord = recordTesterAcknowledgement(
      null,
      storage,
      new Date("2026-04-20T12:05:00.000Z")
    );

    expect(userRecord).toEqual({
      acceptedAt: "2026-04-20T12:00:00.000Z",
      subjectId: "user:user-123",
      userId: "user-123",
      version: TESTER_ACKNOWLEDGEMENT_VERSION,
    });
    expect(hasTesterAcknowledgement("user-123", storage)).toBe(true);
    expect(getTesterAcknowledgement("user-123", storage)).toEqual(userRecord);
    expect(hasTesterAcknowledgement(undefined, storage)).toBe(true);
    expect(getTesterAcknowledgement(undefined, storage)).toEqual(
      anonymousRecord
    );
  });

  it("ignores stale acknowledgement versions and asks the tester again", () => {
    const storage = createMemoryStorage();

    storage.setItem(
      TESTER_ACKNOWLEDGEMENT_STORAGE_KEY,
      JSON.stringify({
        "user:user-123": {
          acceptedAt: "2026-04-19T10:00:00.000Z",
          subjectId: "user:user-123",
          userId: "user-123",
          version: "older-version",
        },
      })
    );

    expect(hasTesterAcknowledgement("user-123", storage)).toBe(false);
    expect(getTesterAcknowledgement("user-123", storage)).toBeNull();
  });
});
