import {
  extractHistoricalOutcomeFeedback,
  parseAiResponseRecord,
} from "@/lib/outcome-feedback-backfill";

describe("historical outcome feedback backfill helpers", () => {
  it("parses snake_case legacy outcome feedback payloads", () => {
    const historical = extractHistoricalOutcomeFeedback(
      "check-1",
      JSON.stringify({
        title: "Ear pain",
        outcome_feedback: {
          matched_expectation: "no",
          confirmed_diagnosis: "otitis media",
          vet_outcome: "sedated exam and meds",
          owner_notes: "Required a deeper exam",
          submitted_at: "2026-04-01T10:15:00.000Z",
        },
      })
    );

    expect(historical?.feedback).toEqual(
      expect.objectContaining({
        symptomCheckId: "check-1",
        matchedExpectation: "no",
        confirmedDiagnosis: "otitis media",
        vetOutcome: "sedated exam and meds",
        ownerNotes: "Required a deeper exam",
      })
    );
    expect(historical?.submittedAt).toBe("2026-04-01T10:15:00.000Z");
    expect(historical?.report.title).toBe("Ear pain");
  });

  it("parses camelCase feedback payloads and normalizes partial matches", () => {
    const historical = extractHistoricalOutcomeFeedback("check-2", {
      title: "Vomiting",
      outcomeFeedback: {
        matchedExpectation: "partial",
        confirmedDiagnosis: "dietary indiscretion",
        ownerNotes: "Improved with bland diet",
      },
    });

    expect(historical?.feedback).toEqual(
      expect.objectContaining({
        symptomCheckId: "check-2",
        matchedExpectation: "partly",
        confirmedDiagnosis: "dietary indiscretion",
        ownerNotes: "Improved with bland diet",
      })
    );
    expect(new Date(String(historical?.submittedAt)).toISOString()).toBe(
      historical?.submittedAt
    );
  });

  it("returns null for invalid ai_response payloads", () => {
    expect(parseAiResponseRecord("{not-json")).toBeNull();
    expect(extractHistoricalOutcomeFeedback("check-3", { foo: "bar" })).toBeNull();
    expect(
      extractHistoricalOutcomeFeedback("check-4", {
        outcome_feedback: { matched_expectation: "maybe" },
      })
    ).toBeNull();
  });
});
