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

const UpdateBodySchema = z.object({
  pet_id: z.string().uuid().optional(),
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

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateBodySchema.safeParse(body);
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

  if (parsed.data.pet_id) {
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
  }

  if (parsed.data.photo_urls) {
    for (const p of parsed.data.photo_urls) {
      if (!p.startsWith(`${user.id}/`)) {
        return NextResponse.json(
          { error: "Invalid photo path", code: "INVALID_PHOTO_PATH" },
          { status: 400 }
        );
      }
    }
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.pet_id !== undefined) patch.pet_id = parsed.data.pet_id;
  if (parsed.data.entry_date !== undefined) patch.entry_date = parsed.data.entry_date;
  if (parsed.data.mood !== undefined) patch.mood = parsed.data.mood;
  if (parsed.data.energy_level !== undefined)
    patch.energy_level = parsed.data.energy_level;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (parsed.data.photo_urls !== undefined) patch.photo_urls = parsed.data.photo_urls;
  if (parsed.data.ai_summary !== undefined) patch.ai_summary = parsed.data.ai_summary;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("journal_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(
      "id, user_id, pet_id, entry_date, mood, energy_level, notes, ai_summary, photo_urls, created_at, updated_at"
    )
    .maybeSingle();

  if (updateError) {
    console.error("[Journal] Update error:", updateError);
    return NextResponse.json(
      { error: "Failed to update journal entry" },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entry = updated as JournalEntry;
  const [withUrls] = await expandJournalPhotoUrls(supabase, [entry]);

  return NextResponse.json({ data: withUrls });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
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

  const { data: removed, error: deleteError } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("[Journal] Delete error:", deleteError);
    return NextResponse.json(
      { error: "Failed to delete journal entry" },
      { status: 500 }
    );
  }

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
