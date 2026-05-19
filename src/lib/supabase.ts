import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured =
  supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://");

export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error("DEMO_MODE");
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
}

export function createRecoveryClient() {
  if (!isSupabaseConfigured) {
    throw new Error("DEMO_MODE");
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit",
      persistSession: true,
    },
  });
}
