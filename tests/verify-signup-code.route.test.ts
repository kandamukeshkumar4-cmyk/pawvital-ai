import { NextRequest } from "next/server";

const mockVerifyOtp = jest.fn();
const mockCreateServerClient = jest.fn(
  (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          cookies: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) => void;
      };
    }
  ) => ({
    auth: {
      verifyOtp: async (payload: { email: string; token: string; type: string }) => {
        const result = await mockVerifyOtp(payload);
        if (!result.error) {
          options.cookies.setAll([
            {
              name: "sb-test-auth-token",
              value: "session-cookie",
              options: { httpOnly: true, path: "/" },
            },
          ]);
        }
        return result;
      },
    },
  })
);

jest.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

describe("verify signup code route", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterAll(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalSupabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
    }
  });

  it("verifies signup codes server-side and sets auth cookies", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/verify-signup-code/route");
    const response = await POST(
      new NextRequest("https://app.pawvital.ai/api/auth/verify-signup-code", {
        method: "POST",
        body: JSON.stringify({
          email: "owner@example.com",
          token: "123456",
          next: "/dashboard",
        }),
      })
    );

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      token: "123456",
      type: "signup",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("sb-test-auth-token");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirect: "/dashboard",
    });
  });

  it("returns a signup redirect when verification fails", async () => {
    mockVerifyOtp
      .mockResolvedValueOnce({
        data: { session: null },
        error: new Error("expired"),
      })
      .mockResolvedValueOnce({
        data: { session: null },
        error: new Error("expired"),
      });

    const { POST } = await import("@/app/api/auth/verify-signup-code/route");
    const response = await POST(
      new NextRequest("https://app.pawvital.ai/api/auth/verify-signup-code", {
        method: "POST",
        body: JSON.stringify({
          email: "owner@example.com",
          token: "123456",
          next: "/dashboard",
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_code",
      redirect: "/signup?redirect=%2Fdashboard&error=confirm_link_expired",
    });
  });
});
