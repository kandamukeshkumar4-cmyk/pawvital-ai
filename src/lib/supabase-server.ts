import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function createServerSupabaseClient() {
  if (!supabaseUrl.startsWith("http")) {
    throw new Error("DEMO_MODE");
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server component - can't set cookies
        }
      },
    },
  });
}
