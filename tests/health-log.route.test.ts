/**
 * Route-level tests for /api/health-log POST — exercising the ACTUAL handler
 * (real zod validation + the missing-column retry), with Supabase + rate-limit
 * mocked. Covers:
 *  - every context_signals pack is accepted by the real route schema (201)
 *  - a missing context_signals column retries WITHOUT the field (core save survives)
 *  - photo_urls persists when context_signals is absent
 */

import { jest } from "@jest/globals";

const mockCheckRateLimit = jest.fn<() => Promise<{ success: boolean; reset: number }>>();
const mockCreateServerSupabaseClient = jest.fn<() => Promise<unknown>>();

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: () => mockCheckRateLimit(),
  getRateLimitId: () => "test:rate-id",
}));

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

type UpsertResult = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Build a Supabase mock. `pets` resolves ownership; `daily_health_logs` records
 * each upsert row and returns the configured results in order (so we can force a
 * missing-column error on the first call and success on the retry).
 */
function buildSupabase(upsertResults: UpsertResult[]) {
  const upsertRows: Record<string, unknown>[] = [];
  let idx = 0;

  const petsChain: Record<string, unknown> = {};
  petsChain.select = () => petsChain;
  petsChain.eq = () => petsChain;
  petsChain.maybeSingle = async () => ({ data: { id: "pet-1" }, error: null });

  const dailyChain: Record<string, unknown> = {};
  dailyChain.upsert = (row: Record<string, unknown>) => {
    upsertRows.push(row);
    return dailyChain;
  };
  dailyChain.select = () => dailyChain;
  dailyChain.single = async () =>
    upsertResults[Math.min(idx++, upsertResults.length - 1)];

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table === "pets") return petsChain;
      if (table === "daily_health_logs") return dailyChain;
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  };

  return { supabase, upsertRows };
}

function baseBody(extra: Record<string, unknown> = {}) {
  return {
    pet_id: "11111111-1111-4111-8111-111111111111",
    appetite: "normal",
    water: "normal",
    stool: "normal",
    urination: "normal",
    vomiting_count: 0,
    energy: "normal",
    meds_given: false,
    ...extra,
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/health-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/health-log/route");
  return POST(postRequest(body));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
});

describe("POST /api/health-log — context_signals packs accepted by the real schema", () => {
  const packs: Array<[string, Record<string, unknown>]> = [
    ["gi", { gi: { blood_in_stool: true, straining: false, change_note: "loose" } }],
    ["urinary", { urinary: { increased_thirst: true, accidents: false } }],
    ["mobility", { mobility: { limping: true, limb: "front left" } }],
    ["skin_ear", { skin_ear: { scratching: true, hot_spot: true } }],
    ["breathing", { breathing: { coughing: true, labored: false } }],
    ["seizure", { seizure: { occurred: true, duration_sec: 45 } }],
    [
      "medication",
      { medication: { name: "Apoquel", time_given: "08:30", side_effect_notes: "drowsy" } },
    ],
  ];

  it.each(packs)("accepts the %s pack (201)", async (_name, signals) => {
    const { supabase, upsertRows } = buildSupabase([
      { data: { id: "log-1", context_signals: signals }, error: null },
    ]);
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const res = await callPost(baseBody({ context_signals: signals }));

    expect(res.status).toBe(201);
    // The pack was sent to the DB on the first (only) upsert.
    expect(upsertRows[0].context_signals).toEqual(signals);
  });

  it("rejects an invalid body (400 VALIDATION_ERROR) — schema is real", async () => {
    const { supabase } = buildSupabase([{ data: null, error: null }]);
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);
    // seizure.occurred is required boolean; pass a non-boolean to trip the schema.
    const res = await callPost(baseBody({ context_signals: { seizure: { occurred: "yes" } } }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/health-log — missing context_signals column retries without breaking the save", () => {
  it("retries WITHOUT context_signals and still saves (201)", async () => {
    const { supabase, upsertRows } = buildSupabase([
      { data: null, error: { code: "42703", message: "column context_signals does not exist" } },
      { data: { id: "log-1" }, error: null },
    ]);
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const res = await callPost(
      baseBody({ context_signals: { gi: { blood_in_stool: true } } }),
    );

    expect(res.status).toBe(201);
    // First attempt included the field; the retry dropped it so core logging survives.
    expect(upsertRows).toHaveLength(2);
    expect(upsertRows[0]).toHaveProperty("context_signals");
    expect(upsertRows[1]).not.toHaveProperty("context_signals");
    // Core fields still present on the surviving save.
    expect(upsertRows[1].appetite).toBe("normal");
  });

  it("does not send context_signals at all when none are logged (no wasted column write)", async () => {
    const { supabase, upsertRows } = buildSupabase([{ data: { id: "log-1" }, error: null }]);
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const res = await callPost(baseBody());

    expect(res.status).toBe(201);
    expect(upsertRows).toHaveLength(1);
    expect(upsertRows[0]).not.toHaveProperty("context_signals");
  });
});

describe("POST /api/health-log — photo_urls persists independently of context_signals", () => {
  it("writes photo_urls when context_signals is absent", async () => {
    const { supabase, upsertRows } = buildSupabase([
      { data: { id: "log-1" }, error: null },
    ]);
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const photos = ["https://example.com/a.jpg", "https://example.com/b.jpg"];
    const res = await callPost(baseBody({ photo_urls: photos }));

    expect(res.status).toBe(201);
    expect(upsertRows[0].photo_urls).toEqual(photos);
    expect(upsertRows[0]).not.toHaveProperty("context_signals");
  });
});
