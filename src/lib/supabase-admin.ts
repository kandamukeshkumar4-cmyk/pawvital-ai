import { createClient } from "@supabase/supabase-js";

function getServiceSupabaseUrl() {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  );
}

// Supabase service-role keys are JWTs — always much longer than 32 chars.
// A shorter value is a placeholder, a truncation, or an accidental whitespace
// value and must not be used as a real service-role credential.
const MIN_SERVICE_KEY_LENGTH = 32;

/**
 * Service-role Supabase client for trusted server routes (webhooks, etc.).
 * Returns null when service-role credentials are absent or malformed.
 * Never falls back to the anon key — the caller must handle null explicitly.
 */
export function getServiceSupabase() {
  const url = getServiceSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!url || url.includes("your_supabase") || !url.startsWith("http")) {
    return null; // URL not configured or is a placeholder
  }
  if (!serviceKey || serviceKey.length < MIN_SERVICE_KEY_LENGTH) {
    return null; // Key missing, truncated, or is a placeholder
  }

  return createClient(url, serviceKey);
}

export { getServiceSupabaseUrl };
