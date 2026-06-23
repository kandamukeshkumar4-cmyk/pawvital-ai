import type { DetectedSignal } from "./types";

export interface FollowupPlan {
  signal_key: string;
  prompt: string;
  due_at: string;
}

const DEFAULT_DUE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Pure planner: given signals from detectDogBrainSignals, return only
 * watch/alert follow-up plans. Server owns due_at and prompt.
 * Medication signal is restricted to better/same/worse/side effects phrasing.
 * No diagnosis language, no dosing, no supplement recommendations.
 */
export function planFollowupsForSignals(params: {
  userId: string;
  petId: string;
  signals: DetectedSignal[];
  now?: Date;
}): FollowupPlan[] {
  const now = params.now ?? new Date();
  const dueAt = new Date(now.getTime() + DEFAULT_DUE_MS).toISOString();

  const actionable = params.signals.filter(
    (s) => s.severity === "watch" || s.severity === "alert",
  );

  return actionable.map((s) => {
    const prompt =
      s.signal_type === "possible_med_side_effect"
        ? `${s.owner_message} Is it better, the same, worse, or any side effects?`
        : `${s.owner_message} Is it better, the same, or worse today?`;

    return {
      signal_key: s.signal_type,
      prompt,
      due_at: dueAt,
    };
  });
}
