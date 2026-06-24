import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import { requireOwnedPet } from "@/lib/api/pet-guard";
import { isMissingTable } from "@/lib/api/table-missing";
import {
  recordDogBrainEvent,
  supplementTrialStartedEvent,
  supplementTrialMarkedActiveEvent,
  supplementTrialOutcomeRecordedEvent,
  toOutcomeBucket,
} from "@/lib/dog-brain/analytics";

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

// mark_active: owner has confirmed with their vet and is starting the trial.
// Allowed only from ask_vet status — cannot skip to active from a terminal state.
const MarkActiveSchema = z.object({
  action: z.literal("mark_active"),
});

const PatchBodySchema = z.union([OutcomeSchema, MarkActiveSchema]);

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
    // Privacy-safe lifecycle event (a count) — never the supplement name/notes.
    void recordDogBrainEvent(supplementTrialStartedEvent());
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[DogBrainSupplements] POST error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Valid id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const auth = await requireAuthenticatedApiUser({ demoMessage: "Account required" });
  if ("response" in auth) return auth.response;

  const nowIso = new Date().toISOString();

  try {
    if ("action" in parsed.data && parsed.data.action === "mark_active") {
      // Transition ask_vet → active. Guard: only allowed from ask_vet to prevent
      // re-opening a terminal (outcome_recorded / stopped) trial via a replay.
      const { data, error } = await auth.supabase
        .from("dog_brain_supplement_trials")
        .update({
          status: "active",
          started_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .eq("status", "ask_vet") // outcome guard: only from ask_vet
        .select()
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
        throw error;
      }
      // If no row matched, either the trial is not owned by this user or it is
      // already past ask_vet. Return 409 so the caller knows the guard fired.
      if (!data) {
        return NextResponse.json(
          { error: "Not found, not owned, or not in ask_vet status" },
          { status: 409 },
        );
      }
      void recordDogBrainEvent(supplementTrialMarkedActiveEvent());
      return NextResponse.json({ data });
    }

    // outcome branch (better / same / worse / side_effect) — terminal transition.
    // Recording an outcome is terminal — the follow-up is answered, so the
    // trial must NOT stay "follow_up_due" (that would keep nagging the owner
    // for feedback they already gave).
    //
    // Lifecycle: ask_vet -> mark_active -> active/follow_up_due -> outcome_recorded.
    // The backend must enforce vet approval: an outcome can only be recorded once
    // the trial has actually started. So the guarded update only matches a row in
    // status `active` or `follow_up_due`. This refuses to record an outcome on an
    // `ask_vet` row (skipping vet approval), on an already-terminal
    // `outcome_recorded` / `stopped` row, or on a row this user does not own.
    const outcomeData = parsed.data as { outcome: string; notes?: string | null };
    const { data, error } = await auth.supabase
      .from("dog_brain_supplement_trials")
      .update({
        outcome: outcomeData.outcome,
        notes: outcomeData.notes ?? null,
        status: "outcome_recorded",
        outcome_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .in("status", ["active", "follow_up_due"]) // guard: outcome only from a started trial
      .select()
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
      throw error;
    }
    // Zero rows matched: status is ask_vet (vet approval not done), outcome_recorded,
    // stopped, not owned, or missing. Refuse with 409 — never silently 200/500.
    if (!data) return NextResponse.json({ error: "Not found, not owned, or not in an active trial" }, { status: 409 });
    // Privacy-safe outcome bucket only (better/same/worse/side_effect) — no notes.
    void recordDogBrainEvent(
      supplementTrialOutcomeRecordedEvent({
        outcome: toOutcomeBucket(outcomeData.outcome),
      }),
    );
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[DogBrainSupplements] PATCH error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
