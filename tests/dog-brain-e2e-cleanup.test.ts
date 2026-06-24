/**
 * Phase 1 — live-E2E harness crash-safe cleanup.
 *
 * Proves the seed/cleanup contract WITHOUT any network or browser: a seed that
 * throws after the auth user is created still records the user id in the tracker,
 * so the finally-block cleanup deletes it (no orphaned auth user). Uses a fake
 * Supabase admin — the real `main()` is guarded by JEST_WORKER_ID and never runs.
 */
import {
  seed,
  cleanup,
  buildLogRows,
  type SeedTracker,
} from "./e2e/dog-brain-live-e2e";

type Deleted = { table: string; col: string; val: string };

function makeAdmin(opts: {
  createUserError?: boolean;
  petInsertError?: boolean;
  logInsertError?: boolean;
  residual?: Record<string, number>;
} = {}) {
  const deleted: Deleted[] = [];
  const deletedUsers: string[] = [];

  const from = (table: string) => ({
    upsert: async () => ({ error: null }),
    insert: (_rows: unknown) => {
      const awaited = {
        error: opts.logInsertError && table !== "pets" ? { message: "log boom" } : null,
      };
      return {
        select: (_c: string) => ({
          single: async () => ({
            data: opts.petInsertError ? null : { id: "pet-1" },
            error: opts.petInsertError ? { message: "pet boom" } : null,
          }),
        }),
        // makes `await admin.from(t).insert(rows)` resolve for non-pet tables
        then: (resolve: (v: unknown) => void) => resolve(awaited),
      };
    },
    delete: () => ({
      eq: async (col: string, val: string) => {
        deleted.push({ table, col, val });
        return { error: null };
      },
    }),
    select: (_c: string, _o?: unknown) => ({
      eq: async () => ({ count: opts.residual?.[table] ?? 0 }),
    }),
  });

  const admin = {
    from,
    auth: {
      admin: {
        createUser: async () => ({
          data: { user: opts.createUserError ? null : { id: "user-1" } },
          error: opts.createUserError ? { message: "createUser boom" } : null,
        }),
        deleteUser: async (id: string) => {
          deletedUsers.push(id);
          return { error: null };
        },
      },
    },
  };
  // The harness types admin as SupabaseClient; this fake satisfies the calls used.
  return { admin: admin as never, deleted, deletedUsers };
}

describe("live-E2E seed/cleanup — crash safety", () => {
  it("records the auth user id BEFORE the pet insert, so a mid-seed failure can still clean it up", async () => {
    const { admin, deleted, deletedUsers } = makeAdmin({ petInsertError: true });
    const tracker: SeedTracker = {};

    await expect(seed(admin, "sandbox@example.test", "pw", tracker)).rejects.toThrow(
      /pet insert/,
    );
    // The user was created → tracker has it; the pet never was.
    expect(tracker.userId).toBe("user-1");
    expect(tracker.petId).toBeUndefined();

    // Cleanup from the partial tracker must delete the orphaned user and NOT
    // attempt any pet-row deletes (there is no pet).
    await cleanup(admin, tracker);
    expect(deletedUsers).toEqual(["user-1"]);
    expect(deleted).toHaveLength(0);
  });

  it("a createUser failure leaves the tracker empty and cleanup is a no-op", async () => {
    const { admin, deleted, deletedUsers } = makeAdmin({ createUserError: true });
    const tracker: SeedTracker = {};
    await expect(seed(admin, "s@example.test", "pw", tracker)).rejects.toThrow(
      /createUser/,
    );
    expect(tracker.userId).toBeUndefined();
    await cleanup(admin, tracker); // safe to call with an empty tracker
    expect(deletedUsers).toHaveLength(0);
    expect(deleted).toHaveLength(0);
  });

  it("a full seed populates both ids and cleanup deletes every table + the user", async () => {
    const { admin, deleted, deletedUsers } = makeAdmin();
    const tracker: SeedTracker = {};
    const res = await seed(admin, "s@example.test", "pw", tracker);
    expect(res).toEqual({ userId: "user-1", petId: "pet-1" });
    expect(tracker).toEqual({ userId: "user-1", petId: "pet-1" });

    await cleanup(admin, tracker);
    expect(deletedUsers).toEqual(["user-1"]);
    expect(deleted.map((d) => d.table)).toEqual([
      "dog_brain_supplement_trials",
      "dog_brain_followups",
      "daily_health_logs",
      "pets",
    ]);
  });

  it("fails loudly if a residual row remains after cleanup", async () => {
    const { admin } = makeAdmin({ residual: { daily_health_logs: 2 } });
    const tracker: SeedTracker = { userId: "user-1", petId: "pet-1" };
    await expect(cleanup(admin, tracker)).rejects.toThrow(/CLEANUP FAILED/);
  });
});

describe("buildLogRows — seed spans a real 90-day window", () => {
  it("produces one row per day across the full 0..90 day span", () => {
    const rows = buildLogRows("u", "p");
    expect(rows).toHaveLength(91); // days 90..0 inclusive
    const dates = rows.map((r) => r.log_date as string);
    expect(new Set(dates).size).toBe(91); // all distinct calendar days
  });
});
