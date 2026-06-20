import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  enqueueJob,
  type EnqueueServiceBusJobOptions,
} from "@/lib/azure/service-bus";
import {
  SYMPTOM_CHAT_TURN_JOB_TYPE,
  toServiceBusJobPayload,
  type SymptomChatTurnAction,
} from "@/lib/symptom-chat/async-turn-contract";
import {
  deleteTriageJob,
  putTriageJobInput,
  type SymptomChatTurnInput,
  type SymptomChatTurnMessage,
  type TriageJobStoreOptions,
} from "@/lib/symptom-chat/async-turn-store";
import type { PetProfile, TriageSession } from "@/lib/triage-engine";

// =============================================================================
// Async symptom-chat turn — offload decision (route side).
//
// When async delivery is possible, the route persists the untouched turn, hands
// a safe {jobId} ref to the Service Bus worker, and returns 202 immediately. Any
// failure (no verified user/session, storage unavailable, feature flag off)
// returns null so the route falls back to its normal synchronous processing.
// =============================================================================

export const ASYNC_WORKER_REPLAY_HEADER = "x-pawvital-async-replay";

export function asyncWorkerReplaySecret(): string {
  return (
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() ||
    process.env.HF_SIDECAR_API_KEY?.trim() ||
    ""
  );
}

/**
 * True when the request is the Service Bus worker replaying a stored turn back
 * through the synchronous pipeline. Such requests bypass rate limiting and the
 * async-offload branch (otherwise the job would re-enqueue itself forever).
 */
export function isAsyncWorkerReplay(request: Request): boolean {
  const secret = asyncWorkerReplaySecret();
  if (!secret) {
    return false;
  }
  const header = request.headers.get(ASYNC_WORKER_REPLAY_HEADER)?.trim() ?? "";
  return header.length > 0 && header === secret;
}

export type MaybeOffloadParams = {
  action: SymptomChatTurnAction;
  enqueueOptions?: EnqueueServiceBusJobOptions;
  image?: string;
  imageMeta?: unknown;
  messages: SymptomChatTurnMessage[];
  pet: PetProfile;
  session?: TriageSession;
  sessionId: string | null;
  storeOptions?: TriageJobStoreOptions;
  userId: string | null;
};

export type AsyncOffloadResult = {
  jobId: string;
  response: NextResponse;
};

export async function maybeOffloadSymptomChatTurn(
  params: MaybeOffloadParams
): Promise<AsyncOffloadResult | null> {
  const { userId, sessionId, action } = params;

  // Async offload is opt-in. The turn is enqueued to Service Bus and a separate
  // worker must consume the queue and replay it; in serverless prod without that
  // consumer wired, the job enqueues but never completes and the client polls
  // 202 forever ("Thinking…" hangs). Default OFF → process synchronously (single
  // question turns finish well under the platform timeout). Set
  // SYMPTOM_CHAT_ASYNC_OFFLOAD_ENABLED=true only once a Service Bus consumer is
  // confirmed to invoke /api/azure/service-bus/worker in that environment.
  if (process.env.SYMPTOM_CHAT_ASYNC_OFFLOAD_ENABLED !== "true") {
    return null;
  }

  // Delivery rides the per-user Web PubSub channel; without a verified user and
  // a live session there is no way to push the result, so stay synchronous.
  if (!userId || !sessionId) {
    return null;
  }

  // Without a replay secret the worker cannot authenticate its own replay
  // request through isAsyncWorkerReplay. Offloading without a secret would
  // cause the worker's POST to be treated as a fresh user request, which
  // re-enters this branch, stores another blob, and enqueues another job —
  // an infinite loop until the queue's dead-letter limit is hit.
  if (!asyncWorkerReplaySecret()) {
    return null;
  }

  const jobId = randomUUID();
  const input: SymptomChatTurnInput = {
    action,
    createdAt: new Date().toISOString(),
    image: params.image,
    imageMeta: params.imageMeta,
    jobId,
    messages: params.messages,
    pet: params.pet,
    session: params.session,
    sessionId,
    userId,
  };

  const stored = await putTriageJobInput(input, params.storeOptions);
  if (!stored) {
    // Storage not configured (demo) or write failed — process inline.
    return null;
  }

  const enqueued = await enqueueJob(
    SYMPTOM_CHAT_TURN_JOB_TYPE,
    toServiceBusJobPayload({ action, jobId, sessionId, userId }),
    { jobId, ...params.enqueueOptions }
  );
  if (!enqueued.ok) {
    // Feature flag off / not configured / send failed — drop the orphan blob
    // and let the route run the turn synchronously.
    await deleteTriageJob(jobId, params.storeOptions);
    return null;
  }

  return {
    jobId,
    response: NextResponse.json(
      {
        type: "async_pending",
        jobId,
        sessionId,
        status: "processing",
        ready_for_report: false,
      },
      { status: 202 }
    ),
  };
}
