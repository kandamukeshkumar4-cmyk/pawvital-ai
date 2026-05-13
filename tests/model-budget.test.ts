describe("model-budget", () => {
  it("defaults second-opinion to a bounded session cap and allows one final-safety Grok call", async () => {
    const budget = await import("@/lib/model-budget");

    expect(budget.getModelBudgetPolicy("second_opinion")).toMatchObject({
      maxCallsPerSession: 2,
      timeoutMs: 8000,
    });
    expect(budget.getModelBudgetPolicy("grok_final_safety")).toMatchObject({
      maxCallsPerSession: 1,
      timeoutMs: 12000,
    });
    expect(budget.getModelBudgetPolicy("grok_final_report")).toMatchObject({
      maxCallsPerSession: 0,
    });
  });

  it("reserves second-opinion calls deterministically until the session cap is reached", async () => {
    const budget = await import("@/lib/model-budget");

    let state = budget.createModelBudgetState();

    const first = budget.reserveModelBudgetCall({
      feature: "second_opinion",
      mode: "on",
      state,
    });
    expect(first.allowed).toBe(true);
    state = first.state;
    expect(budget.getModelBudgetCallCount(state, "second_opinion")).toBe(1);

    const second = budget.reserveModelBudgetCall({
      feature: "second_opinion",
      mode: "on",
      state,
    });
    expect(second.allowed).toBe(true);
    state = second.state;
    expect(budget.getModelBudgetCallCount(state, "second_opinion")).toBe(2);

    const third = budget.reserveModelBudgetCall({
      feature: "second_opinion",
      mode: "on",
      state,
    });
    expect(third).toMatchObject({
      allowed: false,
      reason: "budget_exceeded",
    });
    expect(budget.getModelBudgetCallCount(third.state, "second_opinion")).toBe(2);
  });

  it("fails closed when the feature is disabled or the circuit is open", async () => {
    const budget = await import("@/lib/model-budget");

    const initial = budget.createModelBudgetState();

    expect(
      budget.reserveModelBudgetCall({
        feature: "second_opinion",
        mode: "off",
        state: initial,
      })
    ).toMatchObject({
      allowed: false,
      reason: "feature_disabled",
    });

    const circuitOpen = budget.openModelBudgetCircuit(initial, "second_opinion");
    expect(
      budget.reserveModelBudgetCall({
        feature: "second_opinion",
        mode: "on",
        state: circuitOpen,
      })
    ).toMatchObject({
      allowed: false,
      reason: "circuit_open",
    });
  });

  it("allows one final-safety Grok call per session and keeps final-report Grok blocked", async () => {
    const budget = await import("@/lib/model-budget");

    const initial = budget.reserveModelBudgetCall({
      feature: "grok_final_safety",
      mode: "on",
      state: budget.createModelBudgetState(),
    });
    expect(initial.allowed).toBe(true);

    const second = budget.reserveModelBudgetCall({
      feature: "grok_final_safety",
      mode: "on",
      state: initial.state,
    });
    expect(second).toMatchObject({
      allowed: false,
      reason: "budget_exceeded",
    });

    const finalReportAttempt = budget.reserveModelBudgetCall({
      feature: "grok_final_report",
      mode: "on",
      state: budget.createModelBudgetState(),
    });
    expect(finalReportAttempt).toMatchObject({
      allowed: false,
      reason: "budget_exceeded",
    });
  });
});
