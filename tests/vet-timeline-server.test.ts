/**
 * Tests for the vet-timeline server loader (ownership + aggregation) and the
 * PDF route's guard paths. Supabase + rate-limit mocked.
 */

import { jest } from "@jest/globals";
import { loadVetTimelineForPet } from "@/lib/analytics/vet-timeline-server";

type Result = { data: unknown; error: unknown };

/** Query chain: select/eq/order resolve to the chain; maybeSingle/limit resolve to a result. */
function chain(result: Result) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.order = () => c;
  c.maybeSingle = async () => result;
  c.limit = async () => result;
  return c;
}

function buildSupabase(tables: Record<string, Result>) {
  const fromCalls: string[] = [];
  return {
    fromCalls,
    supabase: {
      from: (table: string) => {
        fromCalls.push(table);
        return chain(tables[table] ?? { data: [], error: null });
      },
    } as never,
  };
}

const CHECK_ROW = {
  id: "c1",
  pet_id: "pet-1",
  symptoms: "Vomiting",
  ai_response: "{}",
  severity: "medium",
  recommendation: "vet_48h",
  created_at: "2026-06-17T10:00:00.000Z",
};
const LOG_ROW = {
  id: "l1",
  user_id: "u1",
  pet_id: "pet-1",
  log_date: "2026-06-18",
  appetite: "reduced",
  water: "normal",
  stool: "diarrhea",
  urination: "normal",
  vomiting_count: 1,
  energy: "low",
  weight_kg: null,
  meds_given: false,
  notes: null,
  photo_urls: [],
  context_signals: null,
  created_at: "2026-06-18T08:00:00.000Z",
  updated_at: "2026-06-18T08:00:00.000Z",
};

describe("loadVetTimelineForPet", () => {
  it("returns null when the pet is not owned by the user", async () => {
    const { supabase, fromCalls } = buildSupabase({ pets: { data: null, error: null } });
    const result = await loadVetTimelineForPet(supabase, "u1", "pet-1");
    expect(result).toBeNull();
    // never queries data sources once ownership fails
    expect(fromCalls).toEqual(["pets"]);
  });

  it("builds a timeline from checks + logs when the pet is owned", async () => {
    const { supabase } = buildSupabase({
      pets: { data: { id: "pet-1", name: "Bruno" }, error: null },
      symptom_checks: { data: [CHECK_ROW], error: null },
      daily_health_logs: { data: [LOG_ROW], error: null },
      journal_entries: { data: [], error: null },
    });
    const result = await loadVetTimelineForPet(supabase, "u1", "pet-1");
    expect(result).not.toBeNull();
    expect(result!.petName).toBe("Bruno");
    // one symptom-check entry + one daily-log entry
    expect(result!.timeline.entries.length).toBeGreaterThanOrEqual(2);
    expect(result!.timeline.vetSummary.toLowerCase()).toContain("tell your vet");
    // owner-only, never a clinical record (proven by the formatter elsewhere)
    expect(result!.timeline.entries.some((e) => e.source === "symptom_check")).toBe(true);
    expect(result!.timeline.entries.some((e) => e.source === "daily_log")).toBe(true);
  });
});

describe("GET /api/analytics/vet-timeline/pdf — guard paths", () => {
  const mockCheckRateLimit = jest.fn<() => Promise<{ success: boolean; reset: number }>>();
  const mockCreateServerSupabaseClient = jest.fn<() => Promise<unknown>>();

  jest.mock("@/lib/rate-limit", () => ({
    generalApiLimiter: {},
    checkRateLimit: () => mockCheckRateLimit(),
    getRateLimitId: () => "test",
  }));
  jest.mock("@/lib/supabase-server", () => ({
    createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
  });

  async function callGet(petId: string) {
    const { GET } = await import("@/app/api/analytics/vet-timeline/pdf/route");
    return GET(new Request(`http://localhost/api/analytics/vet-timeline/pdf?pet_id=${petId}`));
  }

  it("400 on a non-UUID pet_id (no PDF render attempted)", async () => {
    const res = await callGet("not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    });
    const res = await callGet("11111111-1111-4111-8111-111111111111");
    expect(res.status).toBe(401);
  });

  it("404 when the pet is not owned", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
      from: () => chain({ data: null, error: null }),
    });
    const res = await callGet("11111111-1111-4111-8111-111111111111");
    expect(res.status).toBe(404);
  });
});
