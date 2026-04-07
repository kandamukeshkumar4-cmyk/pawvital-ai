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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

const DIGEST_FREQUENCY_WINDOW: Record<string, number> = {
  daily: MS_PER_DAY,
  weekly: MS_PER_WEEK,
  never: 0,
};

const BRAND_COLOR = "#4f46e5";
const BRAND_NAME = "PawVital";

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
  const supabase = getServiceSupabase();
  if (!supabase) {
    return null;
  }

  // Look up the user's digest frequency preference
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
    .select("id, type, title, body, created_at")
    .eq("user_id", userId)
    .eq("read", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[EmailDigest] Failed to fetch notifications:", error);
    return null;
  }

  if (!notifications || notifications.length === 0) {
    return null;
  }

  const items = notifications as DigestNotificationItem[];
  const count = items.length;
  const subject =
    count === 1
      ? `${BRAND_NAME}: 1 new notification`
      : `${BRAND_NAME}: ${count} new notifications`;

  return {
    subject,
    html: generateDigestHtml(items),
    text: generateDigestText(items),
    notificationCount: count,
  };
}
