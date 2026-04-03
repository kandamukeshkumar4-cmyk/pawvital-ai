import type { PetProfile, TriageSession } from "./triage-engine";

const ASYNC_REVIEW_WEBHOOK_SECRET =
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() || "";

// VET-711: Timeout for async review submission (30 seconds)
// Can be overridden via ASYNC_REVIEW_TIMEOUT_MS environment variable
const ASYNC_REVIEW_TIMEOUT_MS =
  Number(process.env.ASYNC_REVIEW_TIMEOUT_MS) || 30000;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function isAsyncReviewQueueConfigured(baseUrl?: string): boolean {
  return Boolean(baseUrl && normalizeBaseUrl(baseUrl));
}

// VET-711: Added AbortController timeout for production safety
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
    if (error instanceof DOMException && error.name === "AbortError") {
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
