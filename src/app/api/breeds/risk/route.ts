import { NextResponse } from "next/server";
import { getBreedRiskProfiles } from "@/lib/breed-risk";
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
  return NextResponse.json({
    breed,
    profiles,
    source: profiles.length > 0 ? "supabase" : "unavailable",
  });
}
