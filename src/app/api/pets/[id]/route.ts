import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    
    const { data: existing, error: fetchError } = await supabase
      .from("pets")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    if (existing.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const cleanBody = { ...body };
    delete cleanBody.id;
    delete cleanBody.user_id;

    const { data: pet, error } = await supabase
      .from("pets")
      .update(cleanBody)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ pet });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
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
      .single();

    if (fetchError || !existing) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    if (existing.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Soft delete
    const { error } = await supabase
      .from("pets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
