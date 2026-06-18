/**
 * Notification handler — subscribes to the event bus and persists
 * notifications to Supabase.
 *
 * Rules:
 * - All DB operations are non-fatal (failures are logged, not re-thrown)
 * - Uses the service-role client so inserts bypass RLS
 * - Medical decisions are never made here
 * - Call registerNotificationHandlers() once at app startup
 */

import { on, EventType } from "./event-bus";
import { getServiceSupabase } from "@/lib/supabase-admin";
import { withNotificationDeliveryState } from "@/lib/notification-delivery";
import {
  deliverUrgentOwnerEmail,
  type UrgentEmailUrgency,
} from "@/lib/urgent-email";

type NotificationRow = {
  user_id: string;
  type: "report_ready" | "urgency_alert" | "outcome_reminder" | "subscription" | "system";
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
};

interface InsertedNotification {
  id: string;
  metadata: Record<string, unknown>;
}

async function insertNotification(
  row: NotificationRow
): Promise<InsertedNotification | null> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    // Supabase not configured (dev/demo mode) — skip silently
    return null;
  }

  const metadata = withNotificationDeliveryState(row.metadata, {
    status: "pending",
    attempts: 0,
    dead_lettered: false,
    last_attempt_at: null,
    delivered_at: null,
    confirmation_id: null,
    last_error: null,
  });

  const { data, error } = await supabase
    .from("notifications")
    .insert({ ...row, metadata })
    .select("id")
    .single();

  if (error) {
    console.error("[NotificationHandler] Failed to insert notification:", error);
    return null;
  }

  const id = typeof data?.id === "string" ? data.id : null;
  return id ? { id, metadata } : null;
}

function isHighUrgency(urgency: unknown): urgency is UrgentEmailUrgency {
  return urgency === "emergency" || urgency === "high";
}

/**
 * Attempt immediate urgent owner email for a freshly-inserted high-urgency
 * notification. Non-fatal: failures are recorded as delivery state and never
 * re-thrown into the event/report path.
 */
async function maybeSendUrgentEmail(
  inserted: InsertedNotification | null,
  input: {
    userId: string;
    urgency: UrgentEmailUrgency;
    petName: string;
    ownerMessage: string;
    recommendedAction?: string | null;
    reportStorageId?: string | null;
  }
): Promise<void> {
  if (!inserted) {
    return;
  }
  try {
    await deliverUrgentOwnerEmail(
      { notificationId: inserted.id, ...input },
      inserted.metadata
    );
  } catch (error) {
    // deliverUrgentOwnerEmail is designed never to throw; guard anyway.
    console.error("[NotificationHandler] Urgent email delivery failed:", error);
  }
}

function registerNotificationHandlers(): void {
  on(EventType.REPORT_READY, async (payload) => {
    await insertNotification({
      user_id: payload.userId,
      type: "report_ready",
      title: `Report ready for ${payload.petName}`,
      body: `Your triage report is ready. Urgency level: ${payload.urgency}.`,
      metadata: {
        sessionId: payload.sessionId,
        reportStorageId: payload.reportStorageId,
        urgency: payload.urgency,
      },
    });
    // Immediate urgent owner email is driven by the URGENCY_HIGH event, which
    // the report pipeline always co-emits for high/emergency reports. Sending
    // here too would double-email the owner, so REPORT_READY stays in-app only.
  });

  on(EventType.URGENCY_HIGH, async (payload) => {
    const inserted = await insertNotification({
      user_id: payload.userId,
      type: "urgency_alert",
      title: `Urgent: ${payload.petName} needs attention`,
      body: `Triage indicates ${payload.urgency} urgency. Top differential: ${payload.topDiagnosis}.`,
      metadata: {
        sessionId: payload.sessionId,
        urgency: payload.urgency,
        topDiagnosis: payload.topDiagnosis,
      },
    });

    if (isHighUrgency(payload.urgency)) {
      await maybeSendUrgentEmail(inserted, {
        userId: payload.userId,
        urgency: payload.urgency,
        petName: payload.petName,
        ownerMessage: `Triage indicates ${payload.urgency} urgency for ${payload.petName}. Top differential: ${payload.topDiagnosis}.`,
        recommendedAction:
          payload.urgency === "emergency"
            ? "Contact your veterinarian or an emergency clinic right away."
            : "Arrange a veterinary visit as soon as possible.",
        reportStorageId: payload.reportStorageId ?? null,
      });
    }
  });

  on(EventType.OUTCOME_REQUESTED, async (payload) => {
    const petLabel = payload.petName || "your pet";
    await insertNotification({
      user_id: payload.userId,
      type: "outcome_reminder",
      title: `How is ${petLabel} doing?`,
      body: "Please let us know the outcome of your vet visit to help improve PawVital's accuracy.",
      metadata: {
        checkId: payload.checkId,
      },
    });
  });

  on(EventType.SUBSCRIPTION_CHANGED, async (payload) => {
    await insertNotification({
      user_id: payload.userId,
      type: "subscription",
      title: "Your subscription has been updated",
      body: `Plan changed from ${payload.previousPlan} to ${payload.plan}.`,
      metadata: {
        plan: payload.plan,
        previousPlan: payload.previousPlan,
      },
    });
  });

  on(EventType.PET_ADDED, async (payload) => {
    await insertNotification({
      user_id: payload.userId,
      type: "system",
      title: `${payload.petName} added to your profile`,
      body: "Your new pet has been added. Start a triage session any time.",
      metadata: {
        petId: payload.petId,
      },
    });
  });
}

// Auto-register when this module is imported
registerNotificationHandlers();

export { registerNotificationHandlers };
