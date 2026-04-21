import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

const EXPIRY: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const ShareBodySchema = z.object({
  check_id: z.string().uuid(),
  expires_in: z.enum(["24h", "7d", "30d"]).optional().default("7d"),
});

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit?.startsWith("http")) return explicit;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
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

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Sharing requires a configured account", code: "DEMO_MODE" },
        { status: 503 }
      );
    }
    console.error("[reports/share] Supabase client error:", error);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ShareBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { check_id, expires_in } = parsed.data;

  const { data: checkRow, error: checkError } = await supabase
    .from("symptom_checks")
    .select("id, pet_id")
    .eq("id", check_id)
    .maybeSingle();

  if (checkError) {
    console.error("[reports/share] Symptom check lookup failed:", checkError);
    return NextResponse.json({ error: "Unable to verify symptom check" }, { status: 500 });
  }

  if (!checkRow?.pet_id) {
    return NextResponse.json(
      { error: "Symptom check not found or access denied" },
      { status: 403 }
    );
  }

  const { data: petRow, error: petError } = await supabase
    .from("pets")
    .select("id, user_id")
    .eq("id", checkRow.pet_id)
    .maybeSingle();

  if (petError || !petRow || petRow.user_id !== user.id) {
    return NextResponse.json(
      { error: "Symptom check not found or access denied" },
      { status: 403 }
    );
  }

  const shareToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + EXPIRY[expires_in]);

  const { data: inserted, error: insertError } = await supabase
    .from("shared_reports")
    .insert({
      check_id,
      share_token: shareToken,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("expires_at")
    .maybeSingle();

  if (insertError || !inserted) {
    console.error("[reports/share] Insert failed:", insertError);
    return NextResponse.json(
      { error: "Unable to create share link. Ensure shared_reports table exists." },
      { status: 503 }
    );
  }

  const share_url = `${appBaseUrl()}/shared/${shareToken}`;
  const expires_at =
    typeof inserted.expires_at === "string"
      ? inserted.expires_at
      : new Date(inserted.expires_at as string).toISOString();

  return NextResponse.json({ share_url, expires_at });
}
