import {
  SECOND_OPINION_ELIGIBILITY_REASON_CODES,
  buildSecondOpinionEligibilityTrace,
  extractSecondOpinionPendingAnswer,
  getSecondOpinionExtractorMode,
  parseSecondOpinionExtractorResponse,
  shouldAttemptSecondOpinionExtraction,
} from "@/lib/symptom-chat/second-opinion-extractor";
import { createModelBudgetState } from "@/lib/model-budget";

describe("VET-1425 second-opinion pending answer extractor", () => {
  it("defaults the feature flag to off and accepts only supported modes", () => {
    expect(getSecondOpinionExtractorMode(undefined)).toBe("off");
    expect(getSecondOpinionExtractorMode("")).toBe("off");
    expect(getSecondOpinionExtractorMode("shadow")).toBe("shadow");
    expect(getSecondOpinionExtractorMode("ON")).toBe("on");
    expect(getSecondOpinionExtractorMode("unexpected")).toBe("off");
  });

  it("runs only for unresolved pending answers on the first clarification retry", () => {
    expect(
      shouldAttemptSecondOpinionExtraction({
        mode: "on",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for two days",
        primaryExtractionFailed: true,
        deterministicResolved: false,
        clarificationAttempts: 1,
      })
    ).toEqual({ shouldRun: true });

    expect(
      shouldAttemptSecondOpinionExtraction({
        mode: "off",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for two days",
        primaryExtractionFailed: true,
        deterministicResolved: false,
        clarificationAttempts: 1,
      })
    ).toEqual({ shouldRun: false });

    expect(
      shouldAttemptSecondOpinionExtraction({
        mode: "on",
        ownerMessage: "for two days",
        primaryExtractionFailed: true,
        deterministicResolved: false,
        clarificationAttempts: 1,
      })
    ).toEqual({ shouldRun: false, reason: "no_pending_question" });

    expect(
      shouldAttemptSecondOpinionExtraction({
        mode: "on",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for two days",
        primaryExtractionFailed: false,
        deterministicResolved: false,
        clarificationAttempts: 1,
      })
    ).toEqual({ shouldRun: false, reason: "deterministic_resolved" });

    expect(
      shouldAttemptSecondOpinionExtraction({
        mode: "on",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for two days",
        primaryExtractionFailed: true,
        deterministicResolved: true,
        clarificationAttempts: 1,
      })
    ).toEqual({ shouldRun: false, reason: "deterministic_resolved" });

    expect(
      shouldAttemptSecondOpinionExtraction({
        mode: "on",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for two days",
        primaryExtractionFailed: true,
        deterministicResolved: false,
        clarificationAttempts: 0,
      })
    ).toEqual({ shouldRun: false, reason: "not_first_clarification" });

    expect(
      shouldAttemptSecondOpinionExtraction({
        mode: "on",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "   ",
        primaryExtractionFailed: true,
        deterministicResolved: false,
        clarificationAttempts: 1,
      })
    ).toEqual({ shouldRun: false });
  });

  it("emits stable sanitized eligibility trace reason codes", () => {
    expect(SECOND_OPINION_ELIGIBILITY_REASON_CODES).toEqual([
      "eligible",
      "feature_disabled",
      "empty_owner_message",
      "no_active_pending_question",
      "primary_extraction_succeeded",
      "deterministic_coercion_succeeded",
      "not_first_clarification_attempt",
      "repeat_guard_fired",
      "budget_exhausted",
      "circuit_open",
      "shadow_primary_success_sampling",
    ]);

    expect(
      buildSecondOpinionEligibilityTrace({
        mode: "shadow",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "It has been going on for two days.",
        primaryExtractionFailed: true,
        deterministicResolved: false,
        clarificationAttempts: 1,
        repeatGuardAlreadyFired: false,
        budgetState: createModelBudgetState(),
      })
    ).toEqual({
      active_pending_question: true,
      primary_extraction_failed: true,
      deterministic_coercion_failed: true,
      first_clarification_attempt: true,
      repeat_guard_not_fired: true,
      budget_available: true,
      eligibility_reason: "eligible",
      request_outcome: "requested",
    });

    const budgetExhaustedTrace = buildSecondOpinionEligibilityTrace({
      mode: "shadow",
      pendingQuestionId: "vomit_duration",
      ownerMessage: "It has been going on for two days.",
      primaryExtractionFailed: true,
      deterministicResolved: false,
      clarificationAttempts: 1,
      repeatGuardAlreadyFired: false,
      budgetState: {
        ...createModelBudgetState(),
        callCounts: {
          second_opinion: 2,
        },
      },
    });

    expect(budgetExhaustedTrace).toEqual(
      expect.objectContaining({
        budget_available: false,
        eligibility_reason: "budget_exhausted",
        request_outcome: "budget_exhausted",
      })
    );
    expect(JSON.stringify(budgetExhaustedTrace)).not.toContain("two days");
  });

  it.each([
    {
      name: "feature disabled",
      input: { mode: "off" as const },
      expected: {
        budget_available: false,
        eligibility_reason: "feature_disabled",
        request_outcome: "not_requested",
      },
    },
    {
      name: "empty owner message",
      input: { ownerMessage: "   " },
      expected: {
        eligibility_reason: "empty_owner_message",
        request_outcome: "not_requested",
      },
    },
    {
      name: "no active pending question",
      input: { pendingQuestionId: undefined },
      expected: {
        active_pending_question: false,
        eligibility_reason: "no_active_pending_question",
        request_outcome: "not_requested",
      },
    },
    {
      name: "primary extraction already succeeded",
      input: { primaryExtractionFailed: false },
      expected: {
        primary_extraction_failed: false,
        eligibility_reason: "primary_extraction_succeeded",
        request_outcome: "not_requested",
      },
    },
    {
      name: "deterministic coercion already succeeded",
      input: { deterministicResolved: true },
      expected: {
        deterministic_coercion_failed: false,
        eligibility_reason: "deterministic_coercion_succeeded",
        request_outcome: "not_requested",
      },
    },
    {
      name: "not first clarification attempt",
      input: { clarificationAttempts: 2 },
      expected: {
        first_clarification_attempt: false,
        eligibility_reason: "not_first_clarification_attempt",
        request_outcome: "not_requested",
      },
    },
    {
      name: "repeat guard already fired",
      input: { repeatGuardAlreadyFired: true },
      expected: {
        repeat_guard_not_fired: false,
        eligibility_reason: "repeat_guard_fired",
        request_outcome: "not_requested",
      },
    },
    {
      name: "circuit open",
      input: {
        budgetState: createModelBudgetState({
          circuitOpen: { second_opinion: true },
        }),
      },
      expected: {
        budget_available: false,
        eligibility_reason: "circuit_open",
        request_outcome: "not_requested",
      },
    },
    {
      name: "budget exhausted",
      input: {
        budgetState: createModelBudgetState({
          callCounts: { second_opinion: 2 },
        }),
      },
      expected: {
        budget_available: false,
        eligibility_reason: "budget_exhausted",
        request_outcome: "budget_exhausted",
      },
    },
  ])("resolves the sanitized trace gate for $name", ({ input, expected }) => {
    const trace = buildSecondOpinionEligibilityTrace({
      mode: "shadow",
      pendingQuestionId: "vomit_duration",
      ownerMessage: "OWNER_SECRET phrase for two days.",
      primaryExtractionFailed: true,
      deterministicResolved: false,
      clarificationAttempts: 1,
      repeatGuardAlreadyFired: false,
      budgetState: createModelBudgetState(),
      ...input,
    });

    expect(trace).toEqual(expect.objectContaining(expected));
    expect(JSON.stringify(trace)).not.toContain("OWNER_SECRET");
    expect(JSON.stringify(trace)).not.toContain("two days");
  });

  it("accepts a strict JSON answer anchored to the pending duration question", () => {
    const parsed = parseSecondOpinionExtractorResponse(
      JSON.stringify({
        answered: true,
        questionId: "vomit_duration",
        answerValue: "for about two days",
        confidence: 0.91,
        ownerPhrase: "for about two days",
        needsClarification: false,
      }),
      {
        pendingQuestionId: "vomit_duration",
        ownerMessage: "It has been going on for about two days.",
        knownSymptomsBeforeTurn: ["vomiting"],
      }
    );

    expect(parsed).toEqual({
      status: "accepted",
      answer: {
        answered: true,
        questionId: "vomit_duration",
        answerValue: "for about two days",
        confidence: 0.91,
        ownerPhrase: "for about two days",
        needsClarification: false,
      },
    });
  });

  it("normalizes strict choice answers without accepting unrelated choices", () => {
    const accepted = parseSecondOpinionExtractorResponse(
      JSON.stringify({
        answered: true,
        questionId: "cough_type",
        answerValue: "dry honking",
        confidence: 0.88,
        ownerPhrase: "dry honking",
        needsClarification: false,
      }),
      {
        pendingQuestionId: "cough_type",
        ownerMessage: "It sounds like a dry honking cough.",
        knownSymptomsBeforeTurn: ["coughing"],
      }
    );

    expect(accepted).toEqual({
      status: "accepted",
      answer: {
        answered: true,
        questionId: "cough_type",
        answerValue: "dry_honking",
        confidence: 0.88,
        ownerPhrase: "dry honking",
        needsClarification: false,
      },
    });

    const rejected = parseSecondOpinionExtractorResponse(
      JSON.stringify({
        answered: true,
        questionId: "cough_type",
        answerValue: "blue",
        confidence: 0.91,
        ownerPhrase: "dry honking",
        needsClarification: false,
      }),
      {
        pendingQuestionId: "cough_type",
        ownerMessage: "It sounds like a dry honking cough.",
        knownSymptomsBeforeTurn: ["coughing"],
      }
    );

    expect(rejected).toEqual({
      status: "rejected",
      reason: "unsafe_inference",
    });
  });

  it.each([
    ["```json\n{\"answered\":true}\n```", "malformed_json"],
    [
      JSON.stringify({
        answered: true,
        questionId: "vomit_duration",
        answerValue: "two days",
        confidence: 0.79,
        ownerPhrase: "two days",
        needsClarification: false,
      }),
      "low_confidence",
    ],
    [
      JSON.stringify({
        answered: true,
        questionId: "cough_type",
        answerValue: "two days",
        confidence: 0.93,
        ownerPhrase: "two days",
        needsClarification: false,
      }),
      "unsafe_inference",
    ],
    [
      JSON.stringify({
        answered: true,
        questionId: "vomit_duration",
        answerValue: "two days",
        confidence: 0.93,
        ownerPhrase: "since Monday",
        needsClarification: false,
      }),
      "unsafe_inference",
    ],
  ])("rejects invalid model output with reason %s", (raw, reason) => {
    expect(
      parseSecondOpinionExtractorResponse(raw, {
        pendingQuestionId: "vomit_duration",
        ownerMessage: "It has been going on for two days.",
        knownSymptomsBeforeTurn: ["vomiting"],
      })
    ).toEqual({
      status: "rejected",
      reason,
    });
  });

  it("does not mark emergency red flags negative without explicit denial", () => {
    const rejected = parseSecondOpinionExtractorResponse(
      JSON.stringify({
        answered: true,
        questionId: "vomit_blood",
        answerValue: false,
        confidence: 0.92,
        ownerPhrase: "not really sure",
        needsClarification: false,
      }),
      {
        pendingQuestionId: "vomit_blood",
        ownerMessage: "Not really sure, I did not get a good look.",
        knownSymptomsBeforeTurn: ["vomiting"],
      }
    );

    expect(rejected).toEqual({
      status: "rejected",
      reason: "unsafe_inference",
    });

    const accepted = parseSecondOpinionExtractorResponse(
      JSON.stringify({
        answered: true,
        questionId: "vomit_blood",
        answerValue: false,
        confidence: 0.94,
        ownerPhrase: "No, there is no blood",
        needsClarification: false,
      }),
      {
        pendingQuestionId: "vomit_blood",
        ownerMessage: "No, there is no blood in what he threw up.",
        knownSymptomsBeforeTurn: ["vomiting"],
      }
    );

    expect(accepted.status).toBe("accepted");
    expect(accepted.status === "accepted" && accepted.answer.answerValue).toBe(
      false
    );
  });

  it("keeps critical unknown replies unresolved for safe escalation", () => {
    const parsed = parseSecondOpinionExtractorResponse(
      JSON.stringify({
        answered: true,
        questionId: "gum_color",
        answerValue: "unknown",
        confidence: 0.9,
        ownerPhrase: "I can't tell",
        needsClarification: false,
      }),
      {
        pendingQuestionId: "gum_color",
        ownerMessage: "I can't tell what color the gums are.",
        knownSymptomsBeforeTurn: ["difficulty_breathing"],
      }
    );

    expect(parsed).toEqual({
      status: "rejected",
      reason: "unsafe_inference",
    });
  });

  it("rejects ambiguous replies that introduce a new symptom outside the pending question", () => {
    const parsed = parseSecondOpinionExtractorResponse(
      JSON.stringify({
        answered: true,
        questionId: "vomit_duration",
        answerValue: "for two days",
        confidence: 0.9,
        ownerPhrase: "for two days",
        needsClarification: false,
      }),
      {
        pendingQuestionId: "vomit_duration",
        ownerMessage: "He has been vomiting for two days and is limping now.",
        knownSymptomsBeforeTurn: ["vomiting"],
      }
    );

    expect(parsed).toEqual({
      status: "rejected",
      reason: "unsafe_inference",
    });
  });

  it("runs the model in shadow mode and returns the accepted result", async () => {
    // VET-1520C: shadow mode must run the model and return "accepted" so the route
    // can record a shadow comparison. The route (not the extractor) decides whether
    // to apply the answer.
    const modelCaller = jest.fn().mockResolvedValue(
      JSON.stringify({
        answered: true,
        questionId: "vomit_duration",
        answerValue: "since yesterday",
        confidence: 0.87,
        ownerPhrase: "since yesterday",
        needsClarification: false,
      })
    );

    const result = await extractSecondOpinionPendingAnswer({
      mode: "shadow",
      pendingQuestionId: "vomit_duration",
      ownerMessage: "It started since yesterday.",
      primaryExtractionFailed: true,
      deterministicResolved: false,
      clarificationAttempts: 1,
      knownSymptomsBeforeTurn: ["vomiting"],
      modelCaller,
    });

    expect(result.status).toBe("accepted");
    expect(modelCaller).toHaveBeenCalledTimes(1);
  });

  it("calls the model only after trigger conditions pass", async () => {
    const modelCaller = jest.fn().mockResolvedValue(
      JSON.stringify({
        answered: true,
        questionId: "vomit_duration",
        answerValue: "since yesterday",
        confidence: 0.87,
        ownerPhrase: "since yesterday",
        needsClarification: false,
      })
    );

    const accepted = await extractSecondOpinionPendingAnswer({
      mode: "on",
      pendingQuestionId: "vomit_duration",
      ownerMessage: "It started since yesterday.",
      primaryExtractionFailed: true,
      deterministicResolved: false,
      clarificationAttempts: 1,
      knownSymptomsBeforeTurn: ["vomiting"],
      modelCaller,
    });

    expect(accepted).toEqual({
      status: "accepted",
      answer: {
        answered: true,
        questionId: "vomit_duration",
        answerValue: "since yesterday",
        confidence: 0.87,
        ownerPhrase: "since yesterday",
        needsClarification: false,
      },
    });
    expect(modelCaller).toHaveBeenCalledTimes(1);

    const skipped = await extractSecondOpinionPendingAnswer({
      mode: "on",
      pendingQuestionId: "vomit_duration",
      ownerMessage: "It started since yesterday.",
      primaryExtractionFailed: true,
      deterministicResolved: false,
      clarificationAttempts: 0,
      knownSymptomsBeforeTurn: ["vomiting"],
      modelCaller,
    });

    expect(skipped).toEqual({
      status: "skipped",
      reason: "not_first_clarification",
    });
    expect(modelCaller).toHaveBeenCalledTimes(1);
  });

  it("returns failure outcomes for timeout and provider errors", async () => {
    await expect(
      extractSecondOpinionPendingAnswer({
        mode: "on",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for two days",
        primaryExtractionFailed: true,
        deterministicResolved: false,
        clarificationAttempts: 1,
        knownSymptomsBeforeTurn: ["vomiting"],
        timeoutMs: 1,
        modelCaller: () => new Promise<string>(() => {}),
      })
    ).resolves.toEqual({
      status: "failed",
      reason: "timeout",
    });

    await expect(
      extractSecondOpinionPendingAnswer({
        mode: "on",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for two days",
        primaryExtractionFailed: true,
        deterministicResolved: false,
        clarificationAttempts: 1,
        knownSymptomsBeforeTurn: ["vomiting"],
        modelCaller: async () => {
          throw new Error("provider unavailable");
        },
      })
    ).resolves.toEqual({
      status: "failed",
      reason: "provider_error",
    });
  });

  it("fails closed when the second-opinion session budget is already exhausted", async () => {
    const modelCaller = jest.fn();

    const result = await extractSecondOpinionPendingAnswer({
      mode: "on",
      pendingQuestionId: "vomit_duration",
      ownerMessage: "for two days",
      primaryExtractionFailed: true,
      deterministicResolved: false,
      clarificationAttempts: 1,
      knownSymptomsBeforeTurn: ["vomiting"],
      budgetState: {
        ...createModelBudgetState(),
        callCounts: {
          second_opinion: 2,
        },
      },
      modelCaller,
    });

    expect(result).toMatchObject({
      status: "skipped",
      reason: "budget_exceeded",
    });
    expect(modelCaller).not.toHaveBeenCalled();
  });

  describe("VET-1544C shadow primary-success sampling", () => {
    it("runs on the first primary-success answer turn when shadow sampling is enabled", () => {
      expect(
        shouldAttemptSecondOpinionExtraction({
          mode: "shadow",
          pendingQuestionId: "vomit_duration",
          ownerMessage: "for about two days",
          primaryExtractionFailed: false,
          deterministicResolved: true,
          clarificationAttempts: 0,
          isShadowSampling: true,
        })
      ).toEqual({ shouldRun: true });
    });

    it("does not run shadow sampling on repeated clarification turns", () => {
      expect(
        shouldAttemptSecondOpinionExtraction({
          mode: "shadow",
          pendingQuestionId: "vomit_duration",
          ownerMessage: "for about two days",
          primaryExtractionFailed: false,
          deterministicResolved: true,
          clarificationAttempts: 1,
          isShadowSampling: true,
        })
      ).toEqual({ shouldRun: false, reason: "not_first_clarification" });
    });

    it("emits a requested trace for eligible primary-success shadow sampling", () => {
      const trace = buildSecondOpinionEligibilityTrace({
        mode: "shadow",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "OWNER_SECRET It has been about two days.",
        primaryExtractionFailed: false,
        deterministicResolved: true,
        clarificationAttempts: 0,
        repeatGuardAlreadyFired: false,
        budgetState: createModelBudgetState(),
        isShadowSampling: true,
      });

      expect(trace).toEqual({
        active_pending_question: true,
        primary_extraction_failed: false,
        deterministic_coercion_failed: false,
        first_clarification_attempt: true,
        repeat_guard_not_fired: true,
        budget_available: true,
        eligibility_reason: "shadow_primary_success_sampling",
        request_outcome: "requested",
      });
      expect(JSON.stringify(trace)).not.toContain("OWNER_SECRET");
      expect(JSON.stringify(trace)).not.toContain("two days");
    });

    it("keeps primary-success shadow sampling inside the second-opinion budget", () => {
      const trace = buildSecondOpinionEligibilityTrace({
        mode: "shadow",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for about two days",
        primaryExtractionFailed: false,
        deterministicResolved: true,
        clarificationAttempts: 0,
        repeatGuardAlreadyFired: false,
        budgetState: createModelBudgetState({
          callCounts: { second_opinion: 2 },
        }),
        isShadowSampling: true,
      });

      expect(trace).toMatchObject({
        budget_available: false,
        eligibility_reason: "budget_exhausted",
        request_outcome: "budget_exhausted",
      });
    });

    it("calls the model on a primary-success turn only when shadow sampling is enabled", async () => {
      const modelCaller = jest.fn().mockResolvedValue(
        JSON.stringify({
          answered: true,
          questionId: "vomit_duration",
          answerValue: "about two days",
          confidence: 0.91,
          ownerPhrase: "about two days",
          needsClarification: false,
        })
      );

      const result = await extractSecondOpinionPendingAnswer({
        mode: "shadow",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "It has been going on for about two days.",
        primaryExtractionFailed: false,
        deterministicResolved: true,
        clarificationAttempts: 0,
        knownSymptomsBeforeTurn: ["vomiting"],
        modelCaller,
        isShadowSampling: true,
      });

      expect(result.status).toBe("accepted");
      expect(modelCaller).toHaveBeenCalledTimes(1);
    });

    it("preserves the existing primary-success skip when shadow sampling is not enabled", () => {
      const trace = buildSecondOpinionEligibilityTrace({
        mode: "shadow",
        pendingQuestionId: "vomit_duration",
        ownerMessage: "for about two days",
        primaryExtractionFailed: false,
        deterministicResolved: false,
        clarificationAttempts: 1,
        repeatGuardAlreadyFired: false,
        budgetState: createModelBudgetState(),
      });

      expect(trace).toMatchObject({
        eligibility_reason: "primary_extraction_succeeded",
        request_outcome: "not_requested",
      });
    });
  });
});
