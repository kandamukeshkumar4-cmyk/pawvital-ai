import { after } from "next/server";
import { z } from "zod";
import {
  isAsyncReviewServiceConfigured,
  submitAsyncReviewToSidecar,
} from "@/lib/hf-sidecars";
import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import type { VisionPreprocessResult, VisionSeverityClass } from "@/lib/clinical-evidence";
import { imageAnalysisLimiter } from "@/lib/rate-limit";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api-route";
import { isProductionEnvironment } from "@/lib/env";

const ASYNC_REVIEW_WEBHOOK_SECRET =
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() || "";

const AsyncReviewRequestBodySchema = z.object({
  image: z.string().min(1),
  pet: z.custom<PetProfile>(
    (value) => typeof value === "object" && value !== null,
    "pet is required"
  ),
  session: z.custom<TriageSession>(
    (value) => typeof value === "object" && value !== null,
    "session is required"
  ),
  report: z.record(z.unknown()).optional(),
});

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
  const rateLimitError = await enforceRateLimit(request, imageAnalysisLimiter);
  if (rateLimitError) {
    return rateLimitError;
  }

  if (
    isProductionEnvironment() &&
    isAsyncReviewServiceConfigured() &&
    !ASYNC_REVIEW_WEBHOOK_SECRET
  ) {
    return jsonError(
      "Async review secret is not configured",
      503,
      "ASYNC_REVIEW_SECRET_MISSING"
    );
  }

  if (
    ASYNC_REVIEW_WEBHOOK_SECRET &&
    request.headers.get("x-async-review-secret") !== ASYNC_REVIEW_WEBHOOK_SECRET
  ) {
    return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (!isAsyncReviewServiceConfigured()) {
    return jsonError(
      "Async review service is not configured",
      503,
      "ASYNC_REVIEW_UNAVAILABLE"
    );
  }

  const parsedBody = await parseJsonBody(request, AsyncReviewRequestBodySchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const image = parsedBody.data.image;
  const session = parsedBody.data.session;
  const report = parsedBody.data.report;

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
    return jsonOk(
      { queued: completed, mode: "inline-fallback" },
      { status: completed ? 202 : 502 }
    );
  }

  return jsonOk(
    { queued: true, mode: "after" },
    { status: 202 }
  );
}
