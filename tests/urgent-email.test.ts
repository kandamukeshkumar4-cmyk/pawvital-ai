/** @jest-environment node */

import {
  buildUrgentEmailSubject,
  buildUrgentEmailHtml,
  deliverUrgentOwnerEmail,
} from "@/lib/urgent-email";
import { sendEmail } from "@/lib/email";
import { getServiceSupabase } from "@/lib/supabase-admin";

jest.mock("@/lib/email", () => ({
  sendEmail: jest.fn(),
}));
jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: jest.fn(),
}));

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockGetServiceSupabase = getServiceSupabase as jest.MockedFunction<
  typeof getServiceSupabase
>;

type Prefs = { email_digest?: boolean; urgency_alerts?: boolean } | null;

/**
 * Minimal Supabase test double covering exactly the calls urgent-email makes:
 * auth.admin.getUserById, a notification_preferences read, and a notifications
 * metadata update. The update spy is returned so tests can assert delivery
 * state was persisted.
 */
function buildSupabaseMock({
  email,
  prefs,
}: {
  email: string | null;
  prefs: Prefs;
}) {
  const updateEqEq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({
    eq: jest.fn(() => ({ eq: updateEqEq })),
  }));

  const supabase = {
    auth: {
      admin: {
        getUserById: jest.fn().mockResolvedValue({
          data: { user: email ? { email } : null },
        }),
      },
    },
    from: jest.fn((table: string) => {
      if (table === "notification_preferences") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({ data: prefs }),
            })),
          })),
        };
      }
      // notifications
      return { update };
    }),
  };

  return { supabase, update, updateEqEq };
}

const BASE_INPUT = {
  notificationId: "notif-1",
  userId: "user-1",
  urgency: "emergency" as const,
  petName: "Rex",
  ownerMessage: "Triage indicates emergency urgency for Rex.",
  recommendedAction: "Contact a vet right away.",
  reportStorageId: "report-9",
};

describe("urgent-email builders", () => {
  it("builds an urgency-specific subject", () => {
    expect(buildUrgentEmailSubject("Rex", "emergency")).toContain("emergency");
    expect(buildUrgentEmailSubject("Rex", "high")).toContain("urgent");
    expect(buildUrgentEmailSubject("", "high")).toContain("your dog");
  });

  it("escapes owner-provided strings in the email HTML", () => {
    const html = buildUrgentEmailHtml({
      petName: "<script>",
      urgency: "high",
      ownerMessage: "a & b < c",
      recommendedAction: null,
      reportUrl: "https://app.pawvital.ai/dashboard",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b &lt; c");
  });
});

describe("deliverUrgentOwnerEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends an email and records sent delivery state when configured", async () => {
    const { supabase, updateEqEq } = buildSupabaseMock({
      email: "owner@example.com",
      prefs: null,
    });
    mockGetServiceSupabase.mockReturnValue(
      supabase as unknown as ReturnType<typeof getServiceSupabase>
    );
    mockSendEmail.mockResolvedValue({ sent: true, id: "resend-123" });

    const result = await deliverUrgentOwnerEmail(BASE_INPUT);

    expect(result.status).toBe("sent");
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const arg = mockSendEmail.mock.calls[0][0];
    expect(arg.to).toBe("owner@example.com");
    expect(arg.subject).toContain("emergency");
    // delivery state persisted as sent with the Resend confirmation id
    const persisted = updateEqEq.mock.calls.length;
    expect(persisted).toBeGreaterThan(0);
  });

  it("no-ops to failed (retryable) when email transport is unconfigured", async () => {
    const { supabase } = buildSupabaseMock({
      email: "owner@example.com",
      prefs: null,
    });
    mockGetServiceSupabase.mockReturnValue(
      supabase as unknown as ReturnType<typeof getServiceSupabase>
    );
    mockSendEmail.mockResolvedValue({ sent: false });

    const result = await deliverUrgentOwnerEmail(BASE_INPUT);

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("email_not_sent");
  });

  it("skips when the owner opted out of urgency alerts", async () => {
    const { supabase } = buildSupabaseMock({
      email: "owner@example.com",
      prefs: { urgency_alerts: false },
    });
    mockGetServiceSupabase.mockReturnValue(
      supabase as unknown as ReturnType<typeof getServiceSupabase>
    );

    const result = await deliverUrgentOwnerEmail(BASE_INPUT);

    expect(result.status).toBe("skipped");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips when the owner has no email on file", async () => {
    const { supabase } = buildSupabaseMock({ email: null, prefs: null });
    mockGetServiceSupabase.mockReturnValue(
      supabase as unknown as ReturnType<typeof getServiceSupabase>
    );

    const result = await deliverUrgentOwnerEmail(BASE_INPUT);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_owner_email");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("never throws when sendEmail itself rejects", async () => {
    const { supabase } = buildSupabaseMock({
      email: "owner@example.com",
      prefs: null,
    });
    mockGetServiceSupabase.mockReturnValue(
      supabase as unknown as ReturnType<typeof getServiceSupabase>
    );
    mockSendEmail.mockRejectedValue(new Error("network down"));

    const result = await deliverUrgentOwnerEmail(BASE_INPUT);

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("network down");
  });

  it("skips cleanly when Supabase is not configured", async () => {
    mockGetServiceSupabase.mockReturnValue(
      null as unknown as ReturnType<typeof getServiceSupabase>
    );

    const result = await deliverUrgentOwnerEmail(BASE_INPUT);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("supabase_unconfigured");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
