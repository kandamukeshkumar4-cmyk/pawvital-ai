/**
 * Immediate owner email delivery for URGENT / EMERGENCY triage reports.
 *
 * When a high-urgency notification is created, this module attempts an
 * immediate single-report email to the pet owner via the existing
 * Resend-backed sendEmail() transport, and records the outcome on the
 * notification row using the shared notification-delivery state machine.
 *
 * Rules:
 * - No medical decisions are made here. Only strings produced upstream are
 *   rendered; no urgency/triage logic is computed.
 * - Email failure must never throw into the caller (report pipeline /
 *   notification handler). All work is wrapped and failures are recorded as
 *   `failed` delivery state, logged internally only.
 * - No-ops cleanly when RESEND_API_KEY is unset (sendEmail returns
 *   { sent: false }); delivery is recorded as failed-but-not-dead-lettered so
 *   the digest path can still pick it up.
 * - Respects owner notification preferences: skips when email_digest is
 *   explicitly false or urgency_alerts is explicitly false. Sends by default
 *   for urgent reports when preferences are absent.
 */

import { getServiceSupabase } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import {
  getNotificationDeliveryState,
  withNotificationDeliveryState,
  type NotificationDeliveryState,
} from "@/lib/notification-delivery";

const BRAND_COLOR = "#4f46e5";
const URGENT_COLOR = "#dc2626";
const BRAND_NAME = "PawVital";
const DASHBOARD_URL = "https://app.pawvital.ai/dashboard";

export type UrgentEmailUrgency = "emergency" | "high";

export interface UrgentOwnerEmailInput {
  /** Notification row id to record delivery state against. */
  notificationId: string;
  /** Owner (auth user) id used to look up email + preferences. */
  userId: string;
  urgency: UrgentEmailUrgency;
  petName: string;
  /** Concise one-line owner-facing message (already produced upstream). */
  ownerMessage: string;
  /** Recommended next step string (already produced upstream). */
  recommendedAction?: string | null;
  /** Optional report storage id for a deep link to the report. */
  reportStorageId?: string | null;
}

export interface UrgentOwnerEmailResult {
  status: "skipped" | "sent" | "failed";
  reason?: string;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urgencyLabel(urgency: UrgentEmailUrgency): string {
  return urgency === "emergency" ? "Emergency" : "Urgent";
}

export function buildUrgentEmailSubject(
  petName: string,
  urgency: UrgentEmailUrgency
): string {
  const label = urgency === "emergency" ? "emergency" : "urgent";
  const name = petName?.trim() || "your dog";
  return `${BRAND_NAME}: ${label} guidance for ${name}`;
}

export function buildUrgentEmailHtml(input: {
  petName: string;
  urgency: UrgentEmailUrgency;
  ownerMessage: string;
  recommendedAction?: string | null;
  reportUrl: string;
}): string {
  const name = escapeHtml(input.petName?.trim() || "your dog");
  const label = escapeHtml(urgencyLabel(input.urgency));
  const message = escapeHtml(input.ownerMessage);
  const action = input.recommendedAction
    ? escapeHtml(input.recommendedAction)
    : "";
  const url = encodeURI(input.reportUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${BRAND_NAME} ${label} guidance</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <tr>
            <td style="background:${URGENT_COLOR};padding:24px 32px;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.85);">${label} guidance</p>
              <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">${name} may need attention</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#374151;">${message}</p>
              ${
                action
                  ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#111827;"><strong>Recommended next step:</strong> ${action}</p>`
                  : ""
              }
              <table cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
                <tr>
                  <td style="border-radius:6px;background:${BRAND_COLOR};">
                    <a href="${url}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">View full report</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
                ${BRAND_NAME} does not replace professional veterinary care. If this is an
                emergency, contact your veterinarian or an emergency clinic right away.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface OwnerEmailPreferences {
  email: string | null;
  emailDigest: boolean;
  urgencyAlerts: boolean;
}

async function resolveOwnerEmailPreferences(
  supabase: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string
): Promise<OwnerEmailPreferences> {
  let email: string | null = null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const candidate = data?.user?.email;
    email = typeof candidate === "string" && candidate.includes("@") ? candidate : null;
  } catch (error) {
    console.error("[UrgentEmail] Failed to resolve owner email:", error);
  }

  // Preferences are optional. Absent rows default to sending for urgent.
  let emailDigest = true;
  let urgencyAlerts = true;
  try {
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("email_digest, urgency_alerts")
      .eq("user_id", userId)
      .maybeSingle();

    if (prefs) {
      emailDigest = prefs.email_digest !== false;
      urgencyAlerts = prefs.urgency_alerts !== false;
    }
  } catch (error) {
    console.error("[UrgentEmail] Failed to read notification preferences:", error);
  }

  return { email, emailDigest, urgencyAlerts };
}

async function persistUrgentDeliveryState(
  supabase: NonNullable<ReturnType<typeof getServiceSupabase>>,
  notificationId: string,
  userId: string,
  existingMetadata: Record<string, unknown> | null,
  patch: Partial<NotificationDeliveryState>
): Promise<void> {
  try {
    const metadata = withNotificationDeliveryState(existingMetadata, patch);
    const { error } = await supabase
      .from("notifications")
      .update({ metadata })
      .eq("id", notificationId)
      .eq("user_id", userId);
    if (error) {
      console.error("[UrgentEmail] Failed to persist delivery state:", error);
    }
  } catch (error) {
    console.error("[UrgentEmail] Failed to persist delivery state:", error);
  }
}

/**
 * Attempt an immediate urgent owner email and record the delivery outcome.
 *
 * Always resolves (never rejects). Returns a small status object for internal
 * use/telemetry — callers must not surface this to the user-facing payload.
 */
export async function deliverUrgentOwnerEmail(
  input: UrgentOwnerEmailInput,
  existingMetadata: Record<string, unknown> | null = null
): Promise<UrgentOwnerEmailResult> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return { status: "skipped", reason: "supabase_unconfigured" };
  }

