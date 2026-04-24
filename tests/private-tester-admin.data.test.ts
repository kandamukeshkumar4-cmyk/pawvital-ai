const mockCreateClient = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

type CountResult = { count: number | null; error: { code?: string; message?: string } | null };
type DataResult<T> = { data: T; error: { code?: string; message?: string } | null };

function buildMockSupabase(input?: {
  journalEntriesError?: { code?: string; message?: string };
}) {
  const currentUser = {
    app_metadata: {} as Record<string, unknown>,
    banned_until: null as string | null,
  };
  const countResult = (
    count: number | null,
    error: { code?: string; message?: string } | null = null,
  ): CountResult => ({ count, error });
  const dataResult = <T>(
    data: T,
    error: { code?: string; message?: string } | null = null,
  ): DataResult<T> => ({ data, error });

  return {
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({
          data: {
            user: currentUser,
          },
          error: null,
        })),
        updateUserById: jest.fn(async (_id: string, payload: { app_metadata?: Record<string, unknown>; ban_duration?: string }) => {
          currentUser.app_metadata = payload.app_metadata ?? currentUser.app_metadata;
          currentUser.banned_until =
            payload.ban_duration === "none"
              ? null
              : payload.ban_duration
                ? new Date(Date.now() + 60_000).toISOString()
                : currentUser.banned_until;
          return {
            data: { user: { id: "user-1" } },
            error: null,
          };
        }),
      },
    },
    from(table: string) {
      return {
        select() {
          return {
            eq: () => {
              if (table === "profiles") {
                return {
                  maybeSingle: async () =>
                    dataResult({
                      id: "user-1",
                      email: "tester@example.com",
                      full_name: "Tester",
                    }),
                };
              }

              if (table === "pets") {
                return dataResult([
                  { id: "pet-1", name: "Buddy" },
                ]);
              }

              if (table === "journal_entries") {
                return countResult(null, {
                  code: input?.journalEntriesError?.code ?? "42P01",
                  message:
                    input?.journalEntriesError?.message ??
                    'relation "journal_entries" does not exist',
                });
              }

              if (table === "notifications" || table === "subscriptions") {
                return countResult(0);
              }

              return dataResult(null);
            },
            in: () => {
              if (table === "symptom_checks") {
                return dataResult([]);
              }

              return countResult(0);
            },
          };
        },
      };
    },
  };
}

describe("private tester admin data helpers", () => {
  const envSnapshot = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    mockCreateClient.mockReturnValue(buildMockSupabase());
  });

  afterAll(() => {
    if (envSnapshot.NEXT_PUBLIC_SUPABASE_URL === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = envSnapshot.NEXT_PUBLIC_SUPABASE_URL;
    }

    if (envSnapshot.SUPABASE_SERVICE_ROLE_KEY === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = envSnapshot.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it.each([
    [
      "missing optional tables",
      {
        code: "42P01",
        message: 'relation "journal_entries" does not exist',
      },
    ],
    [
      "missing optional count columns",
      {
        code: "42703",
        message: 'column journal_entries.user_id does not exist',
      },
    ],
  ])(
    "treats %s as zero counts during admin mutations",
    async (_label, journalEntriesError) => {
      mockCreateClient.mockReturnValue(
        buildMockSupabase({ journalEntriesError })
      );

      const { updatePrivateTesterAdminState } = await import(
        "@/lib/private-tester-admin"
      );

      const summary = await updatePrivateTesterAdminState({
        action: "mark_deletion",
        actorEmail: "admin@pawvital.ai",
        email: "tester@example.com",
      });

      expect(summary.user).toEqual({
        email: "tester@example.com",
        fullName: "Tester",
        id: "user-1",
      });
      expect(summary.adminState.deletionRequested).toBe(true);
      expect(summary.counts).toMatchObject({
        journalEntries: 0,
        notifications: 0,
        pets: 1,
        subscriptions: 0,
        symptomChecks: 0,
      });
    }
  );
});
