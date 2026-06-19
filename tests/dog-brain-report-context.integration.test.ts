/**
 * Integration tests for the Dog Brain → symptom-report context path.
 *
 * Proves two contract guarantees:
 *  1. When a stable petId is available, the report context is built from the
 *     dog's PRIOR logs/checks/journal and skips the ambiguous name lookup.
 *  2. The deterministic red-flag urgency floor is never lowered by report
 *     context — the final-safety verifier rejects any LLM urgency downgrade,
 *     regardless of supportive Dog Brain context.
 */

import { jest } from "@jest/globals";
import { parseFinalSafetyVerifierResponse } from "@/lib/symptom-chat/final-safety-verifier";
import type { FinalSafetyVerifierInput } from "@/lib/symptom-chat/final-safety-verifier";

const mockCreateServerSupabaseClient = jest.fn<() => Promise<unknown>>();
jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

// A thenable query chain: select/eq/order return the chain; limit resolves to
// { data, error } (matching how loadDogBrainContext awaits each source).
function tableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = async () => ({ data: rows, error: null });
  return chain;
}

function buildSupabase(
  tableData: Record<string, unknown[]>,
  petsResult: unknown[] | null = null,
) {
  const fromCalls: string[] = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: (table: string) => {
      fromCalls.push(table);
      if (table === "pets") return tableChain(petsResult ?? []);
      return tableChain(tableData[table] ?? []);
    },
  };
  return { supabase, fromCalls };
}

const PRIOR_LOGS = [
  {
    id: "l1",
    user_id: "u1",
    pet_id: "pet-1",
    log_date: "2026-06-17",
    appetite: "reduced",
    water: "normal",
    stool: "normal",
    urination: "normal",
    vomiting_count: 2,
    energy: "low",
    weight_kg: null,
    meds_given: false,
    notes: null,
    photo_urls: [],
    context_signals: null,
    created_at: "2026-06-17T08:00:00.000Z",
    updated_at: "2026-06-17T08:00:00.000Z",
  },
];
const PRIOR_CHECKS = [
  { id: "c1", created_at: "2026-06-16T10:00:00.000Z", symptoms: "vomiting twice", severity: "moderate" },
];
const PRIOR_JOURNAL = [
  { entry_date: "2026-06-15", mood: "low", notes: "seemed tired after walk", photo_urls: [] },
];

async function loadContext(args: { userId: string | null; petName: string; petId?: string }) {
  const { loadDogBrainContext } = await import("@/lib/health-log/dog-brain-context");
  return loadDogBrainContext(args);
}

beforeEach(() => jest.clearAllMocks());

describe("Dog Brain report context — uses prior dog logs when petId is available", () => {
  it("builds context from prior logs/checks/journal and SKIPS the name lookup", async () => {
    const { supabase, fromCalls } = buildSupabase({
      daily_health_logs: PRIOR_LOGS,
      symptom_checks: PRIOR_CHECKS,
      journal_entries: PRIOR_JOURNAL,
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const ctx = await loadContext({ userId: "u1", petName: "Bruno", petId: "pet-1" });

    expect(ctx).not.toBeNull();
    // Pulls the prior daily-log trend.
    expect(ctx!.toLowerCase()).toContain("daily check-ins");
    // Pulls prior symptom checks and journal.
    expect(ctx!.toLowerCase()).toContain("prior symptom checks");
    expect(ctx!.toLowerCase()).toContain("seemed tired after walk");
    // Always carries the non-override disclaimer.
    expect(ctx!.toLowerCase()).toContain("do not override clinical assessment");
    // petId shortcut: the pets name-lookup was never queried.
    expect(fromCalls).not.toContain("pets");
    expect(fromCalls).toEqual(expect.arrayContaining(["daily_health_logs", "symptom_checks", "journal_entries"]));
  });

  it("falls back to the name lookup when no petId is given", async () => {
    const { supabase, fromCalls } = buildSupabase(
      { daily_health_logs: PRIOR_LOGS, symptom_checks: [], journal_entries: [] },
      [{ id: "pet-1" }], // exactly one pet matches the name
    );
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const ctx = await loadContext({ userId: "u1", petName: "Bruno" });

    expect(ctx).not.toBeNull();
    expect(fromCalls[0]).toBe("pets"); // name lookup happened first
  });

  it("returns null (skips context) when the name is ambiguous", async () => {
    const { supabase } = buildSupabase(
      { daily_health_logs: PRIOR_LOGS },
      [{ id: "pet-1" }, { id: "pet-2" }], // two same-named pets
    );
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const ctx = await loadContext({ userId: "u1", petName: "Bruno" });
    expect(ctx).toBeNull();
  });

  it("returns null when there is no user (no context for anonymous)", async () => {
    const ctx = await loadContext({ userId: null, petName: "Bruno", petId: "pet-1" });
    expect(ctx).toBeNull();
    expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("Red-flag urgency floor — never lowered by report context", () => {
  function input(overrides: Partial<FinalSafetyVerifierInput> = {}): FinalSafetyVerifierInput {
    return {
      deterministicUrgency: "emergency",
      deterministicRedFlags: ["collapse"],
      explicitOwnerAnswers: {},
      unresolvedCriticalUnknowns: [],
      // Benign Dog Brain-style owner context present in the draft.
      ownerFacingSummaryDraft:
        "Owner's daily check-ins: mostly normal. Owner-reported observations, not clinical measurements.",
      vetHandoffDraft: "Owner reports collapse episode.",
      ...overrides,
    };
  }

  function verifierResponse(recommended: string): string {
    return JSON.stringify({
      unsafeDowngradeDetected: false,
      safeToShow: true,
      missedRedFlags: [],
      diagnosisOrTreatmentClaims: [],
      vetHandoffNotes: [],
      recommendedUrgencyLanguage: recommended,
    });
  }

  it("REJECTS an LLM downgrade below the deterministic emergency floor", () => {
    const result = parseFinalSafetyVerifierResponse(verifierResponse("monitor"), input());
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("unsafe_downgrade");
    }
  });

  it("also rejects a same-day downgrade when deterministic is emergency", () => {
    const result = parseFinalSafetyVerifierResponse(verifierResponse("same_day"), input());
    expect(result.status).toBe("rejected");
  });

  it("ACCEPTS an equal (emergency) recommendation — context does not block correct urgency", () => {
    const result = parseFinalSafetyVerifierResponse(verifierResponse("emergency"), input());
    expect(result.status).toBe("accepted");
  });
});
