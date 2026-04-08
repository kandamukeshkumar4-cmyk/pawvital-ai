import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function GET() {
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

    if (error) throw error;
    
    return NextResponse.json({ pets });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ pets: [] });
    }
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, species, breed, age_years, age_months, age_unit, weight, weight_unit } = body;

    if (!name || !species || !breed) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: pet, error } = await supabase
      .from("pets")
      .insert({
        user_id: user.id,
        name: name.trim(),
        species,
        breed: breed.trim(),
        age_years: age_years || 0,
        age_months: age_months || 0,
        age_unit: age_unit || "years",
        weight: weight || 0,
        weight_unit: weight_unit || "lbs",
        is_neutered: true,
        gender: "male",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ pet });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ error: "Cannot create in demo mode" }, { status: 400 });
    }
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
