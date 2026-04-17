import { z } from "zod";

const OptionalString = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const OptionalHttpUrl = OptionalString.refine(
  (value) => value === undefined || /^https?:\/\//.test(value),
  "Expected an http(s) URL"
);

const ServerEnvSchema = z.object({
  ADMIN_EMAILS: OptionalString,
  ASYNC_REVIEW_WEBHOOK_SECRET: OptionalString,
  HF_SIDECAR_API_KEY: OptionalString,
  NEXT_PUBLIC_APP_URL: OptionalHttpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: OptionalString,
  NEXT_PUBLIC_SUPABASE_URL: OptionalHttpUrl,
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  RESEND_API_KEY: OptionalString,
  RESEND_FROM_EMAIL: OptionalString,
  SYMPTOM_CHAT_SESSION_SECRET: OptionalString,
  STRIPE_PRICE_ID: OptionalString,
  STRIPE_SECRET_KEY: OptionalString,
  STRIPE_WEBHOOK_SECRET: OptionalString,
  SUPABASE_SERVICE_ROLE_KEY: OptionalString,
  UPSTASH_REDIS_REST_TOKEN: OptionalString,
  UPSTASH_REDIS_REST_URL: OptionalHttpUrl,
  VERCEL_URL: OptionalString,
});

const parsedEnv = ServerEnvSchema.safeParse(process.env);

const fallbackEnv = {
  ADMIN_EMAILS: undefined,
  ASYNC_REVIEW_WEBHOOK_SECRET: undefined,
  HF_SIDECAR_API_KEY: undefined,
  NEXT_PUBLIC_APP_URL: undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
  NEXT_PUBLIC_SUPABASE_URL: undefined,
  NODE_ENV: "development" as const,
  RESEND_API_KEY: undefined,
  RESEND_FROM_EMAIL: undefined,
  SYMPTOM_CHAT_SESSION_SECRET: undefined,
  STRIPE_PRICE_ID: undefined,
  STRIPE_SECRET_KEY: undefined,
  STRIPE_WEBHOOK_SECRET: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  UPSTASH_REDIS_REST_URL: undefined,
  VERCEL_URL: undefined,
};

export const serverEnv = parsedEnv.success ? parsedEnv.data : fallbackEnv;

export function isProductionEnvironment(): boolean {
  return serverEnv.NODE_ENV === "production";
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL &&
      serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isSupabaseServiceRoleConfigured(): boolean {
  return Boolean(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL &&
      serverEnv.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isUpstashConfigured(): boolean {
  return Boolean(
    serverEnv.UPSTASH_REDIS_REST_URL && serverEnv.UPSTASH_REDIS_REST_TOKEN
  );
}

export function isResendConfigured(): boolean {
  return Boolean(serverEnv.RESEND_API_KEY);
}

export function hasSymptomChatSessionSecret(): boolean {
  return Boolean(
    serverEnv.SYMPTOM_CHAT_SESSION_SECRET || serverEnv.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isStripeFullyConfigured(): boolean {
  return Boolean(
    serverEnv.STRIPE_SECRET_KEY &&
      serverEnv.STRIPE_PRICE_ID &&
      serverEnv.STRIPE_WEBHOOK_SECRET &&
      getCanonicalAppUrl()
  );
}

export function getCanonicalAppUrl(): string | null {
  if (serverEnv.NEXT_PUBLIC_APP_URL) {
    return serverEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (serverEnv.VERCEL_URL) {
    return `https://${serverEnv.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return null;
}

export function getEnvironmentValidationIssues(): string[] {
  const issues: string[] = [];

  if (!parsedEnv.success) {
    issues.push(
      ...parsedEnv.error.issues.map(
        (issue) => `${issue.path.join(".") || "env"}: ${issue.message}`
      )
    );
  }

  if (isProductionEnvironment() && !serverEnv.NEXT_PUBLIC_APP_URL) {
    issues.push("NEXT_PUBLIC_APP_URL is required in production.");
  }

  if (
    isProductionEnvironment() &&
    serverEnv.STRIPE_SECRET_KEY &&
    !serverEnv.STRIPE_PRICE_ID
  ) {
    issues.push("STRIPE_PRICE_ID is required when Stripe is enabled.");
  }

  if (
    isProductionEnvironment() &&
    serverEnv.STRIPE_SECRET_KEY &&
    !serverEnv.STRIPE_WEBHOOK_SECRET
  ) {
    issues.push("STRIPE_WEBHOOK_SECRET is required when Stripe is enabled.");
  }

  if (
    isProductionEnvironment() &&
    isSupabaseConfigured() &&
    !serverEnv.SUPABASE_SERVICE_ROLE_KEY
  ) {
    issues.push(
      "SUPABASE_SERVICE_ROLE_KEY is required in production for trusted server flows."
    );
  }

  if (isProductionEnvironment() && !isUpstashConfigured()) {
    issues.push(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production for rate limiting and server-owned symptom-chat sessions."
    );
  }

  if (isProductionEnvironment() && !hasSymptomChatSessionSecret()) {
    issues.push(
      "SYMPTOM_CHAT_SESSION_SECRET is required in production for server-owned symptom-chat sessions."
    );
  }

  return issues;
}
