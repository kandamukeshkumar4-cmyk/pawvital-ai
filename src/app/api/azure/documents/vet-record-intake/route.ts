import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { intakeVetRecordDocument } from "@/lib/azure/document-intelligence";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_VET_RECORD_BYTES = 10 * 1024 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * VET-DOG-BRAIN #3: persist the extracted vet-record summary as durable,
 * pet-scoped Dog Brain memory. Best-effort and strictly additive — runs only
 * when the caller passes an owned pet_id, the extraction succeeded, and the
 * table exists. A missing table or any failure is swallowed so document intake
 * keeps working exactly as before.
 */
async function persistVetRecordSummary(
  supabase: SupabaseClient,
  userId: string,
  petId: string,
  fileName: string,
  result: Awaited<ReturnType<typeof intakeVetRecordDocument>>,
): Promise<void> {
  if (!result.enabled || !result.ok) return;
  try {
    const { data: pet } = await supabase
      .from("pets")
      .select("id")
      .eq("id", petId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!pet) return; // not the owner's pet — never persist
    await supabase.from("vet_record_summaries").insert({
      user_id: userId,
      pet_id: petId,
      file_name: fileName,
      context_text: result.contextText ?? null,
      extracted_fields: result.fields ?? null,
      page_count: result.pageCount ?? null,
    });
  } catch {
    /* table missing or transient error — intake still succeeds */
  }
}
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: NO_STORE_HEADERS,
    status,
  });
}

function safeFileStem(name: string): string {
  const base = name.split(/[/\\]/).pop() || "vet-record.pdf";
  return (
    base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "vet-record.pdf"
  );
}

function isPdf(buffer: Buffer, file: File): boolean {
  const declaredType = file.type.trim().toLowerCase();
  const declaredName = file.name.trim().toLowerCase();
  return (
    declaredType === "application/pdf" &&
    declaredName.endsWith(".pdf") &&
    buffer.subarray(0, 5).toString("utf8") === "%PDF-"
  );
}

function responseForIntakeResult(
  result: Awaited<ReturnType<typeof intakeVetRecordDocument>>,
) {
  if (!result.enabled && result.reason === "feature_disabled") {
    return jsonNoStore({ enabled: false });
  }

  if (!result.enabled) {
    return jsonNoStore(
      {
        code: "DOCUMENT_INTAKE_UNAVAILABLE",
        enabled: false,
      },
      503,
    );
  }

  if (!result.ok) {
    return jsonNoStore(
      {
        code: "DOCUMENT_CONTENT_BLOCKED",
        enabled: true,
        pageCount: result.pageCount,
      },
      422,
    );
  }

  return jsonNoStore({
    contentLength: result.contentLength,
    contextText: result.contextText,
    enabled: true,
    fields: result.fields,
    pageCount: result.pageCount,
  });
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Document intake is unavailable in demo mode",
  });
  if ("response" in auth) {
    return auth.response;
  }

  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request, auth.user.id),
  );
  if (!rateLimitResult.success) {
    return jsonNoStore({ error: "Too many requests. Please slow down." }, 429);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonNoStore({ error: "Expected multipart form data" }, 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return jsonNoStore({ error: "Missing file field" }, 400);
  }

  if (file.size > MAX_VET_RECORD_BYTES) {
    return jsonNoStore({ error: "File too large" }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isPdf(buffer, file)) {
    return jsonNoStore({ error: "Unsupported file type" }, 400);
  }

  const blobName = [
    "vet-record-intake",
    auth.user.id,
    `${Date.now()}-${randomUUID()}-${safeFileStem(file.name)}`,
  ].join("/");

  const result = await intakeVetRecordDocument({
    blobName,
    body: buffer,
    contentType: "application/pdf",
    fileName: safeFileStem(file.name),
  });

  // Durable Dog Brain memory (#3): persist the summary when an owned pet_id is
  // supplied. Best-effort — never affects the intake response.
  const petIdRaw = formData.get("pet_id");
  const petId =
    typeof petIdRaw === "string" && UUID_RE.test(petIdRaw) ? petIdRaw : null;
  if (petId) {
    await persistVetRecordSummary(
      auth.supabase,
      auth.user.id,
      petId,
      safeFileStem(file.name),
      result,
    );
  }

  return responseForIntakeResult(result);
}
