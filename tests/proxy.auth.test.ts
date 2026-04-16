import { NextRequest } from "next/server";

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

  it("protects admin routes that previously fell through", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { proxy } = await loadProxyModule();
    const response = await proxy(new NextRequest("https://app.pawvital.ai/admin"));

    expect(response.headers.get("location")).toBe(
      "https://app.pawvital.ai/login?redirect=%2Fadmin"
    );
  });

  it("sends authenticated users to their intended destination from auth pages", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
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
      data: { user: { id: "user-1" } },
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
});
