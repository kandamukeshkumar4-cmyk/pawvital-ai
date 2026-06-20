import { NextResponse } from "next/server";
import { requireOwnedPet } from "@/lib/api/pet-guard";
import { isMissingTable } from "@/lib/api/table-missing";
import { detectDogBrainSignals } from "@/lib/dog-brain/signals";
import type { HealthLog } from "@/lib/health-log/types";

export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const owned = await requireOwnedPet({
    request,
    petId: url.searchParams.get("pet_id"),
    demoMessage: "Dog Brain signals require a configured account backend",
  });
  if ("response" in owned) return owned.response;

  try {
    const { data, error } = await owned.supabase
      .from("daily_health_logs")
      .select("*")
      .eq("user_id", owned.user.id)
      .eq("pet_id", owned.petId)
      .order("log_date", { ascending: false })
      .limit(14);

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({
          state: "stable",
          signals: [],
          code: "TABLE_MISSING",
        });
      }
      throw error;
    }

    return NextResponse.json(detectDogBrainSignals((data ?? []) as HealthLog[]));
  } catch (error) {
    console.error("[DogBrainSignals] GET failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
