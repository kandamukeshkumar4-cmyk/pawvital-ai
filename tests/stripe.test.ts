describe("getStripeAppUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("prefers NEXT_PUBLIC_APP_URL when configured", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.pawvital.ai/";
    const { getStripeAppUrl } = await import("@/lib/stripe");

    expect(getStripeAppUrl(new Request("http://localhost/test"))).toBe(
      "https://app.pawvital.ai"
    );
  });

  it("falls back to VERCEL_URL before trusting a request origin", async () => {
    process.env.VERCEL_URL = "preview.pawvital.ai";
    const { getStripeAppUrl } = await import("@/lib/stripe");

    expect(getStripeAppUrl(new Request("http://localhost/test"))).toBe(
      "https://preview.pawvital.ai"
    );
  });

  it("falls back to the request origin only outside production when no canonical url exists", async () => {
    const { getStripeAppUrl } = await import("@/lib/stripe");

    expect(getStripeAppUrl(new Request("http://localhost:3000/test"))).toBe(
      "http://localhost:3000"
    );
  });

  it("throws in production when no canonical app url is configured", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_URL = "preview.pawvital.ai";
    const { getStripeAppUrl } = await import("@/lib/stripe");

    expect(() =>
      getStripeAppUrl(new Request("https://attacker.example/test"))
    ).toThrow("APP_URL_NOT_CONFIGURED");
  });

  it("rejects malformed canonical app urls", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.pawvital.ai/path?token=secret";
    const { getStripeAppUrl } = await import("@/lib/stripe");

    expect(() =>
      getStripeAppUrl(new Request("https://attacker.example/test"))
    ).toThrow("APP_URL_INVALID");
  });
});
