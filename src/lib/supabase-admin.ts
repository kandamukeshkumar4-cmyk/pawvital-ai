import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server routes (webhooks, etc.).
 * Returns null when not configured.
 */
export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || url.includes("your_supabase")) {
    return null;
  }
  return createClient(url, serviceKey);
}
