import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds a simple daily digest email body for a user (pets + active reminders).
 */
export async function buildEmailDigest(
  supabase: SupabaseClient,
  userId: string
): Promise<{ subject: string; html: string } | null> {
  const [{ data: profile }, { data: pets }, { data: reminders }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    supabase.from("pets").select("name, species").eq("user_id", userId).limit(10),
    supabase
      .from("reminders")
      .select("title, next_due, type")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("next_due", { ascending: true })
      .limit(8),
  ]);

  const name = profile?.full_name?.trim() || "there";
  const petLines =
    pets && pets.length > 0
      ? pets.map((p) => `<li>${escapeHtml(p.name)} (${escapeHtml(p.species || "pet")})</li>`).join("")
      : "<li>No pets on file yet — add one in PawVital.</li>";

  const reminderLines =
    reminders && reminders.length > 0
      ? reminders
          .map((r) => {
            const due = r.next_due
              ? new Date(r.next_due).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "Soon";
            return `<li><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.type || "reminder")} · ${escapeHtml(due)}</li>`;
          })
          .join("")
      : "<li>No upcoming reminders. You&apos;re all caught up.</li>";

  const subject = "Your PawVital daily digest";
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111827;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Here&apos;s a quick snapshot from PawVital.</p>
  <h2 style="font-size: 16px;">Your pets</h2>
  <ul>${petLines}</ul>
  <h2 style="font-size: 16px;">Upcoming reminders</h2>
  <ul>${reminderLines}</ul>
  <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">
    You received this because daily digest is enabled in your notification settings.
  </p>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
