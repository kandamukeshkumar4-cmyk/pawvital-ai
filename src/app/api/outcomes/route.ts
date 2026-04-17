import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";
import "@/lib/events/notification-handler";

const OutcomeSubmissionSchema = z.object({
  check_id: z.string().uuid(),
  reported_diagnosis: z.string().trim().min(1).max(500),
  vet_confirmed: z.boolean(),
  outcome_notes: z.string().trim().max(2000).optional(),
});

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

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = OutcomeSubmissionSchema.safeParse(requestBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Database access is not configured", code: "DEMO_MODE" },
        { status: 503 }
      );
    }

    console.error("[Outcomes] Failed to create Supabase client:", error);
    return NextResponse.json(
      { error: "Unable to connect to the database" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "You must be authenticated to submit an outcome" },
      { status: 401 }
    );
  }

  const { data: symptomCheck, error: symptomCheckError } = await supabase
    .from("symptom_checks")
    .select("id, pet_id")
    .eq("id", parsedBody.data.check_id)
    .maybeSingle();

  if (symptomCheckError) {
    console.error("[Outcomes] Failed to verify symptom check:", symptomCheckError);
    return NextResponse.json(
      { error: "Unable to verify the symptom check" },
      { status: 500 }
    );
  }

  if (!symptomCheck) {
    return NextResponse.json(
      { error: "Symptom check not found" },
      { status: 404 }
    );
  }

  const { data: ownedPet, error: ownedPetError } = await supabase
    .from("pets")
    .select("id")
    .eq("id", symptomCheck.pet_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownedPetError) {
    console.error("[Outcomes] Failed to verify pet ownership:", ownedPetError);
    return NextResponse.json(
      { error: "Unable to verify the symptom check owner" },
      { status: 500 }
    );
  }

  if (!ownedPet) {
    return NextResponse.json(
      { error: "Symptom check not found" },
      { status: 404 }
    );
  }

  const { data: outcome, error: outcomeError } = await supabase
    .from("case_outcomes")
    .insert({
      check_id: parsedBody.data.check_id,
      reported_diagnosis: parsedBody.data.reported_diagnosis,
      vet_confirmed: parsedBody.data.vet_confirmed,
      outcome_notes: parsedBody.data.outcome_notes || null,
    })
    .select(
      "id, check_id, reported_diagnosis, vet_confirmed, outcome_notes, recorded_at"
    )
    .maybeSingle();

  if (outcomeError || !outcome) {
    console.error("[Outcomes] Failed to insert case outcome:", outcomeError);
    return NextResponse.json(
      { error: "Unable to save the outcome" },
      { status: 500 }
    );
  }

  // Do not emit OUTCOME_REQUESTED here — the outcome has already been recorded.
  // Emitting a reminder after a successful submission creates a contradictory
  // notification asking the user for information they just provided.

  return NextResponse.json({ data: outcome }, { status: 201 });
}
