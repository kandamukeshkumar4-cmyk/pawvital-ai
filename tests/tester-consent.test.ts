import {
  TESTER_CONSENT_STORAGE_KEY,
  TESTER_CONSENT_VERSION,
  getTesterConsent,
  hasTesterConsent,
  recordTesterConsent,
  requiresTesterConsent,
} from "@/lib/tester-consent";

describe("tester-consent helpers", () => {
  it("requires consent for symptom-checker routes only", () => {
    expect(requiresTesterConsent("/symptom-checker")).toBe(true);
    expect(requiresTesterConsent("/symptom-checker/history")).toBe(true);
    expect(requiresTesterConsent("/dashboard")).toBe(false);
    expect(requiresTesterConsent(undefined)).toBe(false);
  });

  it("records and reads a versioned consent record for a user", () => {
    const storage = {
      value: null as string | null,
      getItem(key: string) {
        return key === TESTER_CONSENT_STORAGE_KEY ? this.value : null;
      },
      setItem(key: string, value: string) {
        if (key === TESTER_CONSENT_STORAGE_KEY) {
          this.value = value;
        }
      },
    };

    const now = new Date("2026-04-20T14:30:00.000Z");
    const record = recordTesterConsent("user-123", storage, now);

    expect(record).toEqual({
      acceptedAt: now.toISOString(),
      subjectId: "user:user-123",
      userId: "user-123",
      version: TESTER_CONSENT_VERSION,
    });
    expect(hasTesterConsent("user-123", storage)).toBe(true);
    expect(getTesterConsent("user-123", storage)).toEqual(record);
  });

  it("ignores stale consent versions", () => {
    const storage = {
      getItem() {
        return JSON.stringify({
          "user:user-123": {
            acceptedAt: "2026-04-19T00:00:00.000Z",
            subjectId: "user:user-123",
            userId: "user-123",
            version: "stale-version",
          },
        });
      },
    };

    expect(getTesterConsent("user-123", storage)).toBeNull();
    expect(hasTesterConsent("user-123", storage)).toBe(false);
  });
});
