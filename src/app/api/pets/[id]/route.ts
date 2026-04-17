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

function rateLimitError() {
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": "60",
      },
    }
  );
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );

  if (!rateLimitResult.success) {
    return rateLimitError();
  }

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing pet id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: pet, error: fetchError } = await supabase
      .from("pets")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      if (isMissingTableError(fetchError)) {
        return NextResponse.json(
          { error: "Pets are temporarily unavailable" },
          { status: 503 }
        );
      }

      throw fetchError;
    }

    if (!pet) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    if (pet.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ pet });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Pets are temporarily unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );

  if (!rateLimitResult.success) {
    return rateLimitError();
  }

  try {
    const { id } = await context.params;
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

    const { data: existing, error: fetchError } = await supabase
      .from("pets")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      if (isMissingTableError(fetchError)) {
        return NextResponse.json(
          { error: "Pets are temporarily unavailable" },
          { status: 503 }
        );
      }

      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cleanBody = { ...body } as Record<string, unknown>;
    delete cleanBody.id;
    delete cleanBody.user_id;

    if (Object.keys(cleanBody).length === 0) {
      return NextResponse.json({ error: "Missing fields to update" }, { status: 400 });
    }

    if (typeof cleanBody.species === "string") {
      const normalizedSpecies = cleanBody.species.trim().toLowerCase();
      if (normalizedSpecies !== "dog") {
        return NextResponse.json(
          { error: "PawVital currently supports dogs only." },
          { status: 400 }
        );
      }
      cleanBody.species = "dog";
    }

    const { data: pet, error } = await supabase
      .from("pets")
      .update(cleanBody)
      .eq("id", id)
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
      return NextResponse.json(
        { error: "Pets are temporarily unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );

  if (!rateLimitResult.success) {
    return rateLimitError();
  }

  try {
    const { id } = await context.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("pets")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      if (isMissingTableError(fetchError)) {
        return NextResponse.json(
          { error: "Pets are temporarily unavailable" },
          { status: 503 }
        );
      }

      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("pets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: "Pets are temporarily unavailable" },
          { status: 503 }
        );
      }

      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Pets are temporarily unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
