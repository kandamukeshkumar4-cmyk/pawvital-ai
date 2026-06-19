import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";
import {
  MAX_JOURNAL_UPLOAD_BYTES,
  validateJournalUploadFile,
} from "@/app/api/journal/upload/validation";

/**
 * Daily Health Log photo upload.
 *
 * POST /api/health-log/upload  (multipart: file) → { path }
 *
 * Mirrors the journal upload convention: same shared image validator, same
 * owner-scoped Supabase Storage bucket (`journal-photos`) keyed under the
 * authenticated user's id, so it's protected by the same storage RLS policy.
 * The returned `path` is persisted in daily_health_logs.photo_urls.
 */

const MAX_UPLOAD_MB = Math.floor(MAX_JOURNAL_UPLOAD_BYTES / (1024 * 1024));

function safeFileStem(name: string): string {
  const base = name.split(/[/\\]/).pop() || "photo";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "photo";
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Database access is not configured", code: "DEMO_MODE" },
        { status: 503 },
      );
    }
    console.error("[HealthLog Upload] Supabase client error:", error);
    return NextResponse.json({ error: "Unable to connect to the database" }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  const validation = await validateJournalUploadFile(file);
  if (!validation.ok) {
    const message =
      validation.reason === "file-too-large"
        ? `File too large (max ${MAX_UPLOAD_MB}MB)`
        : validation.reason === "unsupported-file-type"
          ? "Unsupported file type"
          : "Uploaded file contents do not match a supported image file";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { buffer, detectedType, extension } = validation;
  const objectPath = `${user.id}/${Date.now()}-${safeFileStem(file.name)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("journal-photos")
    .upload(objectPath, buffer, { contentType: detectedType, upsert: false });

  if (uploadError) {
    console.error("[HealthLog Upload] Storage error:", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Short-lived signed URL so the client can show a thumbnail immediately. The
  // PATH is what's persisted; the signedUrl is display-only and best-effort.
  const { data: signed } = await supabase.storage
    .from("journal-photos")
    .createSignedUrl(objectPath, 60 * 60);

  return NextResponse.json({ path: objectPath, signedUrl: signed?.signedUrl ?? null });
}
