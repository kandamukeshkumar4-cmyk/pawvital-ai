import { NextResponse } from "next/server";
import { getBreedRiskProfiles } from "@/lib/breed-risk";
import { getBreedModifierProvenance } from "@/lib/provenance-registry";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const breed = searchParams.get("breed")?.trim() ?? "";
  const topN = Number(searchParams.get("top") ?? "5");

  if (!breed) {
    return NextResponse.json(
      { error: "Missing required query parameter: breed" },
      { status: 400 }
    );
  }

  const profiles = await getBreedRiskProfiles(breed, topN);
  const modifierProvenance = getBreedModifierProvenance(breed).map((entry) => ({
    rule_id: entry.rule_id,
    evidence_tier: entry.evidence_tier,
    review_date: entry.review_date,
    next_review: entry.next_review,
    source: entry.source,
    diseases: entry.diseases ?? [],
  }));

  return NextResponse.json({
    breed,
    profiles,
    modifierProvenance,
    source: profiles.length > 0 ? "supabase" : "unavailable",
  });
}
