import {
  SYMPTOM_CHAT_MAX_DURATION_SEC,
  TURN_DEADLINE_SAFETY_MS,
  TURN_STAGE_ESTIMATE_MS,
  appendServiceTimeoutToSession,
  createTurnDeadline,
  resolveOwnerVisiblePhrasingDeadline,
} from "@/lib/symptom-chat/turn-deadline";
import { TEXT_ONLY_QUESTION_PHRASING_BUDGET_MS } from "@/lib/symptom-chat/question-phrasing";
import type { TriageSession } from "@/lib/triage-engine";

describe("turn-deadline", () => {
  it("allocates route budget minus safety buffer", () => {
    const startedAtMs = 1_000;
    const deadline = createTurnDeadline(startedAtMs);

    expect(deadline.budgetMs).toBe(
      SYMPTOM_CHAT_MAX_DURATION_SEC * 1000 - TURN_DEADLINE_SAFETY_MS
    );
    expect(deadline.deadlineAtMs).toBe(startedAtMs + deadline.budgetMs);
  });

  it("rejects optional stages when remaining budget is too small", () => {
    const startedAtMs = 10_000;
    const deadline = createTurnDeadline(startedAtMs);
    const now =
      startedAtMs +
      deadline.budgetMs -
      TURN_STAGE_ESTIMATE_MS.minimax_compression +
      1;

    expect(deadline.canAffordStage("minimax_compression", now)).toBe(false);
    expect(deadline.canAffordStage("llama_phrasing", now)).toBe(false);
  });

  it("uses the tighter of route deadline and text phrasing budget", () => {
    const startedAtMs = 100_000;
    const deadline = createTurnDeadline(startedAtMs);
    const now = startedAtMs + 50_000;

    const resolved = resolveOwnerVisiblePhrasingDeadline(false, deadline, now);
    expect(resolved).toBe(
      Math.min(deadline.deadlineAtMs, now + TEXT_ONLY_QUESTION_PHRASING_BUDGET_MS)
    );
  });

  it("appends service timeout records without leaking past the cap", () => {
    const session = {
      case_memory: {
        service_timeouts: Array.from({ length: 10 }, (_, index) => ({
          service: "test",
          stage: `stage-${index}`,
          reason: "timeout",
        })),
      },
    } as unknown as TriageSession;

    const updated = appendServiceTimeoutToSession(session, {
      service: "minimax-memory",
      stage: "minimax_compression",
      reason: "turn-deadline",
    });

    expect(updated.case_memory?.service_timeouts).toHaveLength(10);
    expect(updated.case_memory?.service_timeouts.at(-1)).toEqual({
      service: "minimax-memory",
      stage: "minimax_compression",
      reason: "turn-deadline",
    });
  });
});
