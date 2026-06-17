import type { ServiceBusSafePayload } from "@/lib/azure/service-bus";

// =============================================================================
// Async symptom-chat turn — Service Bus job reference contract.
//
// The Service Bus queue is privacy-guarded (see hasUnsafeServiceBusPayload): it
// MUST NOT carry conversation content, pet identity, images, or symptoms. So an
// async turn enqueues only this small reference of safe IDs. The actual turn
// input (messages/pet/image/session) lives in durable Blob storage keyed by
// jobId; the worker loads it from there. See async-turn-store.ts.
// =============================================================================

export const SYMPTOM_CHAT_TURN_JOB_TYPE = "symptom-chat-turn" as const;

export type SymptomChatTurnAction = "chat" | "generate_report";

export type SymptomChatTurnJobRef = {
  action: SymptomChatTurnAction;
  jobId: string;
  sessionId: string;
  userId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Mirrors SAFE_USER_ID_PATTERN in web-pubsub.ts so a ref that survives this
// guard is always publishable to the per-user Web PubSub channel.
const USER_ID_PATTERN = /^[A-Za-z0-9:_@.-]{1,128}$/;

function isSymptomChatTurnAction(value: unknown): value is SymptomChatTurnAction {
  return value === "chat" || value === "generate_report";
}

export function isSymptomChatTurnJobRef(
  value: unknown
): value is SymptomChatTurnJobRef {
  if (!value || typeof value !== "object") {
    return false;
  }

  const ref = value as Partial<SymptomChatTurnJobRef>;
  return (
    typeof ref.jobId === "string" &&
    UUID_PATTERN.test(ref.jobId) &&
    typeof ref.sessionId === "string" &&
    UUID_PATTERN.test(ref.sessionId) &&
    typeof ref.userId === "string" &&
    USER_ID_PATTERN.test(ref.userId) &&
    isSymptomChatTurnAction(ref.action)
  );
}

/**
 * Flatten a validated job ref into a Service Bus payload. Every field is a short
 * ID/enum, so the result passes hasUnsafeServiceBusPayload by construction.
 */
export function toServiceBusJobPayload(
  ref: SymptomChatTurnJobRef
): ServiceBusSafePayload {
  return {
    action: ref.action,
    jobId: ref.jobId,
    sessionId: ref.sessionId,
    userId: ref.userId,
  };
}
