/**
 * Unit tests for the pure Dog Brain summary mapper.
 * Covers normal (empty) and abnormal (with created) cases.
 */
import { toDogBrainSummary } from "@/app/api/health-log/route";
import type { RunBrainLoopResult } from "@/lib/dog-brain/run-brain-loop";

describe("toDogBrainSummary", () => {
  it("maps normal/empty loop result to zero counts and stable state", () => {
    const loop: RunBrainLoopResult = {
      state: "stable",
      signals: [],
      createdFollowups: [],
      dedupedFollowups: [],
      errors: [],
    };
    const summary = toDogBrainSummary(loop);
    expect(summary).toEqual({
      state: "stable",
      signal_count: 0,
      created_followups: 0,
      deduped_followups: 0,
    });
  });

  it("maps abnormal result with created follow-up to matching counts", () => {
    const loop: RunBrainLoopResult = {
      state: "watch",
      signals: [{ signal_type: "stool_change", severity: "watch" }],
      createdFollowups: [{ id: "fu-1", signal_key: "stool_change" }],
      dedupedFollowups: [],
      errors: [],
    };
    const summary = toDogBrainSummary(loop);
    expect(summary).toEqual({
      state: "watch",
      signal_count: 1,
      created_followups: 1,
      deduped_followups: 0,
    });
  });
});
