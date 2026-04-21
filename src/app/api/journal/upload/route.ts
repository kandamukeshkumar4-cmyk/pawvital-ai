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
} from "./validation";

function safeFileStem(name: string): string {
  const base = name.split(/[/\\]/).pop() || "photo";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "photo";
}

const MAX_JOURNAL_UPLOAD_MB = Math.floor(
  MAX_JOURNAL_UPLOAD_BYTES / (1024 * 1024)
);

async function getSupabaseOrResponse() {
  try {
    return { supabase: await createServerSupabaseClient(), demo: false as const };
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return { demo: true as const };
    }
    console.error("[Journal Upload] Supabase client error:", error);
    return {
      response: NextResponse.json(
        { error: "Unable to connect to the database" },
        { status: 500 }
      ),
    };
  }
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file field" },
      { status: 400 }
    );
  }

  const validation = await validateJournalUploadFile(file);
  if (!validation.ok && validation.reason === "file-too-large") {
    return NextResponse.json(
      { error: `File too large (max ${MAX_JOURNAL_UPLOAD_MB}MB)` },
      { status: 400 }
    );
  }

  if (!validation.ok && validation.reason === "unsupported-file-type") {
    return NextResponse.json(
      { error: "Unsupported file type" },
      { status: 400 }
    );
  }

  if (!validation.ok) {
    return NextResponse.json(
      { error: "Uploaded file contents do not match a supported image file" },
      { status: 400 }
    );
  }

  const { buffer, detectedType, extension } = validation;

  const objectPath = `${user.id}/${Date.now()}-${safeFileStem(file.name)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("journal-photos")
    .upload(objectPath, buffer, {
      contentType: detectedType,
      upsert: false,
    });

  if (uploadError) {
    console.error("[Journal Upload] Storage error:", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  return NextResponse.json({ path: objectPath });
}
