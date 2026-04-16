import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function resolveVerifiedUserId() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
