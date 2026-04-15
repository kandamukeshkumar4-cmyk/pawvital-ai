export type NotificationDeliveryStatus = "pending" | "sent" | "failed";

export interface NotificationDeliveryState {
  status: NotificationDeliveryStatus;
  attempts: number;
  last_attempt_at: string | null;
  delivered_at: string | null;
  confirmation_id: string | null;
  last_error: string | null;
  dead_lettered: boolean;
}

type NotificationMetadata = Record<string, unknown> | null | undefined;

const DEFAULT_DELIVERY_STATE: NotificationDeliveryState = {
  status: "pending",
  attempts: 0,
  last_attempt_at: null,
  delivered_at: null,
  confirmation_id: null,
  last_error: null,
  dead_lettered: false,
};

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getNotificationDeliveryState(
  metadata: NotificationMetadata
): NotificationDeliveryState {
  if (!isRecord(metadata) || !isRecord(metadata.delivery)) {
    return { ...DEFAULT_DELIVERY_STATE };
  }

  return {
    status:
      metadata.delivery.status === "sent" || metadata.delivery.status === "failed"
        ? metadata.delivery.status
        : "pending",
    attempts:
      typeof metadata.delivery.attempts === "number"
        ? metadata.delivery.attempts
        : 0,
    last_attempt_at:
      typeof metadata.delivery.last_attempt_at === "string"
        ? metadata.delivery.last_attempt_at
        : null,
    delivered_at:
      typeof metadata.delivery.delivered_at === "string"
        ? metadata.delivery.delivered_at
        : null,
    confirmation_id:
      typeof metadata.delivery.confirmation_id === "string"
        ? metadata.delivery.confirmation_id
        : null,
    last_error:
      typeof metadata.delivery.last_error === "string"
        ? metadata.delivery.last_error
        : null,
    dead_lettered: metadata.delivery.dead_lettered === true,
  };
}

export function withNotificationDeliveryState(
  metadata: NotificationMetadata,
  patch: Partial<NotificationDeliveryState>
): Record<string, unknown> {
  const base = isRecord(metadata) ? metadata : {};

  return {
    ...base,
    delivery: {
      ...getNotificationDeliveryState(base),
      ...patch,
    },
  };
}

export function isPendingNotificationDelivery(
  metadata: NotificationMetadata
): boolean {
  return getNotificationDeliveryState(metadata).status !== "sent";
}
