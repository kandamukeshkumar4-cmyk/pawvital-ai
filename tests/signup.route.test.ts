import { NextRequest } from "next/server";

const mockSignUp = jest.fn();

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
      signUp: async (payload: {
        email: string;
        password: string;
        options: {
          data: { full_name: string };
          emailRedirectTo: string;
        };
      }) => {
        const result = await mockSignUp(payload);
        if (result.data?.session && !result.error) {
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

describe("signup route", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    mockSignUp.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
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

  it("signs up through the anon auth boundary and redirects when a session is created", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new NextRequest("https://app.pawvital.ai/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: " OWNER@example.com ",
          password: "super-secret-password",
          name: "Dog Parent",
          next: "/symptom-checker",
        }),
      })
    );

    expect(mockSignUp).toHaveBeenCalledWith({
      email: "OWNER@example.com",
      password: "super-secret-password",
      options: {
        data: { full_name: "Dog Parent" },
        emailRedirectTo:
          "https://app.pawvital.ai/api/auth/callback?next=%2Fsymptom-checker&type=signup",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("sb-test-auth-token");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirect: "/symptom-checker",
      requiresConfirmation: false,
    });
  });

  it("keeps the user on signup when email confirmation is required", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new NextRequest("https://app.pawvital.ai/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: "owner@example.com",
          password: "super-secret-password",
          next: "/dashboard",
        }),
      })
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requiresConfirmation: true,
      message:
        "Check your email to confirm your account. You can resend the email and enter the 6-digit code here if the link expires.",
    });
  });

  it("sanitizes unsafe redirects before building the confirmation callback", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new NextRequest("https://app.pawvital.ai/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: "owner@example.com",
          password: "super-secret-password",
          next: "https://evil.example/steal",
        }),
      })
    );

    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://app.pawvital.ai/api/auth/callback?next=%2Fdashboard&type=signup",
        }),
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      redirect: "/dashboard",
    });
  });

  it("does not confirm existing accounts from the public route", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null },
      error: { message: "User already registered", status: 422 },
    });

    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new NextRequest("https://app.pawvital.ai/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: "owner@example.com",
          password: "existing-password",
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "signup_failed",
      message:
        "We couldn't create your account. If you already have one, try signing in instead.",
    });
  });

  it("does not create weak-password accounts", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new NextRequest("https://app.pawvital.ai/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: "owner@example.com",
          password: "short",
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(mockSignUp).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: "weak_password",
    });
  });
});
