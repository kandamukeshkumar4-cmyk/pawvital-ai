import type { PetProfile, TriageSession } from "./triage-engine";

const ASYNC_REVIEW_WEBHOOK_SECRET =
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() || "";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function isAsyncReviewQueueConfigured(baseUrl?: string): boolean {
  return Boolean(baseUrl && normalizeBaseUrl(baseUrl));
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
  });

  return response.ok;
}
