import { NextRequest } from "next/server";
import { PRIVATE_TESTER_MODE_COOKIE } from "@/lib/private-tester-access";

const mockGetUser = jest.fn();
const mockCreateServerClient = jest.fn(() => ({
  auth: {
    getUser: mockGetUser,
  },
}));

async function loadProxyModule() {
  jest.doMock("@supabase/ssr", () => ({
    createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
  }));

  return import("@/proxy");
}

describe("VET-1215 proxy auth guard", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("redirects unauthenticated users from newly protected routes", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { proxy } = await loadProxyModule();
    const response = await proxy(
      new NextRequest("https://app.pawvital.ai/notifications?tab=unread")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.pawvital.ai/login?redirect=%2Fnotifications%3Ftab%3Dunread"
    );
  });

  it.each(["/admin", "/admin/cohort-launch"])(
    "protects %s via the login redirect",
    async (pathname) => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { proxy } = await loadProxyModule();
      const response = await proxy(
        new NextRequest(`https://app.pawvital.ai${pathname}`)
      );

      expect(response.headers.get("location")).toBe(
        `https://app.pawvital.ai/login?redirect=${encodeURIComponent(pathname)}`
      );
    }
  );

  it("sends authenticated users to their intended destination from auth pages", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "alpha@example.com" } },
      error: null,
    });

    const { proxy } = await loadProxyModule();
    const response = await proxy(
      new NextRequest("https://app.pawvital.ai/login?redirect=%2Fhistory")
    );

    expect(response.headers.get("location")).toBe("https://app.pawvital.ai/history");
  });

  it("ignores unsafe external redirect params on auth pages", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "alpha@example.com" } },
      error: null,
    });

    const { proxy } = await loadProxyModule();
    const response = await proxy(
      new NextRequest("https://app.pawvital.ai/login?redirect=https%3A%2F%2Fevil.example")
    );

    expect(response.headers.get("location")).toBe("https://app.pawvital.ai/dashboard");
  });

  it("falls through in demo mode without creating an auth client", async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    };

    const { proxy } = await loadProxyModule();
    const response = await proxy(new NextRequest("https://app.pawvital.ai/admin"));

    expect(response.status).toBe(200);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("VET-1352 tester access smoke: redirects non-invited authenticated users away from protected routes in private tester mode", async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_MODE: "1",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.co",
      PRIVATE_TESTER_ALLOWED_EMAILS: "tester@example.com",
    };
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "outside@example.com" } },
      error: null,
    });

    const { proxy } = await loadProxyModule();
    const response = await proxy(new NextRequest("https://app.pawvital.ai/history"));

    expect(response.headers.get("location")).toBe("https://app.pawvital.ai/");
  });

  it("VET-1352 tester access smoke: allows invited authenticated users through protected routes in private tester mode", async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_MODE: "1",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.co",
      PRIVATE_TESTER_ALLOWED_EMAILS: "tester@example.com",
    };
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "tester@example.com" } },
      error: null,
    });

    const { proxy } = await loadProxyModule();
    const response = await proxy(new NextRequest("https://app.pawvital.ai/history"));

    expect(response.status).toBe(200);
  });

  it("VET-1390 tester quarantine: mirrors server-side private tester mode into a client-readable cookie", async () => {
    process.env = {
      ...originalEnv,
      PRIVATE_TESTER_MODE: "1",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.co",
    };
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "tester@example.com" } },
      error: null,
    });

    const { proxy } = await loadProxyModule();
    const response = await proxy(new NextRequest("https://app.pawvital.ai/history"));

    expect(response.status).toBe(200);
    expect(response.cookies.get(PRIVATE_TESTER_MODE_COOKIE)?.value).toBe("1");
  });
});
