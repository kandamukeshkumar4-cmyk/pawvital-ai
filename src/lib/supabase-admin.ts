import { createClient } from "@supabase/supabase-js";

function getServiceSupabaseUrl() {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  );
}

/**
 * Service-role Supabase client for trusted server routes (webhooks, etc.).
 * Returns null when not configured.
 */
export function getServiceSupabase() {
  const url = getServiceSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceKey || url.includes("your_supabase")) {
    return null;
  }
  return createClient(url, serviceKey);
}

export { getServiceSupabaseUrl };
