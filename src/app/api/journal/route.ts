import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";
import { expandJournalPhotoUrls } from "@/lib/journal-supabase";
import type { JournalEntry } from "@/types/journal";

const MoodSchema = z.enum(["happy", "normal", "low", "sick"]);

const CreateBodySchema = z.object({
  pet_id: z.string().uuid(),
  entry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  mood: MoodSchema.nullable().optional(),
  energy_level: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().trim().max(8000).nullable().optional(),
  photo_urls: z.array(z.string().min(1).max(1024)).max(12).optional(),
  ai_summary: z.string().trim().max(4000).nullable().optional(),
});

async function getSupabaseOrResponse() {
  try {
    return { supabase: await createServerSupabaseClient(), demo: false as const };
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return { demo: true as const };
    }
    console.error("[Journal] Supabase client error:", error);
    return {
      response: NextResponse.json(
        { error: "Unable to connect to the database" },
        { status: 500 }
      ),
    };
  }
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

  const ctx = await getSupabaseOrResponse();
  if ("response" in ctx && ctx.response) return ctx.response;
  if (ctx.demo) {
    return NextResponse.json(
      { error: "Database access is not configured", code: "DEMO_MODE" },
      { status: 503 }
    );
  }

  const { supabase } = ctx;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPetId = searchParams.get("pet_id");
  // Validate pet_id is a UUID before using it in the query
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const petId = rawPetId && UUID_RE.test(rawPetId) ? rawPetId : null;

  let query = supabase
    .from("journal_entries")
    .select(
      "id, user_id, pet_id, entry_date, mood, energy_level, notes, ai_summary, photo_urls, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (petId) {
    query = query.eq("pet_id", petId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Journal] List error:", error);
    return NextResponse.json(
      { error: "Failed to load journal entries" },
      { status: 500 }
    );
  }

  const rows = (data || []) as JournalEntry[];
  const withUrls = await expandJournalPhotoUrls(supabase, rows);

  return NextResponse.json({ data: withUrls });
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const ctx = await getSupabaseOrResponse();
  if ("response" in ctx && ctx.response) return ctx.response;
  if (ctx.demo) {
    return NextResponse.json(
      { error: "Database access is not configured", code: "DEMO_MODE" },
      { status: 503 }
    );
  }

  const { supabase } = ctx;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id")
    .eq("id", parsed.data.pet_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (petError) {
    console.error("[Journal] Pet lookup error:", petError);
    return NextResponse.json({ error: "Failed to verify pet" }, { status: 500 });
  }

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  const photoPaths = parsed.data.photo_urls ?? [];
  for (const p of photoPaths) {
    if (!p.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Invalid photo path", code: "INVALID_PHOTO_PATH" },
        { status: 400 }
      );
    }
  }

  const insertRow = {
    user_id: user.id,
    pet_id: parsed.data.pet_id,
    entry_date: parsed.data.entry_date ?? new Date().toISOString().slice(0, 10),
    mood: parsed.data.mood ?? null,
    energy_level: parsed.data.energy_level ?? null,
    notes: parsed.data.notes ?? null,
    photo_urls: photoPaths,
    ai_summary: parsed.data.ai_summary ?? null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("journal_entries")
    .insert(insertRow)
    .select(
      "id, user_id, pet_id, entry_date, mood, energy_level, notes, ai_summary, photo_urls, created_at, updated_at"
    )
    .maybeSingle();

  if (insertError || !inserted) {
    console.error("[Journal] Insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to create journal entry" },
      { status: 500 }
    );
  }

  const entry = inserted as JournalEntry;

  console.log(
    JSON.stringify({
      event: "journal.entry_created",
      user_id: user.id,
      entry_id: entry.id,
      pet_id: entry.pet_id,
    })
  );

  const [withUrls] = await expandJournalPhotoUrls(supabase, [entry]);

  return NextResponse.json({ data: withUrls }, { status: 201 });
}
