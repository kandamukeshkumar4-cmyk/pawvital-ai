import { NextRequest } from "next/server";

const mockExchangeCodeForSession = jest.fn();
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
      exchangeCodeForSession: async (code: string) => {
        const result = await mockExchangeCodeForSession(code);
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
      verifyOtp: async (payload: { token_hash: string; type: string }) => {
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

describe("VET-1215 auth callback route", () => {
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

  it("exchanges OAuth codes and redirects to a safe next target", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/api/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://app.pawvital.ai/api/auth/callback?code=abc123&next=%2Fpets%2Fpet-1"
      )
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(response.headers.get("location")).toBe(
      "https://app.pawvital.ai/pets/pet-1"
    );
    expect(response.headers.get("set-cookie")).toContain("sb-test-auth-token");
  });

  it("hands recovery PKCE codes to the browser callback", async () => {
    const { GET } = await import("@/app/api/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://app.pawvital.ai/api/auth/callback?code=recovery-code&next=%2Freset-password%3Fredirect%3D%252Fsymptom-checker"
      )
    );

    const location = response.headers.get("location");
    expect(location).toBeTruthy();

    const callbackUrl = new URL(location || "");
    expect(callbackUrl.origin).toBe("https://app.pawvital.ai");
    expect(callbackUrl.pathname).toBe("/auth/callback");
    expect(callbackUrl.searchParams.get("code")).toBe("recovery-code");
    expect(callbackUrl.searchParams.get("next")).toBe(
      "/reset-password?redirect=%2Fsymptom-checker"
    );
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("verifies recovery tokens and lands on reset-password with the preserved redirect", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/api/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://app.pawvital.ai/api/auth/callback?token_hash=token-1&type=recovery&next=%2Freset-password%3Fredirect%3D%252Fhistory"
      )
    );

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: "token-1",
      type: "recovery",
    });
    expect(response.headers.get("location")).toBe(
      "https://app.pawvital.ai/reset-password?redirect=%2Fhistory"
    );
    expect(response.headers.get("set-cookie")).toContain("sb-test-auth-token");
  });

  it("rejects unsafe callback redirects", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/api/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://app.pawvital.ai/api/auth/callback?code=abc123&next=https%3A%2F%2Fevil.example"
      )
    );

    expect(response.headers.get("location")).toBe("https://app.pawvital.ai/dashboard");
  });

  it("redirects invalid recovery links back to login with an error", async () => {
    mockVerifyOtp.mockResolvedValue({
      error: new Error("expired"),
    });

    const { GET } = await import("@/app/api/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://app.pawvital.ai/api/auth/callback?token_hash=token-1&type=recovery&next=%2Freset-password"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://app.pawvital.ai/login?redirect=%2Fdashboard&error=invalid_reset_link"
    );
  });

  it("redirects malformed callbacks back to login", async () => {
    const { GET } = await import("@/app/api/auth/callback/route");
    const response = await GET(
      new NextRequest("https://app.pawvital.ai/api/auth/callback")
    );

    expect(response.headers.get("location")).toBe(
      "https://app.pawvital.ai/login?redirect=%2Fdashboard&error=auth_callback_failed"
    );
  });
});
