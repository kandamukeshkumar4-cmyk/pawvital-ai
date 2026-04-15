/**
 * Email digest builder for PawVital notifications.
 *
 * Builds structured email payloads from unread notifications.
 * Does NOT send email — the transport layer (Resend/SendGrid) is a
 * separate future integration.
 *
 * Rules:
 * - No medical decisions are made here
 * - HTML is inline-styled for maximum email-client compatibility
 * - All DB access uses the service-role client
 */

import { getServiceSupabase } from "@/lib/supabase-admin";
import {
  isPendingNotificationDelivery,
  type NotificationDeliveryState,
  withNotificationDeliveryState,
} from "@/lib/notification-delivery";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestNotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
  notificationCount: number;
  notificationIds: string[];
}

export interface DigestTransportResult {
  confirmationId?: string | null;
}

export type DigestTransport = (
  digest: DigestEmail
) => Promise<DigestTransportResult | void>;

export interface DigestDeliveryResult {
  status: "skipped" | "sent" | "failed";
  attempts: number;
  notificationCount: number;
  deadLettered: boolean;
  lastError: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

const DIGEST_FREQUENCY_WINDOW: Record<string, number> = {
  daily: MS_PER_DAY,
  weekly: MS_PER_WEEK,
  never: 0,
};
const DIGEST_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

const BRAND_COLOR = "#4f46e5";
const BRAND_NAME = "PawVital";

interface DigestNotificationRecord extends DigestNotificationItem {
  metadata: Record<string, unknown>;
}

interface PreparedDigest {
  digest: DigestEmail;
  notifications: DigestNotificationRecord[];
}

// ── HTML generator ────────────────────────────────────────────────────────────

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function notificationItemHtml(item: DigestNotificationItem): string {
  const title = escapeHtml(item.title);
  const body = item.body ? escapeHtml(item.body) : "";
  const date = escapeHtml(formatDate(item.created_at));

  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#111827;">${title}</p>
        ${body ? `<p style="margin:0 0 4px;font-size:14px;color:#374151;">${body}</p>` : ""}
        <p style="margin:0;font-size:12px;color:#9ca3af;">${date}</p>
      </td>
    </tr>`;
}

export function generateDigestHtml(
  notifications: DigestNotificationItem[]
): string {
  const items = notifications.map(notificationItemHtml).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${BRAND_NAME} Digest</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <tr>
            <td style="background:${BRAND_COLOR};padding:24px 32px;">
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${BRAND_NAME}</h1>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.75);">Your notification digest</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <p style="margin:0 0 20px;font-size:15px;color:#374151;">
                You have <strong>${notifications.length}</strong> new notification${notifications.length === 1 ? "" : "s"} since your last digest.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${items}
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
                To change your email preferences, visit your
                <a href="https://app.pawvital.ai/settings" style="color:${BRAND_COLOR};">notification settings</a>.
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

function generateDigestText(
  notifications: DigestNotificationItem[]
): string {
  const lines = notifications.map((n) => {
    const date = formatDate(n.created_at);
    const body = n.body ? `\n  ${n.body}` : "";
    return `• ${n.title}${body}\n  ${date}`;
  });

  return [
    `${BRAND_NAME} — Your Notification Digest`,
    `${"─".repeat(40)}`,
    `You have ${notifications.length} new notification${notifications.length === 1 ? "" : "s"}:`,
    "",
    ...lines,
    "",
    "To update preferences: https://app.pawvital.ai/settings",
  ].join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDigestError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown digest delivery failure";
}

async function prepareDigestForUser(
  userId: string
): Promise<PreparedDigest | null> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return null;
  }

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("email_digest, digest_frequency")
    .eq("user_id", userId)
    .maybeSingle();

  const emailDigest = prefs?.email_digest ?? true;
  const digestFrequency: string = prefs?.digest_frequency ?? "daily";

  if (!emailDigest || digestFrequency === "never") {
    return null;
  }

  const windowMs = DIGEST_FREQUENCY_WINDOW[digestFrequency] ?? MS_PER_DAY;
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, created_at, metadata")
    .eq("user_id", userId)
    .eq("read", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[EmailDigest] Failed to fetch notifications:", error);
    return null;
  }

  const pendingNotifications = ((notifications ?? []) as DigestNotificationRecord[])
    .map((notification) => ({
      ...notification,
      metadata:
        notification.metadata &&
        typeof notification.metadata === "object" &&
        !Array.isArray(notification.metadata)
          ? notification.metadata
          : {},
    }))
    .filter((notification) => isPendingNotificationDelivery(notification.metadata));

  if (pendingNotifications.length === 0) {
    return null;
  }

  const count = pendingNotifications.length;
  const subject =
    count === 1
      ? `${BRAND_NAME}: 1 new notification`
      : `${BRAND_NAME}: ${count} new notifications`;

  return {
    digest: {
      subject,
      html: generateDigestHtml(pendingNotifications),
      text: generateDigestText(pendingNotifications),
      notificationCount: count,
      notificationIds: pendingNotifications.map((item) => item.id),
    },
    notifications: pendingNotifications,
  };
}

async function persistDigestDeliveryState(
  userId: string,
  notifications: DigestNotificationRecord[],
  patch: Partial<NotificationDeliveryState>
): Promise<void> {
  if (notifications.length === 0) {
    return;
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return;
  }

  await Promise.all(
    notifications.map(async (notification) => {
      const metadata = withNotificationDeliveryState(
        notification.metadata,
        patch
      );

      const { error } = await supabase
        .from("notifications")
        .update({ metadata })
        .eq("id", notification.id)
        .eq("user_id", userId);

      if (error) {
        console.error(
          "[EmailDigest] Failed to persist digest delivery state:",
          error
        );
      }
    })
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a digest email for a user based on their unread notifications
 * within their preferred time window.
 *
 * Returns null when Supabase is unconfigured or there are no notifications.
 */
export async function buildDigestForUser(
  userId: string
): Promise<DigestEmail | null> {
  const prepared = await prepareDigestForUser(userId);
  return prepared?.digest ?? null;
}

export async function deliverDigestForUser(
  userId: string,
  transport: DigestTransport,
  wait: (ms: number) => Promise<void> = sleep
): Promise<DigestDeliveryResult> {
  const prepared = await prepareDigestForUser(userId);
  if (!prepared) {
    return {
      status: "skipped",
      attempts: 0,
      notificationCount: 0,
      deadLettered: false,
      lastError: null,
    };
  }

  let attempt = 0;
  let lastError: string | null = null;

  while (attempt <= DIGEST_RETRY_DELAYS_MS.length) {
    attempt += 1;

    try {
      const result = await transport(prepared.digest);
      const deliveredAt = new Date().toISOString();

      await persistDigestDeliveryState(userId, prepared.notifications, {
        status: "sent",
        attempts: attempt,
        last_attempt_at: deliveredAt,
        delivered_at: deliveredAt,
        confirmation_id: result?.confirmationId ?? null,
        last_error: null,
        dead_lettered: false,
      });

      return {
        status: "sent",
        attempts: attempt,
        notificationCount: prepared.digest.notificationCount,
        deadLettered: false,
        lastError: null,
      };
    } catch (error) {
      lastError = normalizeDigestError(error);

      if (attempt > DIGEST_RETRY_DELAYS_MS.length) {
        break;
      }

      await wait(DIGEST_RETRY_DELAYS_MS[attempt - 1]);
    }
  }

  await persistDigestDeliveryState(userId, prepared.notifications, {
    status: "failed",
    attempts: attempt,
    last_attempt_at: new Date().toISOString(),
    delivered_at: null,
    confirmation_id: null,
    last_error: lastError,
    dead_lettered: true,
  });

  return {
    status: "failed",
    attempts: attempt,
    notificationCount: prepared.digest.notificationCount,
    deadLettered: true,
    lastError,
  };
}
