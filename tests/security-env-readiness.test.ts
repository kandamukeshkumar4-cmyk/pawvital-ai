import { readFileSync } from "node:fs";
import path from "node:path";

const SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.signature";
const SERVICE_ROLE_JWT_WITHOUT_SIGNATURE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ";
const SERVICE_ROLE_JWT_WITH_BAD_SIGNATURE_CHARS =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.bad!";
const ANON_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.signature";

function parseEnvFile(raw: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return values;
}

describe("security env readiness", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    delete process.env.ASYNC_REVIEW_WEBHOOK_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it(".env.example documents required security vars with placeholders only", () => {
    const envExample = readFileSync(
      path.join(process.cwd(), ".env.example"),
      "utf8"
    );
    const parsed = parseEnvFile(envExample);

    expect(parsed.NEXT_PUBLIC_APP_URL).toBe("https://your-app.example.com");
    expect(parsed.ASYNC_REVIEW_WEBHOOK_SECRET).toBe("");
    expect(parsed.HF_SIDECAR_API_KEY).toBe("");
    expect(parsed.STRIPE_SECRET_KEY).toBe("");
    expect(parsed.STRIPE_WEBHOOK_SECRET).toBe("");
    expect(parsed.STRIPE_PRICE_ID).toBe("");
    expect(parsed.UPSTASH_REDIS_REST_URL).toBe("");
    expect(parsed.UPSTASH_REDIS_REST_TOKEN).toBe("");
    expect(parsed.NEXT_PUBLIC_SUPABASE_URL).toBe("your_supabase_url_here");
    expect(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(
      "your_supabase_anon_key_here"
    );
    expect(parsed.SUPABASE_SERVICE_ROLE_KEY).toBe(
      "your_supabase_service_role_key_here"
    );

    expect(envExample).not.toMatch(/sk_live_|ghp_|gho_|xox[baprs]-/);
  });

  it("fails closed for Stripe redirects in production without a canonical app url", async () => {
    process.env.NODE_ENV = "production";
    const { getStripeAppUrl } = await import("@/lib/stripe");

    expect(() =>
      getStripeAppUrl(new Request("https://attacker.example/checkout"))
    ).toThrow("APP_URL_NOT_CONFIGURED");
  });

  it("disables async review queueing in production without the webhook secret", async () => {
    process.env.NODE_ENV = "production";
    const { isAsyncReviewQueueConfigured } = await import(
      "@/lib/async-review-client"
    );

    expect(isAsyncReviewQueueConfigured("https://queue.example.com")).toBe(
      false
    );
  });

  it("refuses to create a service-role Supabase client without the service key", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const { getServiceSupabase } = await import("@/lib/supabase-admin");

    expect(getServiceSupabase()).toBeNull();
  });

  it("refuses to create a service-role client when the example Supabase URL is still present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "your_supabase_url_here";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_JWT;

    const { getServiceSupabase } = await import("@/lib/supabase-admin");

    expect(getServiceSupabase()).toBeNull();
  });

  it("refuses malformed and anon-role Supabase service keys", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

    const { getServiceSupabase, getServiceSupabaseConfigurationStatus } =
      await import("@/lib/supabase-admin");

    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    expect(getServiceSupabase()).toBeNull();
    expect(getServiceSupabaseConfigurationStatus()).toEqual({
      configured: false,
      reason: "service_key_malformed",
    });

    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_JWT_WITHOUT_SIGNATURE;
    expect(getServiceSupabase()).toBeNull();
    expect(getServiceSupabaseConfigurationStatus()).toEqual({
      configured: false,
      reason: "service_key_malformed",
    });

    process.env.SUPABASE_SERVICE_ROLE_KEY =
      SERVICE_ROLE_JWT_WITH_BAD_SIGNATURE_CHARS;
    expect(getServiceSupabase()).toBeNull();
    expect(getServiceSupabaseConfigurationStatus()).toEqual({
      configured: false,
      reason: "service_key_malformed",
    });

    process.env.SUPABASE_SERVICE_ROLE_KEY = ANON_ROLE_JWT;
    expect(getServiceSupabase()).toBeNull();
    expect(getServiceSupabaseConfigurationStatus()).toEqual({
      configured: false,
      reason: "service_key_not_service_role",
    });
  });

  it("reports safe configuration reason codes without exposing secrets", async () => {
    const { getServiceSupabaseConfigurationStatus } = await import(
      "@/lib/supabase-admin"
    );

    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_JWT;
    expect(getServiceSupabaseConfigurationStatus()).toEqual({
      configured: false,
      reason: "url_invalid",
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_JWT;
    expect(getServiceSupabaseConfigurationStatus()).toEqual({
      configured: true,
    });
  });
});
