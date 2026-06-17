import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { PlatformDbProvider } from "../types";

export class SupabaseDbProvider implements PlatformDbProvider {
  readonly id = "supabase" as const;

  async ping(): Promise<boolean> {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.from("pets").select("id").limit(1);
      return !error;
    } catch {
      return false;
    }
  }
}
