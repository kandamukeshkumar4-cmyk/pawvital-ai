import { randomUUID } from "node:crypto";
import {
  getContentSafetyClient,
  getDocumentIntelligenceClient,
  type AzureKeyEndpointClient,
  type AzureClientOptions,
} from "@/lib/azure";
import { getFlag, type AzureFeatureFlagOptions } from "@/lib/azure/app-config";
import { uploadReport, type UploadAzureBlobOptions } from "@/lib/azure/blob";
import { enqueueJob } from "@/lib/azure/service-bus";
import { trackEvent, type TrackOptions } from "@/lib/azure/telemetry";

export const AZURE_DOC_INTEL_FEATURE_FLAG = "azure.docintel.enabled";

const DOC_INTEL_API_VERSION = "2024-11-30";
const DOC_INTEL_MODEL_ID = "prebuilt-layout";
const CONTENT_SAFETY_API_VERSION = "2024-09-01";
const CONTENT_SAFETY_BLOCK_SEVERITY = 6;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 10;
const MAX_CONTEXT_CHARS = 3_000;
const MAX_SAFETY_CHARS = 10_000;

type MaybePromise<T> = T | Promise<T>;

export type AzureFetchResponse = Pick<
  Response,
  "headers" | "json" | "ok" | "status"
>;

export type AzureServiceFetch = (
  input: string | URL,
  init: RequestInit,
) => MaybePromise<AzureFetchResponse>;

export type ExtractedDocumentField = {
  key: string;
  value: string;
};

export type ContentSafetyCategory = {
  category: string;
  severity: number;
};

export type VetRecordDocumentIntakeInput = {
  blobName: string;
  body: ArrayBuffer | Buffer | Uint8Array;
  contentType: string;
  fileName: string;
};

export type VetRecordDocumentIntakeResult =
  | {
      enabled: false;
      reason: "feature_disabled";
    }
  | {
      enabled: false;
      reason:
        | "content_safety_unavailable"
        | "document_unavailable"
        | "upload_failed";
    }
  | {
      categories: ContentSafetyCategory[];
      enabled: true;
      ok: false;
      pageCount: number;
      reason: "content_safety_blocked";
    }
  | {
      blobName: string;
      contentLength: number;
      contextText: string;
      demoUpload: boolean;
      enabled: true;
      fields: ExtractedDocumentField[];
      ok: true;
      pageCount: number;
    };

export type VetRecordDocumentIntakeOptions = AzureClientOptions &
  AzureFeatureFlagOptions &
  TrackOptions &
  UploadAzureBlobOptions & {
    enqueueDocumentProcessingJob?: typeof enqueueJob;
    fetchContentSafety?: AzureServiceFetch;
    fetchDocumentIntelligence?: AzureServiceFetch;
    maxPollAttempts?: number;
    pollIntervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  };

type AnalyzeDocumentPayload = {
  analyzeResult?: {
    content?: unknown;
    keyValuePairs?: unknown;
    pages?: unknown;
  };
  status?: unknown;
};

type ContentSafetyPayload = {
  categoriesAnalysis?: unknown;
};

