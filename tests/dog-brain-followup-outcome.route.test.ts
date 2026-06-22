import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCheckRateLimit = jest.fn();
const mockRequireAuthenticatedApiUser = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  generalApiLimiter: { id: "general" },
  getRateLimitId: () => "rate-id",
}));

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

function updateChain(result: unknown) {
  const c: Record<string, unknown> = {
    update: jest.fn(() => c),
    eq: jest.fn(() => c),
    select: jest.fn(() => c),
    maybeSingle: jest.fn(async () => result),
  };
  return c;
}

const UUID = "11111111-1111-4111-8111-111111111111";

function patchRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/dog-brain/followups/${UUID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/dog-brain/followups/[id] (outcome updates Brain memory)", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
  });

  it("(proof e) records an owner outcome and returns the updated follow-up", async () => {
    const updated = { id: UUID, status: "worse", signal_key: "stool_change" };
    const chain = updateChain({ data: updated, error: null });
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: { from: jest.fn(() => chain) },
      user: { id: "user-1" },
    });

    const { PATCH } = await import(
      "../src/app/api/dog-brain/followups/[id]/route"
    );
    const res = await PATCH(patchRequest({ status: "worse" }), {
      params: Promise.resolve({ id: UUID }),
    });
    const payload = (await res.json()) as { data?: { status?: string } };

    expect(res.status).toBe(200);
    expect(payload.data?.status).toBe("worse");
    // The outcome is durably written (status + updated_at), scoped to the owner.
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "worse" }),
    );
  });

  it("rejects an invalid outcome status before touching the database", async () => {
    const { PATCH } = await import(
      "../src/app/api/dog-brain/followups/[id]/route"
    );
    const res = await PATCH(patchRequest({ status: "maybe" }), {
      params: Promise.resolve({ id: UUID }),
    });
    const payload = (await res.json()) as { code?: string };

    expect(res.status).toBe(400);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(mockRequireAuthenticatedApiUser).not.toHaveBeenCalled();
  });

  it("404s when the follow-up is not the caller's", async () => {
    const chain = updateChain({ data: null, error: null });
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: { from: jest.fn(() => chain) },
      user: { id: "user-1" },
    });

    const { PATCH } = await import(
      "../src/app/api/dog-brain/followups/[id]/route"
    );
    const res = await PATCH(patchRequest({ status: "better" }), {
      params: Promise.resolve({ id: UUID }),
    });

    expect(res.status).toBe(404);
  });
});
