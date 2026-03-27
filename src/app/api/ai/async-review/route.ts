import { after, NextResponse } from "next/server";
import {
  consultWithMultimodalSidecar,
  isAsyncReviewServiceConfigured,
  isMultimodalConsultConfigured,
} from "@/lib/hf-sidecars";
import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import type { VisionPreprocessResult, VisionSeverityClass } from "@/lib/clinical-evidence";

const ASYNC_REVIEW_WEBHOOK_SECRET =
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() || "";

interface AsyncReviewRequestBody {
  image?: string;
  pet?: PetProfile;
  session?: TriageSession;
  report?: Record<string, unknown>;
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

function scheduleAfterSafely(task: () => Promise<void>): boolean {
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
  if (
    ASYNC_REVIEW_WEBHOOK_SECRET &&
    request.headers.get("x-async-review-secret") !== ASYNC_REVIEW_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAsyncReviewServiceConfigured() && !isMultimodalConsultConfigured()) {
    return NextResponse.json(
      { error: "Async review service is not configured" },
      { status: 503 }
    );
  }

  let body: AsyncReviewRequestBody;
  try {
    body = (await request.json()) as AsyncReviewRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.image || !body.pet || !body.session) {
    return NextResponse.json(
      { error: "image, pet, and session are required" },
      { status: 400 }
    );
  }

  const image = body.image;
  const pet = body.pet;
  const session = body.session;
  const report = body.report;

  const task = async () => {
    try {
      await consultWithMultimodalSidecar({
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
        mode: "async",
      });
    } catch (error) {
      console.error("[Async Review] background consult failed:", error);
    }
  };

  const scheduled = scheduleAfterSafely(task);
  if (!scheduled) {
    await task();
  }

  return NextResponse.json(
    { queued: true, mode: scheduled ? "after" : "inline-fallback" },
    { status: 202 }
  );
}
