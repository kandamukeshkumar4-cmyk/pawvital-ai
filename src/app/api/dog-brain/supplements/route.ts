import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import { requireOwnedPet } from "@/lib/api/pet-guard";
import { isMissingTable } from "@/lib/api/table-missing";

const StartSchema = z.object({
  pet_id: z.string().uuid(),
  supplement_name: z.string().trim().min(1).max(120),
  reason_signal_key: z.string().trim().max(120).optional().nullable(),
  // No dosage field allowed. Framing is always "ask vet".
});

const OutcomeSchema = z.object({
  outcome: z.enum(["better", "same", "worse", "side_effect"]),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const petId = url.searchParams.get("pet_id");
  const owned = await requireOwnedPet({ request, petId, demoMessage: "Supplements require account" });
  if ("response" in owned) return owned.response;

  try {
    const { data, error } = await owned.supabase
      .from("dog_brain_supplement_trials")
      .select("*")
      .eq("user_id", owned.user.id)
      .eq("pet_id", owned.petId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ data: [], code: "TABLE_MISSING" });
      throw error;
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    console.error("[DogBrainSupplements] GET error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const owned = await requireOwnedPet({
    request,
    petId: parsed.data.pet_id,
    demoMessage: "Supplements require account",
  });
  if ("response" in owned) return owned.response;

  const reasonKey = parsed.data.reason_signal_key ?? null;

  try {
    // Idempotent: one OPEN trial per (pet, supplement, reason). A retry must
    // return the existing trial, never create a duplicate. PostgREST upsert
    // can't target the partial unique index (WHERE status IN open), so we
    // pre-query, then insert; the partial index guards the race (23505).
    const existingQueryBase = owned.supabase
      .from("dog_brain_supplement_trials")
      .select("*")
      .eq("user_id", owned.user.id)
      .eq("pet_id", owned.petId)
      .eq("supplement_name", parsed.data.supplement_name)
      .in("status", ["ask_vet", "active"]);
    // `.eq(col, null)` is not SQL NULL — use `.is` so NULL reasons dedupe too.
    const existingQuery = reasonKey
      ? existingQueryBase.eq("reason_signal_key", reasonKey)
      : existingQueryBase.is("reason_signal_key", null);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) {
      if (isMissingTable(existingError)) return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
      throw existingError;
    }
    if (existing) {
      return NextResponse.json({ data: existing, deduped: true });
    }

    const now = new Date().toISOString();
    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7d follow-up window
    const { data, error } = await owned.supabase
      .from("dog_brain_supplement_trials")
      .insert({
        user_id: owned.user.id,
        pet_id: owned.petId,
        supplement_name: parsed.data.supplement_name,
        reason_signal_key: reasonKey,
        status: "ask_vet",
        // No started_at while ask_vet — the trial hasn't started, the owner is
        // still meant to clear it with their vet first.
        started_at: null,
        follow_up_due_at: due,
        created_at: now,
        updated_at: now,
      })
      .select()
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
      // Concurrent insert won the race after our pre-query — surface the
      // existing open trial as a dedupe instead of a 500.
      if (error.code === "23505") {
        const dedupeBase = owned.supabase
          .from("dog_brain_supplement_trials")
          .select("*")
          .eq("user_id", owned.user.id)
          .eq("pet_id", owned.petId)
          .eq("supplement_name", parsed.data.supplement_name)
          .in("status", ["ask_vet", "active"]);
        const { data: raced } = await (reasonKey
          ? dedupeBase.eq("reason_signal_key", reasonKey)
          : dedupeBase.is("reason_signal_key", null)
        ).maybeSingle();
        return NextResponse.json({ data: raced ?? null, deduped: true });
      }
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[DogBrainSupplements] POST error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  // Simple outcome update by id in query for minimal impl
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Valid id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = OutcomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }

  const auth = await requireAuthenticatedApiUser({ demoMessage: "Account required" });
  if ("response" in auth) return auth.response;

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await auth.supabase
      .from("dog_brain_supplement_trials")
      .update({
        outcome: parsed.data.outcome,
        notes: parsed.data.notes ?? null,
        // Recording an outcome is terminal — the follow-up is answered, so the
        // trial must NOT stay "follow_up_due" (that would keep nagging the owner
        // for feedback they already gave).
        status: "outcome_recorded",
        outcome_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select()
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Not found or not owned" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[DogBrainSupplements] PATCH error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
