/**
 * In-process event bus for PawVital internal events.
 *
 * Designed for future upgrade to Redis/BullMQ — keep payload types
 * JSON-serializable and handler signatures async-friendly.
 *
 * Rules:
 * - Handlers must not throw (wrap in try/catch internally)
 * - Emission must never block the request path
 * - No medical decisions are made here
 */

// ── Event types ─────────────────────────────────────────────────────────────

export const EventType = {
  REPORT_READY: "REPORT_READY",
  URGENCY_HIGH: "URGENCY_HIGH",
  OUTCOME_REQUESTED: "OUTCOME_REQUESTED",
  SUBSCRIPTION_CHANGED: "SUBSCRIPTION_CHANGED",
  PET_ADDED: "PET_ADDED",
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

// ── Payload types ────────────────────────────────────────────────────────────

export interface ReportReadyPayload {
  userId: string;
  sessionId: string;
  reportStorageId: string | null;
  urgency: string;
  petName: string;
}

export interface UrgencyHighPayload {
  userId: string;
  sessionId: string;
  urgency: "emergency" | "high";
  petName: string;
  topDiagnosis: string;
}

export interface OutcomeRequestedPayload {
  userId: string;
  checkId: string;
  petName: string;
}

export interface SubscriptionChangedPayload {
  userId: string;
  plan: string;
  previousPlan: string;
}

export interface PetAddedPayload {
  userId: string;
  petId: string;
  petName: string;
}

export type EventPayloadMap = {
  [EventType.REPORT_READY]: ReportReadyPayload;
  [EventType.URGENCY_HIGH]: UrgencyHighPayload;
  [EventType.OUTCOME_REQUESTED]: OutcomeRequestedPayload;
  [EventType.SUBSCRIPTION_CHANGED]: SubscriptionChangedPayload;
  [EventType.PET_ADDED]: PetAddedPayload;
};

export type EventPayload<T extends EventType> = EventPayloadMap[T];

// ── Handler type ─────────────────────────────────────────────────────────────

export type EventHandler<T extends EventType> = (
  payload: EventPayload<T>
) => void | Promise<void>;

type AnyHandler = EventHandler<EventType>;

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<EventType, Set<AnyHandler>>();

function getHandlers<T extends EventType>(type: T): Set<EventHandler<T>> {
  if (!registry.has(type)) {
    registry.set(type, new Set());
  }
  return registry.get(type) as Set<EventHandler<T>>;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Subscribe to an event type.
 * Returns an unsubscribe function for convenience.
 */
export function on<T extends EventType>(
  type: T,
  handler: EventHandler<T>
): () => void {
  getHandlers(type).add(handler);
  return () => off(type, handler);
}

/**
 * Unsubscribe a handler from an event type.
 */
export function off<T extends EventType>(
  type: T,
  handler: EventHandler<T>
): void {
  getHandlers(type).delete(handler);
}

/**
 * Emit an event. All registered handlers are called asynchronously.
 * Failures in individual handlers are caught and logged — emission
 * must never throw.
 */
export function emit<T extends EventType>(
  type: T,
  payload: EventPayload<T>
): void {
  const handlers = getHandlers(type);
  if (handlers.size === 0) {
    return;
  }

  for (const handler of handlers) {
    Promise.resolve()
      .then(() => handler(payload as EventPayload<typeof type>))
      .catch((err: unknown) => {
        console.error(`[EventBus] Handler error for ${type}:`, err);
      });
  }
}

/**
 * Remove all handlers for a given event type (used in tests).
 */
export function clearHandlers(type: EventType): void {
  registry.delete(type);
}

/**
 * Remove all handlers for all event types (used in tests).
 */
export function clearAllHandlers(): void {
  registry.clear();
}
