import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { PlatformAuthProvider, PlatformUser } from "../types";

export class SupabaseAuthProvider implements PlatformAuthProvider {
  readonly id = "supabase" as const;

  async getCurrentUser(): Promise<PlatformUser | null> {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email ?? null,
    };
  }
}
