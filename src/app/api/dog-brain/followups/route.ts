import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

// Durable Dog Brain follow-up queue: when a watch/alert pattern appears, a
// follow-up is scheduled ("3 days since stool changed — better or worse?") and
// the owner resolves it better / worse / same. Read by the dashboard + reminders.

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(
    error.message ?? "",
  );
}

const QuerySchema = z.object({ pet_id: z.string().uuid() });

const CreateSchema = z.object({
  pet_id: z.string().uuid(),
  signal_key: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(400),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ pet_id: url.searchParams.get("pet_id") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid pet_id", code: "VALIDATION_ERROR" },
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

    const { data, error } = await auth.supabase
      .from("dog_brain_followups")
      .select("*")
      .eq("user_id", auth.user.id)
      .eq("pet_id", parsed.data.pet_id)
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

    // Idempotent on (pet_id, signal_key) while pending — the unique partial
    // index means a duplicate insert for an open signal is ignored, not nagged.
    const { data, error } = await auth.supabase
      .from("dog_brain_followups")
      .upsert(
        {
          user_id: auth.user.id,
          pet_id: parsed.data.pet_id,
          signal_key: parsed.data.signal_key,
          prompt: parsed.data.prompt,
          due_at: parsed.data.due_at ?? null,
          metadata: parsed.data.metadata ?? null,
          status: "pending",
        },
        { onConflict: "pet_id,signal_key", ignoreDuplicates: true },
      )
      .select()
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[DogBrainFollowups] POST failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
