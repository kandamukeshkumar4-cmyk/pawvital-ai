import {
  blocksAdditionalCheckout,
  blocksAdditionalCheckoutForUser,
  evaluateSymptomCheckUsageGate,
  getEffectivePlanForUser,
  getPlanFromSubscription,
} from "@/lib/subscription-state";

describe("subscription-state helpers", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("treats paid active rows as their real plan", () => {
    expect(
      getPlanFromSubscription({
        id: "sub-1",
        user_id: "user-1",
        stripe_subscription_id: "sub_123",
        stripe_customer_id: "cus_123",
        plan: "clinic",
        status: "active",
        current_period_end: "2026-05-01T00:00:00.000Z",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      })
    ).toBe("clinic");
  });

  it("blocks additional checkout when a recoverable paid subscription already exists", () => {
    expect(blocksAdditionalCheckout("trialing")).toBe(true);
    expect(blocksAdditionalCheckout("past_due")).toBe(true);
    expect(blocksAdditionalCheckout("canceled")).toBe(false);
  });

  it("VET-1352 tester access smoke: elevates invited private testers to effective pro access", () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_MODE: "1",
      PRIVATE_TESTER_ALLOWED_EMAILS: "tester@example.com",
    };

    expect(
      getEffectivePlanForUser({
        email: "tester@example.com",
        subscription: null,
      })
    ).toBe("pro");
    expect(
      blocksAdditionalCheckoutForUser({
        email: "tester@example.com",
        status: null,
      })
    ).toBe(true);
  });

  it("fires the free-tier usage gate at the monthly threshold", () => {
    const result = evaluateSymptomCheckUsageGate({
      completedChecksThisMonth: 5,
      conversationStarted: false,
      freeTierLimit: 5,
      isEmergency: false,
      plan: "free",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("free_tier_limit_reached");
    expect(result.requiresUpgrade).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("never blocks emergency cases", () => {
    const result = evaluateSymptomCheckUsageGate({
      completedChecksThisMonth: 999,
      conversationStarted: false,
      freeTierLimit: 5,
      isEmergency: true,
      plan: "free",
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("emergency_bypass");
    expect(result.requiresUpgrade).toBe(false);
  });

  it("never blocks a conversation that is already in progress", () => {
    const result = evaluateSymptomCheckUsageGate({
      completedChecksThisMonth: 999,
      conversationStarted: true,
      freeTierLimit: 5,
      isEmergency: false,
      plan: "free",
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("conversation_in_progress");
  });
});
