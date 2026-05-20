/**
 * VET-1512C — Persistence chain tests
 *
 * saveTriageSession is a pure async function (not a hook) — fully unit-testable.
 *
 * savePet is a React hook (useCallback inside usePets) — its throw behavior is
 * verified by the pet-profile-modal error state in UI and by integration testing.
 * The structural change (removed silent fallback) is visible in the diff.
 */

const mockInsert = jest.fn();
const mockFrom = jest.fn(() => ({ insert: mockInsert }));
const mockGetUser = jest.fn();
const mockCreateClient = jest.fn(() => ({
  auth: { getUser: mockGetUser },
  from: mockFrom,
}));

jest.mock("@/lib/supabase", () => ({
  createClient: () => mockCreateClient(),
  isSupabaseConfigured: true,
}));

describe("saveTriageSession persistence (VET-1512C)", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockInsert.mockResolvedValue({ error: null });
  });

  afterAll(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("skips DB write and logs a warning when petId is empty string", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase", () => ({
      createClient: () => mockCreateClient(),
      isSupabaseConfigured: true,
    }));

    const { saveTriageSession } = await import("@/hooks/useSupabase");
    await saveTriageSession("", "vomiting", "{}", "medium", "vet_48h");

    expect(mockInsert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("petId is missing")
    );
  });

  it("skips DB write and logs a warning when user is unauthenticated", async () => {
    jest.resetModules();
    const localGetUser = jest.fn().mockResolvedValue({ data: { user: null } });
    const localInsert = jest.fn();
    jest.doMock("@/lib/supabase", () => ({
      createClient: () => ({
        auth: { getUser: localGetUser },
        from: jest.fn(() => ({ insert: localInsert })),
      }),
      isSupabaseConfigured: true,
    }));

    const { saveTriageSession } = await import("@/hooks/useSupabase");
    await saveTriageSession("pet-123", "vomiting", "{}", "medium", "vet_48h");

    expect(localInsert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No authenticated user")
    );
  });

  it("inserts ai_response into symptom_checks with correct fields", async () => {
    jest.resetModules();
    const localInsert = jest.fn().mockResolvedValue({ error: null });
    jest.doMock("@/lib/supabase", () => ({
      createClient: () => ({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
        },
        from: jest.fn(() => ({ insert: localInsert })),
      }),
      isSupabaseConfigured: true,
    }));

    const { saveTriageSession } = await import("@/hooks/useSupabase");
    await saveTriageSession(
      "pet-abc",
      "limping; not eating",
      '{"severity":"high","recommendation":"vet_24h"}',
      "high",
      "vet_24h"
    );

    expect(localInsert).toHaveBeenCalledWith({
      pet_id: "pet-abc",
      symptoms: "limping; not eating",
      ai_response: '{"severity":"high","recommendation":"vet_24h"}',
      severity: "high",
      recommendation: "vet_24h",
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs the DB error but does not throw (non-blocking path)", async () => {
    jest.resetModules();
    const dbError = { message: "violates foreign key constraint", code: "23503" };
    jest.doMock("@/lib/supabase", () => ({
      createClient: () => ({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
        },
        from: jest.fn(() => ({
          insert: jest.fn().mockResolvedValue({ error: dbError }),
        })),
      }),
      isSupabaseConfigured: true,
    }));

    const { saveTriageSession } = await import("@/hooks/useSupabase");

    await expect(
      saveTriageSession("pet-abc", "limping", "{}", "low", "monitor")
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[saveTriageSession] DB insert failed:"),
      expect.objectContaining({ message: "violates foreign key constraint" })
    );
  });

  it("returns void immediately in demo mode without touching the DB", async () => {
    jest.resetModules();
    const localClient = jest.fn();
    jest.doMock("@/lib/supabase", () => ({
      createClient: localClient,
      isSupabaseConfigured: false,
    }));

    const { saveTriageSession } = await import("@/hooks/useSupabase");
    await expect(
      saveTriageSession("pet-abc", "coughing", "{}", "low", "monitor")
    ).resolves.toBeUndefined();

    expect(localClient).not.toHaveBeenCalled();
  });
});
