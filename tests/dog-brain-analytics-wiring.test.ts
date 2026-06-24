/**
 * Phase 3b — analytics emitters are wired at the right CRUD call-sites.
 *
 * Keeps the REAL event builders (so payload shape is exercised) and spies only
 * the sink, asserting each route fires the correct privacy-safe event on genuine
 * success and stays SILENT on dedup / no-op. Proves the loop is measurable.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCheckRateLimit = jest.fn();
const mockRequireAuth = jest.fn();
const mockRequireOwnedPet = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  generalApiLimiter: { id: "general" },
  getRateLimitId: () => "rate-id",
}));
jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...a: unknown[]) => mockRequireAuth(...a),
}));
jest.mock("@/lib/api/pet-guard", () => ({
  requireOwnedPet: (...a: unknown[]) => mockRequireOwnedPet(...a),
}));

// Keep real builders + enums; spy only the network sink.
jest.mock("@/lib/dog-brain/analytics", () => {
  const actual = jest.requireActual<typeof import("@/lib/dog-brain/analytics")>(
    "@/lib/dog-brain/analytics",
  );
  return { ...actual, recordDogBrainEvent: jest.fn() };
});

import {
  recordDogBrainEvent,
  DOG_BRAIN_EVENTS,
} from "@/lib/dog-brain/analytics";

const emit = recordDogBrainEvent as unknown as jest.Mock;
const UUID = "11111111-1111-4111-8111-111111111111";

interface EventLike {
  name: string;
  properties?: { outcomeBucket?: string };
}
function lastEvent(): EventLike {
  const call = emit.mock.calls.at(-1);
  return call?.[0] as EventLike;
}

function chain(steps: { maybeSingle?: unknown[]; result?: unknown }) {
  let i = 0;
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "insert", "update", "order"]) {
    c[m] = jest.fn(() => c);
  }
  c.maybeSingle = jest.fn(async () =>
    steps.maybeSingle ? steps.maybeSingle[i++] ?? steps.result : steps.result,
  );
  return c;
}

function jsonReq(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // NOTE: deliberately NOT jest.resetModules() — the dynamically-imported routes
  // must share the SAME mocked recordDogBrainEvent instance captured below as
  // `emit`. resetModules would hand the route a fresh mock and the assertions
  // would observe an empty call log. Per-test behavior comes from the auth /
  // supabase mocks, not module state, so caching the route module is safe.
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ success: true });
});

describe("followups POST → dog_brain_followup_created", () => {
  const BODY = { pet_id: UUID, signal_key: "stool_change", prompt: "better/same/worse?" };

  it("emits on a genuinely new follow-up (201)", async () => {
    const pet = chain({ result: { data: { id: UUID }, error: null } });
    const fu = chain({ maybeSingle: [{ data: null, error: null }, { data: { id: "new" }, error: null }] });
    mockRequireAuth.mockResolvedValue({
      supabase: { from: (t: string) => (t === "pets" ? pet : fu) },
      user: { id: "u1" },
    });
    const { POST } = await import("../src/app/api/dog-brain/followups/route");
    const res = await POST(jsonReq("http://x/api/dog-brain/followups", "POST", BODY));
    expect(res.status).toBe(201);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(lastEvent().name).toBe(DOG_BRAIN_EVENTS.followupCreated);
  });

  it("stays SILENT when the follow-up already exists (deduped)", async () => {
    const pet = chain({ result: { data: { id: UUID }, error: null } });
    const fu = chain({ result: { data: { id: "existing", status: "pending" }, error: null } });
    mockRequireAuth.mockResolvedValue({
      supabase: { from: (t: string) => (t === "pets" ? pet : fu) },
      user: { id: "u1" },
    });
    const { POST } = await import("../src/app/api/dog-brain/followups/route");
    const res = await POST(jsonReq("http://x/api/dog-brain/followups", "POST", BODY));
    expect(res.status).toBe(200);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("followups/[id] PATCH → dog_brain_followup_outcome_recorded", () => {
  it("emits the outcome bucket on a recorded outcome", async () => {
    const fu = chain({ result: { data: { id: UUID, status: "worse" }, error: null } });
    mockRequireAuth.mockResolvedValue({
      supabase: { from: () => fu },
      user: { id: "u1" },
    });
    const { PATCH } = await import("../src/app/api/dog-brain/followups/[id]/route");
    const res = await PATCH(
      jsonReq(`http://x/api/dog-brain/followups/${UUID}`, "PATCH", { status: "worse" }),
      { params: Promise.resolve({ id: UUID }) },
    );
    expect(res.status).toBe(200);
    expect(lastEvent().name).toBe(DOG_BRAIN_EVENTS.followupOutcomeRecorded);
    expect(lastEvent().properties?.outcomeBucket).toBe("worse");
  });
});

describe("supplements POST/PATCH → trial lifecycle events", () => {
  it("POST emits supplement_trial_started (201)", async () => {
    const trials = chain({ maybeSingle: [{ data: null, error: null }, { data: { id: "t1" }, error: null }] });
    mockRequireOwnedPet.mockResolvedValue({
      supabase: { from: () => trials },
      user: { id: "u1" },
      petId: UUID,
    });
    const { POST } = await import("../src/app/api/dog-brain/supplements/route");
    const res = await POST(
      jsonReq("http://x/api/dog-brain/supplements", "POST", {
        pet_id: UUID,
        supplement_name: "gut support",
      }),
    );
    expect(res.status).toBe(201);
    expect(lastEvent().name).toBe(DOG_BRAIN_EVENTS.supplementTrialStarted);
  });

  it("PATCH mark_active emits supplement_trial_marked_active", async () => {
    const trials = chain({ result: { data: { id: UUID, status: "active" }, error: null } });
    mockRequireAuth.mockResolvedValue({ supabase: { from: () => trials }, user: { id: "u1" } });
    const { PATCH } = await import("../src/app/api/dog-brain/supplements/route");
    const res = await PATCH(
      jsonReq(`http://x/api/dog-brain/supplements?id=${UUID}`, "PATCH", { action: "mark_active" }),
    );
    expect(res.status).toBe(200);
    expect(lastEvent().name).toBe(DOG_BRAIN_EVENTS.supplementTrialMarkedActive);
  });

  it("PATCH outcome emits supplement_trial_outcome_recorded with the bucket", async () => {
    const trials = chain({ result: { data: { id: UUID, status: "outcome_recorded" }, error: null } });
    mockRequireAuth.mockResolvedValue({ supabase: { from: () => trials }, user: { id: "u1" } });
    const { PATCH } = await import("../src/app/api/dog-brain/supplements/route");
    const res = await PATCH(
      jsonReq(`http://x/api/dog-brain/supplements?id=${UUID}`, "PATCH", { outcome: "worse" }),
    );
    expect(res.status).toBe(200);
    expect(lastEvent().name).toBe(DOG_BRAIN_EVENTS.supplementTrialOutcomeRecorded);
    expect(lastEvent().properties?.outcomeBucket).toBe("worse");
  });
});
