import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface BreedRiskProfile {
  breed: string;
  condition: string;
  risk_score: number;
  mention_count: number;
}

const DEFAULT_TOP_N = 5;
const MAX_TOP_N = 20;
const supabaseUrl =
  process.env.SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

function getSafeTopN(topN: number): number {
  if (!Number.isFinite(topN)) return DEFAULT_TOP_N;
  return Math.max(1, Math.min(MAX_TOP_N, Math.trunc(topN)));
}

async function createBreedRiskClient() {
  if (supabaseUrl.startsWith("http") && serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return createServerSupabaseClient();
}

export async function getBreedRiskProfiles(
  breed: string,
  topN: number = DEFAULT_TOP_N
): Promise<BreedRiskProfile[]> {
  try {
    const normalizedBreed = breed.toLowerCase().trim();
    if (!normalizedBreed) return [];

    const supabase = await createBreedRiskClient();
    const { data, error } = await supabase
      .from("breed_risk_profiles")
      .select("breed, condition, risk_score, mention_count")
      .ilike("breed", `%${normalizedBreed}%`)
      .order("risk_score", { ascending: false })
      .limit(getSafeTopN(topN));

    if (error || !data) return [];
    return data as BreedRiskProfile[];
  } catch {
    return [];
  }
}

export function formatBreedRiskContext(profiles: BreedRiskProfile[]): string {
  if (!profiles.length) return "";

  const lines = profiles.map(
    (profile) =>
      `- ${profile.condition}: risk score ${(profile.risk_score * 100).toFixed(1)}% (based on ${profile.mention_count} clinical cases)`
  );

  return `Breed-specific risk factors from clinical corpus:\n${lines.join("\n")}`;
}