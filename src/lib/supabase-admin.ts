import { createClient } from "@supabase/supabase-js";

type ServiceSupabaseConfigFailureReason =
  | "service_key_malformed"
  | "service_key_missing"
  | "service_key_not_service_role"
  | "url_invalid"
  | "url_missing";

type ServiceSupabaseUrlResult =
  | { reason: "url_invalid" | "url_missing" }
  | { url: string };

type ServiceRoleKeyResult =
  | { reason: Exclude<ServiceSupabaseConfigFailureReason, "url_invalid" | "url_missing"> }
  | { serviceKey: string };

function normalizeServiceSupabaseUrl(value: string) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("your_supabase")) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    const localHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) {
      return "";
    }

    return url.origin;
  } catch {
    return "";
  }
}

function resolveServiceSupabaseUrl(): ServiceSupabaseUrlResult {
  const rawUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";

  if (!rawUrl) {
    return { reason: "url_missing" };
  }

  const url = normalizeServiceSupabaseUrl(rawUrl);
  return url ? { url } : { reason: "url_invalid" };
}

const MIN_SERVICE_KEY_LENGTH = 32;
const JWT_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  if (!JWT_SEGMENT_RE.test(value)) {
    return null;
  }

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function decodeSupabaseJwt(value: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
} | null {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return null;
  }

  const header = decodeBase64UrlJson(parts[0]);
  const payload = decodeBase64UrlJson(parts[1]);
  if (!header || !payload || !JWT_SEGMENT_RE.test(parts[2])) {
    return null;
  }

  return { header, payload };
}

function validateServiceRoleKey(value: string): ServiceRoleKeyResult {
  const serviceKey = value.trim();
  if (!serviceKey) {
    return { reason: "service_key_missing" };
  }

  if (serviceKey.length < MIN_SERVICE_KEY_LENGTH || serviceKey.includes("your_supabase")) {
    return { reason: "service_key_malformed" };
  }

  const jwt = decodeSupabaseJwt(serviceKey);
  if (!jwt || typeof jwt.header.alg !== "string") {
    return { reason: "service_key_malformed" };
  }

  if (jwt.payload.role !== "service_role") {
    return { reason: "service_key_not_service_role" };
  }

  return { serviceKey };
}

function getServiceSupabaseUrl() {
  const result = resolveServiceSupabaseUrl();
  return "url" in result ? result.url : "";
}

function getServiceSupabaseConfigurationStatus():
  | { configured: false; reason: ServiceSupabaseConfigFailureReason }
  | { configured: true } {
  const urlResult = resolveServiceSupabaseUrl();
  if ("reason" in urlResult) {
    return { configured: false, reason: urlResult.reason };
  }

  const serviceKeyResult = validateServiceRoleKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  if ("reason" in serviceKeyResult) {
    return { configured: false, reason: serviceKeyResult.reason };
  }

  return { configured: true };
}

function getServiceSupabaseCredentials() {
  const urlResult = resolveServiceSupabaseUrl();
  if ("reason" in urlResult) {
    return null;
  }

  const serviceKeyResult = validateServiceRoleKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  if ("reason" in serviceKeyResult) {
    return null;
  }

  return { serviceKey: serviceKeyResult.serviceKey, url: urlResult.url };
}

/**
 * Service-role Supabase client for trusted server routes (webhooks, etc.).
 * Returns null when service-role credentials are absent or malformed.
 * Never falls back to the anon key; the caller must handle null explicitly.
 */
export function getServiceSupabase(options?: Parameters<typeof createClient>[2]) {
  const credentials = getServiceSupabaseCredentials();
  if (!credentials) {
    return null;
  }

  return options
    ? createClient(credentials.url, credentials.serviceKey, options)
    : createClient(credentials.url, credentials.serviceKey);
}

export {
  getServiceSupabaseConfigurationStatus,
  getServiceSupabaseUrl,
};
