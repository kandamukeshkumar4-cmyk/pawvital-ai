import type { PetProfile, TriageSession } from "./triage-engine";

const ASYNC_REVIEW_WEBHOOK_SECRET =
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() || "";

function parseAsyncReviewTimeoutMs(rawValue?: string): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

const ASYNC_REVIEW_TIMEOUT_MS = parseAsyncReviewTimeoutMs(
  process.env.ASYNC_REVIEW_TIMEOUT_MS
);

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function isAsyncReviewQueueConfigured(baseUrl?: string): boolean {
  return Boolean(baseUrl && normalizeBaseUrl(baseUrl));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function enqueueAsyncReview(input: {
  baseUrl: string;
  image: string;
  pet: PetProfile;
  session: TriageSession;
  report?: Record<string, unknown>;
}): Promise<boolean> {
  if (!isAsyncReviewQueueConfigured(input.baseUrl)) {
    return false;
  }

  const endpoint = `${normalizeBaseUrl(input.baseUrl)}/api/ai/async-review`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ASYNC_REVIEW_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ASYNC_REVIEW_WEBHOOK_SECRET
          ? { "x-async-review-secret": ASYNC_REVIEW_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        image: input.image,
        pet: input.pet,
        session: input.session,
        report: input.report,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    return response.ok;
  } catch (error) {
    if (isAbortError(error)) {
      console.error(
        "[Async Review] Submission timeout after",
        ASYNC_REVIEW_TIMEOUT_MS,
        "ms"
      );
    } else {
      console.error("[Async Review] Submission failed:", error);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