function defaultFetch(
  input: string | URL,
  init: RequestInit,
): Promise<AzureFetchResponse> {
  return fetch(input, init);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinAzurePath(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

function buildAnalyzeUrl(endpoint: string): URL {
  const url = new URL(
    joinAzurePath(
      endpoint,
      `/documentintelligence/documentModels/${DOC_INTEL_MODEL_ID}:analyze`,
    ),
  );
  url.searchParams.set("api-version", DOC_INTEL_API_VERSION);
  url.searchParams.set("features", "keyValuePairs");
  return url;
}

async function deleteAnalyzeResult(
  operationLocation: string,
  client: AzureKeyEndpointClient,
  fetchDocument: AzureServiceFetch,
): Promise<void> {
  try {
    await fetchDocument(operationLocation, {
      headers: {
        "Ocp-Apim-Subscription-Key": client.key,
      },
      method: "DELETE",
    });
  } catch {
    // The owner-facing intake already has the result it needs. Treat cleanup as
    // best-effort so a transient Azure deletion error does not break intake.
  }
}

function buildContentSafetyUrl(endpoint: string): URL {
  const url = new URL(joinAzurePath(endpoint, "/contentsafety/text:analyze"));
  url.searchParams.set("api-version", CONTENT_SAFETY_API_VERSION);
  return url;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function extractPageCount(pages: unknown): number {
  return Array.isArray(pages) ? pages.length : 0;
}

function extractFields(keyValuePairs: unknown): ExtractedDocumentField[] {
  if (!Array.isArray(keyValuePairs)) {
    return [];
  }

  return keyValuePairs
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as {
        key?: { content?: unknown };
        value?: { content?: unknown };
      };
      const key = normalizeText(record.key?.content);
      const value = normalizeText(record.value?.content);
      return key && value ? { key, value } : null;
    })
    .filter((field): field is ExtractedDocumentField => Boolean(field))
    .slice(0, 20);
}

function buildContextText(input: {
  content: string;
  fields: ExtractedDocumentField[];
  fileName: string;
}): string {
  const lines = [`Vet record context from uploaded PDF: ${input.fileName}`];
  if (input.fields.length > 0) {
    lines.push(
      "Extracted fields:",
      ...input.fields
        .slice(0, 8)
        .map((field) => `${field.key}: ${field.value}`),
    );
  }
  if (input.content) {
    lines.push("Extracted notes:", input.content);
  }
  return lines.join("\n").slice(0, MAX_CONTEXT_CHARS);
}

function safeAttachmentFileName(fileName: string): string {
  return (
    fileName
      .replace(/[\r\n"]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 120) || "vet-record.pdf"
  );
}

function parseSafetyCategories(
  payload: ContentSafetyPayload,
): ContentSafetyCategory[] {
  if (!Array.isArray(payload.categoriesAnalysis)) {
    return [];
  }

  return payload.categoriesAnalysis
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as { category?: unknown; severity?: unknown };
      if (
        typeof record.category !== "string" ||
        typeof record.severity !== "number"
      ) {
        return null;
      }
      return {
        category: record.category,
        severity: record.severity,
      };
    })
    .filter((category): category is ContentSafetyCategory => Boolean(category));
}

async function analyzeDocument(
  input: VetRecordDocumentIntakeInput,
  client: AzureKeyEndpointClient,
  options: VetRecordDocumentIntakeOptions,
): Promise<{
  content: string;
  fields: ExtractedDocumentField[];
  pageCount: number;
} | null> {
  const fetchDocument = options.fetchDocumentIntelligence ?? defaultFetch;
  const started = await fetchDocument(buildAnalyzeUrl(client.endpoint), {
    body: input.body as BodyInit,
    headers: {
      "Content-Type": input.contentType,
      "Ocp-Apim-Subscription-Key": client.key,
    },
    method: "POST",
  });

  const operationLocation = started.headers.get("operation-location");
  if (!started.ok || !operationLocation) {
    return null;
  }

  const maxAttempts = Math.max(
    1,
    options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
  );
  const pollIntervalMs = Math.max(
    0,
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  );
  const wait = options.sleep ?? sleep;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0 && pollIntervalMs > 0) {
        await wait(pollIntervalMs);
      }

      const pollResponse = await fetchDocument(operationLocation, {
        headers: {
          "Ocp-Apim-Subscription-Key": client.key,
        },
        method: "GET",
      });
      if (!pollResponse.ok) {
        return null;
      }

      const payload = (await pollResponse.json()) as AnalyzeDocumentPayload;
      if (payload.status === "failed") {
        return null;
      }
      if (payload.status !== "succeeded") {
        continue;
      }

      const result = payload.analyzeResult;
      if (!result) {
        return null;
      }

      return {
        content: normalizeText(result.content),
        fields: extractFields(result.keyValuePairs),
        pageCount: extractPageCount(result.pages),
      };
    }

    return null;
  } finally {
    await deleteAnalyzeResult(operationLocation, client, fetchDocument);
  }
}

async function screenExtractedText(
  text: string,
  client: AzureKeyEndpointClient,
  options: VetRecordDocumentIntakeOptions,
): Promise<
  "unavailable" | { blocked: boolean; categories: ContentSafetyCategory[] }
