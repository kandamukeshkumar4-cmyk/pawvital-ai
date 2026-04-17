import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/api-route";

// Revalidate every 60 seconds (or 0 for dynamic)
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const rateLimitError = await enforceRateLimit(request);
    if (rateLimitError) {
      return rateLimitError;
    }

    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const defaultStats = {
      checks_24h: 0,
      checks_7d: 0,
      checks_30d: 0,
      outcomes_confirmed: 0,
      knowledge_chunks: 0,
      audio_assets: 0,
    };

    const supabase = getServiceSupabase();
    if (!supabase) {
      if (adminContext.isDemo) {
        return NextResponse.json(defaultStats);
      }
      return NextResponse.json(
        { error: "Admin statistics require service-role database access" },
        { status: 503 }
      );
    }

    const now = new Date();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const fetchCount = async (query: PromiseLike<{ count: number | null, error: unknown }>) => {
      try {
        const { count, error } = await query;
        if (error) return 0;
        return count || 0;
      } catch {
        return 0;
      }
    };

    const [
      checks_24h,
      checks_7d,
      checks_30d,
      outcomes_confirmed,
      knowledge_chunks,
      audio_assets,
    ] = await Promise.all([
      fetchCount(
        supabase
          .from("symptom_checks")
          .select("*", { count: "exact", head: true })
          .gte("created_at", ago24h)
      ),
      fetchCount(
        supabase
          .from("symptom_checks")
          .select("*", { count: "exact", head: true })
          .gte("created_at", ago7d)
      ),
      fetchCount(
        supabase
          .from("symptom_checks")
          .select("*", { count: "exact", head: true })
          .gte("created_at", ago30d)
      ),
      fetchCount(
        supabase
          .from("case_outcomes")
          .select("*", { count: "exact", head: true })
          .eq("vet_confirmed", true)
      ),
      fetchCount(
        supabase.from("knowledge_chunks").select("*", { count: "exact", head: true })
      ),
      fetchCount(
        supabase.from("audio_assets").select("*", { count: "exact", head: true })
      ),
    ]);

    return NextResponse.json({
      checks_24h,
      checks_7d,
      checks_30d,
      outcomes_confirmed,
      knowledge_chunks,
      audio_assets,
    });
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
