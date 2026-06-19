import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import { detectDogBrainSignals } from "@/lib/dog-brain/signals";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";
import type { HealthLog } from "@/lib/health-log/types";

const QuerySchema = z.object({
  pet_id: z.string().uuid(),
});

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(
    error.message ?? "",
  );
}

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request),
  );
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    pet_id: url.searchParams.get("pet_id"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid pet_id", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Dog Brain signals require a configured account backend",
  });
  if ("response" in auth) return auth.response;

  try {
    const { data: pet, error: petError } = await auth.supabase
      .from("pets")
      .select("id")
      .eq("id", parsed.data.pet_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (petError) throw petError;
    if (!pet) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    const { data, error } = await auth.supabase
      .from("daily_health_logs")
      .select("*")
      .eq("user_id", auth.user.id)
      .eq("pet_id", parsed.data.pet_id)
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
