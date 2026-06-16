import { getBlobClient, type AzureClientOptions } from "@/lib/azure";
import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import type {
  SymptomChatTurnAction,
  SymptomChatTurnJobRef,
} from "@/lib/symptom-chat/async-turn-contract";

// =============================================================================
// Async symptom-chat turn — durable Blob job store.
//
// The Service Bus queue cannot carry conversation content (privacy guard), so an
// async turn stashes the full turn input here and the worker loads it by jobId.
// Two blobs per job under the `triage-jobs` container:
//   {jobId}/input.json   — the turn request (messages/pet/image/session)
//   {jobId}/result.json  — the worker's response, fetched by the client
// Both are server-only (worker + auth'd result route); never client-readable.
// Azure Storage encrypts at rest; deleteTriageJob() cleans up after delivery.
// =============================================================================

export const TRIAGE_JOBS_CONTAINER = "triage-jobs";

export type SymptomChatTurnMessage = {
  content: string;
  role: "assistant" | "user";
};

export type SymptomChatTurnInput = SymptomChatTurnJobRef & {
  createdAt: string;
  image?: string;
  imageMeta?: unknown;
  messages: SymptomChatTurnMessage[];
  pet: PetProfile;
  session?: TriageSession;
};

export type SymptomChatTurnResultStatus =
  | "response_ready"
  | "report_ready"
  | "failed";

export type SymptomChatTurnResult = {
  action: SymptomChatTurnAction;
  body?: unknown;
  completedAt: string;
  error?: string;
  jobId: string;
  sessionId: string;
  status: SymptomChatTurnResultStatus;
  // Recorded so the result-fetch route can authorize ownership without the
  // input blob (which may be cleaned up independently).
  userId: string;
};

type TriageJobBlobClientLike = {
  deleteIfExists?: () => Promise<{ succeeded?: boolean }>;
  downloadToBuffer: () => Promise<Buffer>;
  uploadData: (
    body: Buffer,
    options?: {
      blobHTTPHeaders?: { blobContentType?: string };
    }
  ) => Promise<{ etag?: string }>;
};

export type TriageJobStoreOptions =
  AzureClientOptions<TriageJobBlobClientLike>;

function inputBlobName(jobId: string): string {
  return `${jobId}/input.json`;
}

function resultBlobName(jobId: string): string {
  return `${jobId}/result.json`;
}

async function getJobBlobClient(
  blobName: string,
  options: TriageJobStoreOptions
): Promise<TriageJobBlobClientLike | null> {
  return getBlobClient<TriageJobBlobClientLike>(
    TRIAGE_JOBS_CONTAINER,
    blobName,
    options
  );
}

async function putJson(
  blobName: string,
  value: unknown,
  options: TriageJobStoreOptions
): Promise<boolean> {
  const client = await getJobBlobClient(blobName, options);
  if (!client) {
    return false;
  }

  try {
    await client.uploadData(Buffer.from(JSON.stringify(value)), {
      blobHTTPHeaders: { blobContentType: "application/json" },
    });
    return true;
  } catch {
    return false;
  }
}

async function getJson<T>(
  blobName: string,
  options: TriageJobStoreOptions
): Promise<T | null> {
  const client = await getJobBlobClient(blobName, options);
  if (!client) {
    return null;
  }

  try {
    const buffer = await client.downloadToBuffer();
    return JSON.parse(buffer.toString("utf8")) as T;
  } catch {
    // Missing blob (404) or malformed JSON — treat as "not available yet".
    return null;
  }
}

export function putTriageJobInput(
  input: SymptomChatTurnInput,
  options: TriageJobStoreOptions = {}
): Promise<boolean> {
  return putJson(inputBlobName(input.jobId), input, options);
}

export function getTriageJobInput(
  jobId: string,
  options: TriageJobStoreOptions = {}
): Promise<SymptomChatTurnInput | null> {
  return getJson<SymptomChatTurnInput>(inputBlobName(jobId), options);
}

export function putTriageJobResult(
  result: SymptomChatTurnResult,
  options: TriageJobStoreOptions = {}
): Promise<boolean> {
  return putJson(resultBlobName(result.jobId), result, options);
}

export function getTriageJobResult(
  jobId: string,
  options: TriageJobStoreOptions = {}
): Promise<SymptomChatTurnResult | null> {
  return getJson<SymptomChatTurnResult>(resultBlobName(jobId), options);
}

/** Best-effort cleanup of both blobs once a result has been delivered. */
export async function deleteTriageJob(
  jobId: string,
  options: TriageJobStoreOptions = {}
): Promise<void> {
  await Promise.all(
    [inputBlobName(jobId), resultBlobName(jobId)].map(async (blobName) => {
      const client = await getJobBlobClient(blobName, options);
      await client?.deleteIfExists?.().catch(() => undefined);
    })
  );
}
