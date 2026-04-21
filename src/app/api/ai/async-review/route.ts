import { after, NextResponse } from "next/server";
import {
  isAsyncReviewServiceConfigured,
  submitAsyncReviewToSidecar,
} from "@/lib/hf-sidecars";
import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import type { VisionPreprocessResult, VisionSeverityClass } from "@/lib/clinical-evidence";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

const MAX_CONTENT_LENGTH_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PAYLOAD_LENGTH = 8 * 1024 * 1024;

interface AsyncReviewRequestBody {
  image: string;
  pet: PetProfile;
  session: TriageSession;
  report?: Record<string, unknown>;
}

function getAsyncReviewWebhookSecret(): string {
  return process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() || "";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function buildAsyncReviewUnavailableResponse() {
  return NextResponse.json(
    { error: "Async review is unavailable" },
    { status: 503 }
  );
}

function buildInvalidRequestBodyResponse() {
  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}

function buildPayloadTooLargeResponse() {
  return NextResponse.json(
    { error: "Async review payload is too large" },
    { status: 413 }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOversizedContentLength(request: Request): boolean {
  const contentLength = Number(request.headers.get("content-length") || "");
  return Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH_BYTES;
}

function isPayloadTooLarge(rawBody: string): boolean {
  return new TextEncoder().encode(rawBody).length > MAX_CONTENT_LENGTH_BYTES;
}

function parseAsyncReviewRequestBody(
  rawBody: string
): AsyncReviewRequestBody | "missing-required" | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (!("image" in parsed) || !("pet" in parsed) || !("session" in parsed)) {
      return "missing-required";
    }

    if (
      typeof parsed.image !== "string" ||
      !parsed.image ||
      !isRecord(parsed.pet) ||
      !isRecord(parsed.session) ||
      (parsed.report !== undefined && !isRecord(parsed.report))
    ) {
      return null;
    }

    return {
      image: parsed.image,
      pet: parsed.pet as unknown as PetProfile,
      session: parsed.session as unknown as TriageSession,
      ...(parsed.report !== undefined
        ? { report: parsed.report as Record<string, unknown> }
        : {}),
    };
  } catch {
    return null;
  }
}

function buildFallbackPreprocess(session: TriageSession): VisionPreprocessResult {
  return {
    domain: session.latest_image_domain || "unsupported",
    bodyRegion: session.latest_image_body_region || null,
    detectedRegions: [],
    bestCrop: null,
    imageQuality:
      session.latest_image_quality === "poor" ||
      session.latest_image_quality === "borderline" ||
      session.latest_image_quality === "good" ||
      session.latest_image_quality === "excellent"
        ? session.latest_image_quality
        : "borderline",
    confidence: 0.45,
    limitations: ["async review fallback preprocess"],
  };
}

function scheduleAfterSafely(task: () => Promise<unknown>): boolean {
  try {
    after(async () => {
      await task();
    });
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      /outside a request scope/i.test(error.message)
    ) {
      return false;
    }

    console.error("[Async Review] failed to schedule after task:", error);
    return false;
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

  if (hasOversizedContentLength(request)) {
    return buildPayloadTooLargeResponse();
  }

  const webhookSecret = getAsyncReviewWebhookSecret();
  if (isProduction() && !webhookSecret) {
    return buildAsyncReviewUnavailableResponse();
  }

  if (
    webhookSecret &&
    request.headers.get("x-async-review-secret") !== webhookSecret
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAsyncReviewServiceConfigured()) {
    return buildAsyncReviewUnavailableResponse();
  }

  const rawBody = await request.text();
  if (isPayloadTooLarge(rawBody)) {
    return buildPayloadTooLargeResponse();
  }

  const body = parseAsyncReviewRequestBody(rawBody);
  if (body === "missing-required") {
    return NextResponse.json(
      { error: "image, pet, and session are required" },
      { status: 400 }
    );
  }

  if (!body) {
    return buildInvalidRequestBodyResponse();
  }

  const image = body.image;
  const session = body.session;
  const report = body.report;

  if (image.length > MAX_IMAGE_PAYLOAD_LENGTH) {
    return NextResponse.json(
      { error: "Async review image payload is too large" },
      { status: 413 }
    );
  }

  const task = async (): Promise<boolean> => {
    try {
      await submitAsyncReviewToSidecar({
        image,
        ownerText:
          session.case_memory?.latest_owner_turn ||
          "Async specialist review requested for a completed veterinary case.",
        preprocess: session.latest_preprocess || buildFallbackPreprocess(session),
        visionSummary:
          session.vision_analysis ||
          String(report?.clinical_notes || report?.explanation || "").trim(),
        severity:
          (session.vision_severity as VisionSeverityClass | undefined) ||
          "needs_review",
        contradictions: session.latest_visual_evidence?.contradictions || [],
        deterministicFacts: session.extracted_answers || {},
      });
      return true;
    } catch (error) {
      console.error("[Async Review] background consult failed:", error);
      return false;
    }
  };

  const scheduled = scheduleAfterSafely(task);
  if (!scheduled) {
    const completed = await task();
    return NextResponse.json(
      { queued: completed, mode: "inline-fallback" },
      { status: completed ? 202 : 502 }
    );
  }

  return NextResponse.json(
    { queued: true, mode: "after" },
    { status: 202 }
  );
}
