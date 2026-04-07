const RESEND_API = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
};

/**
 * Sends email via Resend. No-ops (returns { sent: false }) when RESEND_API_KEY is missing.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false };
  }

  const from =
    input.from ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "PawVital <onboarding@resend.dev>";

  const to = Array.isArray(input.to) ? input.to : [input.to];
  if (to.length === 0 || !to[0]) {
    return { sent: false };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[email] Resend error:", res.status, text);
      return { sent: false };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: data.id };
  } catch (e) {
    console.error("[email] Resend request failed:", e);
    return { sent: false };
  }
}
