import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client for trusted server routes (webhooks, etc.).
 * Returns null when not configured.
 */
export function getServiceSupabase() {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || url.includes("your_supabase")) {
    return null;
  }
  return createClient(url, serviceKey);
}
