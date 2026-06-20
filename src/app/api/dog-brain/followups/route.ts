import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import { requireOwnedPet } from "@/lib/api/pet-guard";
import { isMissingTable } from "@/lib/api/table-missing";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

// Durable Dog Brain follow-up queue: when a watch/alert pattern appears, a
// follow-up is scheduled ("3 days since stool changed — better or worse?") and
// the owner resolves it better / worse / same. Read by the dashboard + reminders.

const CreateSchema = z.object({
  pet_id: z.string().uuid(),
  signal_key: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(400),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const owned = await requireOwnedPet({
    request,
    petId: url.searchParams.get("pet_id"),
    demoMessage: "Follow-ups require a configured account backend",
  });
  if ("response" in owned) return owned.response;

  try {
    const { data, error } = await owned.supabase
      .from("dog_brain_followups")
      .select("*")
      .eq("user_id", owned.user.id)
      .eq("pet_id", owned.petId)
      .eq("status", "pending")
      .order("due_at", { ascending: true });

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ data: [], code: "TABLE_MISSING" });
      }
      throw error;
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error("[DogBrainFollowups] GET failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid follow-up", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Follow-ups require a configured account backend",
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
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

    // Idempotent on (pet_id, signal_key) while pending. PostgREST upsert can't
    // target the partial unique index (WHERE status = 'pending'), so we dedup
    // with an explicit pre-query, then insert. The partial index still guards the
    // race: a concurrent insert raises 23505, which we treat as "already exists".
    const { data: existing, error: existingError } = await auth.supabase
      .from("dog_brain_followups")
      .select("*")
      .eq("user_id", auth.user.id)
      .eq("pet_id", parsed.data.pet_id)
      .eq("signal_key", parsed.data.signal_key)
      .eq("status", "pending")
      .maybeSingle();
    if (existingError) {
      if (isMissingTable(existingError)) {
        return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
      }
      throw existingError;
    }
    if (existing) {
      return NextResponse.json({ data: existing, deduped: true });
    }

    // Default a follow-up to 3 days out when the caller doesn't schedule one,
    // so it surfaces on its own timeline rather than immediately.
    const dueAt =
      parsed.data.due_at ??
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await auth.supabase
      .from("dog_brain_followups")
      .insert({
        user_id: auth.user.id,
        pet_id: parsed.data.pet_id,
        signal_key: parsed.data.signal_key,
        prompt: parsed.data.prompt,
        due_at: dueAt,
        metadata: parsed.data.metadata ?? null,
        status: "pending",
      })
      .select()
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
      }
      // Unique-violation = a concurrent request already created the open
      // follow-up. Treat as success (deduped), never a 500.
      if (error.code === "23505") {
        return NextResponse.json({ deduped: true });
      }
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[DogBrainFollowups] POST failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
