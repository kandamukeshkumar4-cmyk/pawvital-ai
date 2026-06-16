import {
  isSymptomChatTurnJobRef,
  SYMPTOM_CHAT_TURN_JOB_TYPE,
  type SymptomChatTurnAction,
  type SymptomChatTurnJobRef,
} from "@/lib/symptom-chat/async-turn-contract";
import {
  asyncWorkerReplaySecret,
  ASYNC_WORKER_REPLAY_HEADER,
} from "@/lib/symptom-chat/async-turn-offload";
import {
  getTriageJobInput,
  putTriageJobResult,
  type SymptomChatTurnResult,
  type SymptomChatTurnResultStatus,
  type TriageJobStoreOptions,
} from "@/lib/symptom-chat/async-turn-store";
import {
  publishTriageLiveUpdate,
  type TriageLiveUpdateStatus,
  type WebPubSubOptions,
} from "@/lib/azure/web-pubsub";
import type {
  ServiceBusWorkerJob,
  ServiceBusWorkerJobHandler,
} from "@/lib/azure/service-bus-worker";

// =============================================================================
// Async symptom-chat turn — worker handler.
//
// Loads the stored turn, replays it through the existing symptom-chat POST
// handler (the replay header makes that handler process synchronously instead of
// re-enqueueing), persists the response, and pushes a status ping over Web
// PubSub. The clinical pipeline is reused verbatim — nothing here re-implements
// triage logic.
// =============================================================================

export type SymptomChatRoutePost = (request: Request) => Promise<Response>;

export type SymptomChatTurnWorkerOptions = {
  baseUrl?: string;
  publishOptions?: WebPubSubOptions;
  routePost?: SymptomChatRoutePost;
  storeOptions?: TriageJobStoreOptions;
};

function resolveBaseUrl(explicit?: string): string {
  return (
    explicit?.trim() ||
    process.env.PAWVITAL_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000"
  );
}

async function loadRoutePost(): Promise<SymptomChatRoutePost> {
  const mod = await import("@/app/api/ai/symptom-chat/route");
  return mod.POST as SymptomChatRoutePost;
}

function resultStatusFor(
  action: SymptomChatTurnAction,
  ok: boolean
): SymptomChatTurnResultStatus {
  if (!ok) {
    return "failed";
  }
  return action === "generate_report" ? "report_ready" : "response_ready";
}

function liveStatusFor(
  status: SymptomChatTurnResultStatus
): TriageLiveUpdateStatus {
  // SymptomChatTurnResultStatus is a strict subset of TriageLiveUpdateStatus.
  return status;
}

export async function processSymptomChatTurnJob(
  ref: SymptomChatTurnJobRef,
  options: SymptomChatTurnWorkerOptions = {}
): Promise<SymptomChatTurnResult> {
  const input = await getTriageJobInput(ref.jobId, options.storeOptions);

  let result: SymptomChatTurnResult;
  if (!input) {
    result = {
      action: ref.action,
      completedAt: new Date().toISOString(),
      error: "input_missing",
      jobId: ref.jobId,
      sessionId: ref.sessionId,
      status: "failed",
      userId: ref.userId,
    };
  } else {
    const routePost = options.routePost ?? (await loadRoutePost());
    const baseUrl = resolveBaseUrl(options.baseUrl);
    const request = new Request(`${baseUrl}/api/ai/symptom-chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [ASYNC_WORKER_REPLAY_HEADER]: asyncWorkerReplaySecret(),
      },
      body: JSON.stringify({
        action: input.action,
        image: input.image,
        imageMeta: input.imageMeta,
        messages: input.messages,
        pet: input.pet,
        session: input.session,
      }),
    });

    let ok = false;
    let body: unknown;
    try {
      const response = await routePost(request);
      ok = response.ok;
      body = await response.json().catch(() => undefined);
    } catch {
      ok = false;
      body = undefined;
    }

    result = {
      action: input.action,
      body,
      completedAt: new Date().toISOString(),
      error: ok ? undefined : "turn_failed",
      jobId: ref.jobId,
      sessionId: ref.sessionId,
      status: resultStatusFor(input.action, ok),
      userId: ref.userId,
    };
  }

  await putTriageJobResult(result, options.storeOptions);

  // Status ping is best-effort; the client can always poll the result route.
  try {
    await publishTriageLiveUpdate(
      {
        action: result.action,
        sessionId: result.sessionId,
        status: liveStatusFor(result.status),
        userId: ref.userId,
      },
      options.publishOptions
    );
  } catch {
    // Never let live-update delivery fail the job — the result is already stored.
  }

  return result;
}

/**
 * Service Bus job handler. Dispatches symptom-chat-turn jobs; other (currently
 * unused) job types are completed without action so they never poison-loop.
 */
export function createSymptomChatTurnHandler(
  options: SymptomChatTurnWorkerOptions = {}
): ServiceBusWorkerJobHandler {
  return async (job: ServiceBusWorkerJob): Promise<void> => {
    if (job.type !== SYMPTOM_CHAT_TURN_JOB_TYPE) {
      return;
    }
    const ref = job.payload;
    if (!isSymptomChatTurnJobRef(ref)) {
      throw new Error("invalid_symptom_chat_turn_ref");
    }
    await processSymptomChatTurnJob(ref, options);
  };
}