  try {
    const { email, emailDigest, urgencyAlerts } =
      await resolveOwnerEmailPreferences(supabase, input.userId);

    if (!emailDigest || !urgencyAlerts) {
      return { status: "skipped", reason: "owner_opted_out" };
    }

    if (!email) {
      return { status: "skipped", reason: "no_owner_email" };
    }

    const reportUrl = input.reportStorageId
      ? `${DASHBOARD_URL}?report=${encodeURIComponent(input.reportStorageId)}`
      : DASHBOARD_URL;

    const subject = buildUrgentEmailSubject(input.petName, input.urgency);
    const html = buildUrgentEmailHtml({
      petName: input.petName,
      urgency: input.urgency,
      ownerMessage: input.ownerMessage,
      recommendedAction: input.recommendedAction,
      reportUrl,
    });

    const priorAttempts = getNotificationDeliveryState(existingMetadata).attempts;
    const attempts = priorAttempts + 1;
    const nowIso = new Date().toISOString();

    let result: { sent: boolean; id?: string };
    try {
      result = await sendEmail({ to: email, subject, html });
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : "send_failed";
      console.error("[UrgentEmail] sendEmail threw:", sendError);
      await persistUrgentDeliveryState(
        supabase,
        input.notificationId,
        input.userId,
        existingMetadata,
        {
          status: "failed",
          attempts,
          last_attempt_at: nowIso,
          delivered_at: null,
          confirmation_id: null,
          last_error: message,
          dead_lettered: false,
        }
      );
      return { status: "failed", reason: message };
    }

    if (result.sent) {
      await persistUrgentDeliveryState(
        supabase,
        input.notificationId,
        input.userId,
        existingMetadata,
        {
          status: "sent",
          attempts,
          last_attempt_at: nowIso,
          delivered_at: nowIso,
          confirmation_id: result.id ?? null,
          last_error: null,
          dead_lettered: false,
        }
      );
      return { status: "sent" };
    }

    // sendEmail no-op (RESEND_API_KEY unset) or non-OK Resend response.
    // Record as failed but NOT dead-lettered, so the digest path can retry.
    await persistUrgentDeliveryState(
      supabase,
      input.notificationId,
      input.userId,
      existingMetadata,
      {
        status: "failed",
        attempts,
        last_attempt_at: nowIso,
        delivered_at: null,
        confirmation_id: null,
        last_error: "email_not_sent",
        dead_lettered: false,
      }
    );
    return { status: "failed", reason: "email_not_sent" };
  } catch (error) {
    // Defensive: nothing in here may throw into the caller.
    console.error("[UrgentEmail] Unexpected failure:", error);
    return { status: "failed", reason: "unexpected_error" };
  }
}
