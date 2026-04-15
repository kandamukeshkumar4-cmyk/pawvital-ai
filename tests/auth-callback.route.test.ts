import { NextRequest } from "next/server";

const mockExchangeCodeForSession = jest.fn();
const mockVerifyOtp = jest.fn();
const mockCreateServerSupabaseClient = jest.fn(() => ({
  auth: {
    exchangeCodeForSession: mockExchangeCodeForSession,
    verifyOtp: mockVerifyOtp,
  },
}));

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: (...args: unknown[]) =>
    mockCreateServerSupabaseClient(...args),
}));

describe("VET-1215 auth callback route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
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
    expect(response.headers.get("location")).toBe("https://app.pawvital.ai/pets/pet-1");
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
