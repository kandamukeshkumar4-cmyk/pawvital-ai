import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return String(err);
}

function isMissingTableError(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("table")
  );
}

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

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: pets, error } = await supabase
      .from("pets")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ pets: [] }, { status: 503 });
      }

      throw error;
    }
    
    return NextResponse.json({ pets });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ pets: [] });
    }
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      name,
      species,
      breed,
      age_years,
      age_months,
      age_unit,
      weight,
      weight_unit,
    } = body as Record<string, unknown>;

    const petName = typeof name === "string" ? name.trim() : "";
    const petSpecies = typeof species === "string" ? species.trim() : "";
    const petBreed = typeof breed === "string" ? breed.trim() : "";
    const petAgeYears = typeof age_years === "number" ? age_years : Number(age_years ?? 0) || 0;
    const petAgeMonths = typeof age_months === "number" ? age_months : Number(age_months ?? 0) || 0;
    const petAgeUnit = typeof age_unit === "string" && age_unit.trim() ? age_unit.trim() : "years";
    const petWeight = typeof weight === "number" ? weight : Number(weight ?? 0) || 0;
    const petWeightUnit = typeof weight_unit === "string" && weight_unit.trim() ? weight_unit.trim() : "lbs";

    if (!petName || !petSpecies || !petBreed) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: pet, error } = await supabase
      .from("pets")
      .insert({
        user_id: user.id,
        name: petName,
        species: petSpecies,
        breed: petBreed,
        age_years: petAgeYears,
        age_months: petAgeMonths,
        age_unit: petAgeUnit,
        weight: petWeight,
        weight_unit: petWeightUnit,
        is_neutered: true,
        gender: "male",
      })
      .select()
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: "Pets are temporarily unavailable" },
          { status: 503 }
        );
      }

      throw error;
    }

    return NextResponse.json({ pet });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ error: "Cannot create in demo mode" }, { status: 400 });
    }
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
