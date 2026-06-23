/**
 * Direct unit tests for runDogBrainLoopAfterHealthLog.
 * Uses minimal fake Supabase (no setRecentLogsForLoop side-channel).
 * Covers the 4 contract cases exactly.
 */

import { runDogBrainLoopAfterHealthLog } from "@/lib/dog-brain/run-brain-loop";

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => Promise.resolve(fakeSupabase),
}));

type DbRow = Record<string, unknown>;
type FakeSupabase = { from: (table: string) => DbRow };
type TestGlobal = typeof globalThis & {
  __simulate23505?: boolean;
  __simulateFollowupsTableMissing?: boolean;
};

let fakeSupabase: FakeSupabase;
let capturedFollowupInserts: DbRow[];
let existingPending: DbRow | null;

function resetFake() {
  capturedFollowupInserts = [];
  existingPending = null;

  const makeChain = (table: string) => {
    if (table === "pets") {
      return {
        select: () => makeChain(table),
        eq: () => makeChain(table),
        maybeSingle: async () => ({ data: { id: "pet-1" }, error: null }),
      };
    }
    if (table === "daily_health_logs") {
      return {
        select: () => makeChain(table),
        eq: () => makeChain(table),
        order: () => makeChain(table),
        limit: async () => ({ data: currentLogs, error: null }),
      };
    }
    if (table === "dog_brain_followups") {
      const missingErr = () => ({
        data: null,
        error: {
          code: "42P01",
          message: "relation dog_brain_followups does not exist",
        },
      });
      return {
        select: () => makeChain(table),
        eq: () => makeChain(table),
        maybeSingle: async () =>
          (globalThis as TestGlobal).__simulateFollowupsTableMissing
            ? missingErr()
            : { data: existingPending, error: null },
        insert: (row: DbRow) => {
          capturedFollowupInserts.push(row);
          return {
            select: () => ({
              maybeSingle: async () => {
                if ((globalThis as TestGlobal).__simulateFollowupsTableMissing) {
                  return missingErr();
                }
                // simulate 23505 by caller if needed; here return success unless flag
                if ((globalThis as TestGlobal).__simulate23505) {
                  const err = new Error("duplicate") as Error & { code?: string };
                  err.code = "23505";
                  return { data: null, error: err };
                }
                return { data: { id: "fu-" + capturedFollowupInserts.length, signal_key: row.signal_key, status: "pending" }, error: null };
              },
            }),
          };
        },
      };
    }
    return { select: () => ({}), eq: () => ({}), insert: () => ({}) };
  };

  fakeSupabase = {
    from: (table: string) => makeChain(table),
  };
}

let currentLogs: DbRow[] = [];

beforeEach(() => {
  resetFake();
  (globalThis as TestGlobal).__simulate23505 = false;
  (globalThis as TestGlobal).__simulateFollowupsTableMissing = false;
  currentLogs = [];
});

describe("runDogBrainLoopAfterHealthLog (direct)", () => {
  it("abnormal (diarrhea log) creates follow-up for stool_change", async () => {
    currentLogs = [
      { log_date: "2026-06-20", stool: "diarrhea", appetite: "normal", water: "normal", urination: "normal", vomiting_count: 0, energy: "normal", meds_given: false, context_signals: null },
    ];

    const res = await runDogBrainLoopAfterHealthLog("user-1", "pet-1");

    expect(res.createdFollowups.length).toBeGreaterThanOrEqual(1);
    expect(res.createdFollowups[0].signal_key).toBe("stool_change");
    expect(res.errors.length).toBe(0);
    expect(capturedFollowupInserts.length).toBeGreaterThanOrEqual(1);
    expect(capturedFollowupInserts[0].signal_key).toBe("stool_change");
  });

  it("normal logs create no follow-ups", async () => {
    currentLogs = [
      { log_date: "2026-06-20", stool: "normal", appetite: "normal", water: "normal", urination: "normal", vomiting_count: 0, energy: "normal", meds_given: false, context_signals: null },
    ];

    const res = await runDogBrainLoopAfterHealthLog("user-1", "pet-1");

    expect(res.createdFollowups.length).toBe(0);
    expect(res.dedupedFollowups.length).toBe(0);
    // summary may still be present, but no creation
  });

  it("duplicate pending is deduped (no double insert)", async () => {
    // Use a log that produces a watch/alert signal (diarrhea -> stool_change watch)
    currentLogs = [
      { log_date: "2026-06-19", stool: "diarrhea", appetite: "normal", water: "normal", urination: "normal", vomiting_count: 0, energy: "normal", meds_given: false, context_signals: null },
    ];
    existingPending = { id: "existing", signal_key: "stool_change", status: "pending" };

    const res = await runDogBrainLoopAfterHealthLog("user-1", "pet-1");

    expect(res.dedupedFollowups.length).toBeGreaterThanOrEqual(1);
    expect(res.createdFollowups.length).toBe(0);
    // no new insert attempted because pre-check returned existing
    const stoolInserts = capturedFollowupInserts.filter((r) => r.signal_key === "stool_change");
    expect(stoolInserts.length).toBe(0);
  });

  it("loop errors are collected, function does not throw", async () => {
    // Make loadRecentLogs fail by reassigning the closed-over fakeSupabase to one whose daily select rejects
    const bad = {
      from: (table: string) => {
        if (table === "daily_health_logs") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => { throw new Error("load fail injected"); } }) }) }) }),
          };
        }
        if (table === "pets") {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "p" } }) }) }) }) };
        }
        return {};
      },
    };
    fakeSupabase = bad;

    const res = await runDogBrainLoopAfterHealthLog("user-1", "pet-1");

    expect(res.errors.length).toBeGreaterThan(0);
    // strict: the exact injected message is collected
    expect(res.errors[0].message).toBe("load fail injected");
  });

  it("missing dog_brain_followups table is reported as error, not mislabeled as dedupe (PROOF #11)", async () => {
    currentLogs = [
      { log_date: "2026-06-20", stool: "diarrhea", appetite: "normal", water: "normal", urination: "normal", vomiting_count: 0, energy: "normal", meds_given: false, context_signals: null },
    ];
    (globalThis as TestGlobal).__simulateFollowupsTableMissing = true;

    const res = await runDogBrainLoopAfterHealthLog("user-1", "pet-1");

    // Persistence failure (missing table) must be an honest nonfatal error,
    // never hidden as a successful dedupe.
    expect(res.errors.length).toBeGreaterThanOrEqual(1);
    expect(res.dedupedFollowups.length).toBe(0);
    expect(res.createdFollowups.length).toBe(0);
    // No insert should have been attempted once the pre-check returned the error.
    expect(capturedFollowupInserts.length).toBe(0);
    // Sanity: the signal was still detected (loop is honest about what it saw);
    // only the persistence path failed.
    expect(res.signals.length).toBeGreaterThanOrEqual(1);
  });
});
