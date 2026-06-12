import {
  getOptionalExternalStageTimeoutMs,
  getMandatoryModelTimeoutMs,
  shouldSkipOptionalModelStage,
} from "@/lib/symptom-chat/turn-budget";

describe("symptom chat turn budget", () => {
  it("caps mandatory model timeouts to the remaining route budget", () => {
    const nowMs = 10_000;

    expect(
      getMandatoryModelTimeoutMs(
        {
          startedAtMs: 0,
          deadlineAtMs: nowMs + 5_000,
        },
        45_000,
        nowMs
      )
    ).toBe(4_000);
  });

  it("keeps mandatory calls attempted even after the route budget is exhausted", () => {
    expect(
      getMandatoryModelTimeoutMs(
        {
          startedAtMs: 0,
          deadlineAtMs: 10_000,
        },
        45_000,
        11_000
      )
    ).toBe(1);
  });

  it("skips optional stages when their estimate no longer fits", () => {
    const nowMs = 10_000;

    expect(
      shouldSkipOptionalModelStage(
        {
          startedAtMs: 0,
          deadlineAtMs: nowMs + 2_000,
        },
        "question_phrasing",
        nowMs
      )
    ).toBe(true);
  });

  it("returns null for optional external stages when only the safety tail remains", () => {
    const nowMs = 10_000;

    expect(
      getOptionalExternalStageTimeoutMs(
        {
          startedAtMs: 0,
          deadlineAtMs: nowMs + 500,
        },
        5_000,
        nowMs
      )
    ).toBeNull();
  });

  it("caps optional external stage timeouts to the remaining route budget", () => {
    const nowMs = 10_000;

    expect(
      getOptionalExternalStageTimeoutMs(
        {
          startedAtMs: 0,
          deadlineAtMs: nowMs + 2_000,
        },
        5_000,
        nowMs
      )
    ).toBe(1_250);
  });
});
