import { NextResponse } from "next/server";
import { getBreedRiskProfiles } from "@/lib/breed-risk";

export async function GET(request: Request) {
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
  return NextResponse.json({ breed, profiles });
}