> {
  const fetchContentSafety = options.fetchContentSafety ?? defaultFetch;
  const response = await fetchContentSafety(
    buildContentSafetyUrl(client.endpoint),
    {
      body: JSON.stringify({
        categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
        outputType: "FourSeverityLevels",
        text: text.slice(0, MAX_SAFETY_CHARS),
      }),
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": client.key,
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    return "unavailable";
  }

  const categories = parseSafetyCategories(
    (await response.json()) as ContentSafetyPayload,
  );
  return {
    blocked: categories.some(
      (category) => category.severity >= CONTENT_SAFETY_BLOCK_SEVERITY,
    ),
    categories,
  };
}

async function trackDocIntelOutcome(
  input: {
    demoMode: boolean;
    errorCode?: string;
    pageCount?: number;
    statusCode: number;
  },
  options: VetRecordDocumentIntakeOptions,
) {
  await trackEvent(
    {
      measurements:
        typeof input.pageCount === "number"
          ? { pageCount: input.pageCount }
          : undefined,
      name: "azure.service.called",
      properties: {
        azureService: "document-intelligence",
        demoMode: input.demoMode,
        errorCode: input.errorCode,
        statusCode: input.statusCode,
      },
    },
    options,
  );
}

async function enqueueDocumentProcessing(
  input: {
    blobName: string;
    contentLength: number;
    pageCount: number;
  },
  options: VetRecordDocumentIntakeOptions,
): Promise<void> {
  const jobId = `document-processing-${randomUUID()}`;
  const queue = options.enqueueDocumentProcessingJob ?? enqueueJob;

  try {
    await queue(
      "document-processing",
      {
        blobName: input.blobName,
        contentLength: input.contentLength,
        jobId,
        pageCount: input.pageCount,
        source: "vet-record-intake",
      },
      {
        ...options,
        jobId,
      },
    );
  } catch {
    // Document intake is owner-facing; async queue outages must not block it.
  }
}

export async function intakeVetRecordDocument(
  input: VetRecordDocumentIntakeInput,
  options: VetRecordDocumentIntakeOptions = {},
): Promise<VetRecordDocumentIntakeResult> {
  const enabled = await getFlag(AZURE_DOC_INTEL_FEATURE_FLAG, options);
  if (!enabled) {
    return { enabled: false, reason: "feature_disabled" };
  }

  const [documentClient, contentSafetyClient] = await Promise.all([
    getDocumentIntelligenceClient(options),
    getContentSafetyClient(options),
  ]);
  if (!documentClient) {
    await trackDocIntelOutcome(
      {
        demoMode: false,
        errorCode: "document_unavailable",
        statusCode: 503,
      },
      options,
    );
    return { enabled: false, reason: "document_unavailable" };
  }
  if (!contentSafetyClient) {
    await trackDocIntelOutcome(
      {
        demoMode: false,
        errorCode: "content_safety_unavailable",
        statusCode: 503,
      },
      options,
    );
    return { enabled: false, reason: "content_safety_unavailable" };
  }

  const upload = await uploadReport(
    {
      blobName: input.blobName,
      body: input.body,
      contentDisposition: `attachment; filename="${safeAttachmentFileName(
        input.fileName,
      )}"`,
      contentType: input.contentType,
      metadata: {
        azureFeature: "docintel",
      },
    },
    options,
  );
  if (!upload.ok) {
    await trackDocIntelOutcome(
      { demoMode: false, errorCode: "upload_failed", statusCode: 503 },
      options,
    );
    return { enabled: false, reason: "upload_failed" };
  }

  const analyzed = await analyzeDocument(input, documentClient, options);
  if (!analyzed) {
    await trackDocIntelOutcome(
      {
        demoMode: Boolean(upload.demo),
        errorCode: "document_unavailable",
        statusCode: 503,
      },
      options,
    );
    return { enabled: false, reason: "document_unavailable" };
  }

  const safety = await screenExtractedText(
    analyzed.content,
    contentSafetyClient,
    options,
  );
  if (safety === "unavailable") {
    await trackDocIntelOutcome(
      {
        demoMode: Boolean(upload.demo),
        errorCode: "content_safety_unavailable",
        pageCount: analyzed.pageCount,
        statusCode: 503,
      },
      options,
    );
    return { enabled: false, reason: "content_safety_unavailable" };
  }

  if (safety.blocked) {
    await trackDocIntelOutcome(
      {
        demoMode: Boolean(upload.demo),
        errorCode: "content_safety_blocked",
        pageCount: analyzed.pageCount,
        statusCode: 422,
      },
      options,
    );
    return {
      categories: safety.categories,
      enabled: true,
      ok: false,
      pageCount: analyzed.pageCount,
      reason: "content_safety_blocked",
    };
  }

  await trackDocIntelOutcome(
    {
      demoMode: Boolean(upload.demo),
      pageCount: analyzed.pageCount,
      statusCode: 200,
    },
    options,
  );

  await enqueueDocumentProcessing(
    {
      blobName: upload.blobName,
      contentLength: analyzed.content.length,
      pageCount: analyzed.pageCount,
    },
    options,
  );

  return {
    blobName: upload.blobName,
    contentLength: analyzed.content.length,
    contextText: buildContextText({
      content: analyzed.content,
      fields: analyzed.fields,
      fileName: input.fileName,
    }),
    demoUpload: Boolean(upload.demo),
    enabled: true,
    fields: analyzed.fields,
    ok: true,
    pageCount: analyzed.pageCount,
  };
}
