/**
 * Dog Brain loop analytics — privacy-safe usage events.
 *
 * Answers "is the Brain actually used, and do owners complete the loop?" without
 * ever logging clinical content. It is a thin, typed wrapper over the existing
 * App Insights sink (`@/lib/azure/telemetry`), whose `SafeEventName` /
 * `SafePropertyKey` allow-lists enforce the PII boundary at the type level.
 *
 * HARD PRIVACY CONTRACT (must never be violated):
 *  - NO free-text owner notes, NO raw symptom text, NO photo data, NO pet/owner
 *    names. Every field is either a bounded enum or a non-negative count.
 *  - Builder inputs are typed as enums/numbers only, so free text cannot enter
 *    structurally. Counts go through `measurements` (numeric), enums through the
 *    two allow-listed property keys (`questionSource`, `outcomeBucket`).
 *  - Emitting is a silent no-op without an App Insights connection string
 *    (demo mode / CI) and never throws — telemetry must not affect behavior.
 */

import {
  trackEvent,
  type SafeEventName,
  type TrackOptions,
  type TriageTelemetryEvent,
} from "@/lib/azure/telemetry";

/** Stable event names — counts/enums only. */
export const DOG_BRAIN_EVENTS = {
  contextLoaded: "dogbrain.context.loaded",
  questionTraceEmitted: "dogbrain.question_trace.emitted",
  emergencyTraceSuppressed: "dogbrain.question_trace.emergency_suppressed",
  followupCreated: "dogbrain.followup.created",
  followupOutcomeRecorded: "dogbrain.followup.outcome_recorded",
  supplementTrialStarted: "dogbrain.supplement_trial.started",
  supplementTrialMarkedActive: "dogbrain.supplement_trial.marked_active",
  supplementTrialOutcomeRecorded: "dogbrain.supplement_trial.outcome_recorded",
} as const satisfies Record<string, SafeEventName>;

/** Which selector branch produced the surfaced question (matches Phase 1). */
export type QuestionSource =
  | "complaint"
  | "brain_memory"
  | "pending_clarification"
  | "emergency"
  | "generic";

/** Bounded outcome vocabulary for follow-ups and supplement trials. */
export type OutcomeBucket = "better" | "same" | "worse" | "side_effect" | "unknown";

const QUESTION_SOURCES: ReadonlySet<QuestionSource> = new Set([
  "complaint",
  "brain_memory",
  "pending_clarification",
  "emergency",
  "generic",
]);

/** Coerce any raw outcome string into the bounded bucket vocabulary. */
export function toOutcomeBucket(raw: string | null | undefined): OutcomeBucket {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "better" || v === "improved" || v === "improving") return "better";
  if (v === "same" || v === "unchanged" || v === "no_change" || v === "stable") {
    return "same";
  }
  if (v === "worse" || v === "worsened" || v === "worsening") return "worse";
  if (v === "side_effect" || v === "side effect" || v === "adverse") {
    return "side_effect";
  }
  return "unknown";
}

/** Non-negative integer count (defensive — never a fractional or negative). */
function safeCount(n: number | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeSource(source: QuestionSource): QuestionSource {
  return QUESTION_SOURCES.has(source) ? source : "generic";
}

// ---------------------------------------------------------------------------
// Pure event builders — return the telemetry envelope without sending it. Tests
// assert these carry only enums/counts and never free text.
// ---------------------------------------------------------------------------

export function brainContextLoadedEvent(counts: {
  signalCount?: number;
  prioritySymptomCount?: number;
  followupCount?: number;
  supplementTrialCount?: number;
}): TriageTelemetryEvent {
  return {
    name: DOG_BRAIN_EVENTS.contextLoaded,
    measurements: {
      signalCount: safeCount(counts.signalCount),
      prioritySymptomCount: safeCount(counts.prioritySymptomCount),
      followupCount: safeCount(counts.followupCount),
      supplementTrialCount: safeCount(counts.supplementTrialCount),
    },
  };
}

export function brainQuestionTraceEmittedEvent(args: {
  source: QuestionSource;
  evidenceCount?: number;
}): TriageTelemetryEvent {
  return {
    name: DOG_BRAIN_EVENTS.questionTraceEmitted,
    properties: { questionSource: normalizeSource(args.source) },
    measurements: { evidenceCount: safeCount(args.evidenceCount) },
  };
}

export function emergencyTraceSuppressedEvent(): TriageTelemetryEvent {
  return {
    name: DOG_BRAIN_EVENTS.emergencyTraceSuppressed,
    properties: { questionSource: "emergency" },
  };
}

/**
 * Decide whether a turn should emit the emergency-suppressed trace event. Pure.
 *
 * True ONLY when an emergency response was actually returned this turn AND Dog
 * Brain memory with priority symptoms was loaded — i.e. a Brain question trace
 * COULD have been surfaced but the emergency pre-empted it — AND no Brain trace
 * was emitted. The route owns the inputs and calls this in its deferred
 * telemetry block; this never affects the emergency response itself.
 */
export function shouldEmitEmergencyTraceSuppressed(input: {
  emergencyResponseReturned: boolean;
  brainTraceWasEmitted: boolean;
  brainContextPrioritySymptomCount: number | null;
}): boolean {
  return (
    input.emergencyResponseReturned &&
    !input.brainTraceWasEmitted &&
    (input.brainContextPrioritySymptomCount ?? 0) > 0
  );
}

export function dogBrainFollowupCreatedEvent(): TriageTelemetryEvent {
  return { name: DOG_BRAIN_EVENTS.followupCreated };
}

export function dogBrainFollowupOutcomeRecordedEvent(args: {
  outcome: OutcomeBucket;
}): TriageTelemetryEvent {
  return {
    name: DOG_BRAIN_EVENTS.followupOutcomeRecorded,
    properties: { outcomeBucket: args.outcome },
  };
}

export function supplementTrialStartedEvent(): TriageTelemetryEvent {
  return { name: DOG_BRAIN_EVENTS.supplementTrialStarted };
}

export function supplementTrialMarkedActiveEvent(): TriageTelemetryEvent {
  return { name: DOG_BRAIN_EVENTS.supplementTrialMarkedActive };
}

export function supplementTrialOutcomeRecordedEvent(args: {
  outcome: OutcomeBucket;
}): TriageTelemetryEvent {
  return {
    name: DOG_BRAIN_EVENTS.supplementTrialOutcomeRecorded,
    properties: { outcomeBucket: args.outcome },
  };
}

// ---------------------------------------------------------------------------
// Emit — fire-and-forget through the shared sink. Silent no-op in demo mode.
// ---------------------------------------------------------------------------

/** Send a pre-built Dog Brain analytics event. Never throws. */
export function recordDogBrainEvent(
  event: TriageTelemetryEvent,
  options: TrackOptions = {},
): Promise<void> {
  return trackEvent(event, options);
}
