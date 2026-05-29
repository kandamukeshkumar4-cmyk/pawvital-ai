import { randomUUID } from "node:crypto";
import { getServiceBusConnectionString } from "@/lib/azure";
import {
  getFlag,
  type AzureFeatureFlagOptions,
} from "@/lib/azure/app-config";

export const AZURE_ASYNC_REVIEW_FEATURE_FLAG = "azure.async-review.enabled";
export const DEFAULT_SERVICE_BUS_QUEUE_NAME = "async-review";

export type ServiceBusJobType =
  | "async-review"
  | "document-processing"
  | "report-generation"
  | "shadow-telemetry";

export type ServiceBusSafeJsonValue =
  | boolean
  | null
  | number
  | string
  | ServiceBusSafeJsonValue[]
  | { [key: string]: ServiceBusSafeJsonValue };

export type ServiceBusSafePayload = Record<string, ServiceBusSafeJsonValue>;

export type ServiceBusSenderLike = {
  close(): Promise<void>;
  sendMessages(message: {
    applicationProperties?: Record<string, ServiceBusSafeJsonValue>;
    body: ServiceBusSafePayload;
    contentType: "application/json";
    messageId: string;
  }): Promise<void>;
};

export type ServiceBusClientLike = {
  close(): Promise<void>;
  createSender(queueName: string): ServiceBusSenderLike;
};

export type ServiceBusClientFactory = (
  connectionString: string
) => ServiceBusClientLike | Promise<ServiceBusClientLike>;

export type EnqueueServiceBusJobOptions = AzureFeatureFlagOptions & {
    jobId?: string;
    queueName?: string;
    serviceBusClientFactory?: ServiceBusClientFactory;
  };

export type EnqueueServiceBusJobResult =
  | {
      messageId: string;
      ok: true;
      queueName: string;
    }
  | {
      ok: false;
      reason:
        | "feature_disabled"
        | "not_configured"
        | "send_failed"
        | "unsafe_payload";
    };

const UNSAFE_PAYLOAD_KEYS = new Set([
  "audio",
  "conversation",
  "coordinates",
  "image",
  "images",
  "latitude",
  "longitude",
  "messages",
  "owner",
  "ownername",
  "pet",
  "petname",
  "rawtext",
  "reportbody",
  "symptoms",
  "transcript",
  "transcripts",
]);

async function createDefaultServiceBusClient(
  connectionString: string
): Promise<ServiceBusClientLike> {
  const { ServiceBusClient } = await import("@azure/service-bus");
  return new ServiceBusClient(connectionString) as unknown as ServiceBusClientLike;
}

function isUnsafeString(value: string): boolean {
  return value.length > 4096 || /^data:/i.test(value);
}

function hasUnsafePayload(value: ServiceBusSafeJsonValue): boolean {
  if (typeof value === "string") {
    return isUnsafeString(value);
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasUnsafePayload(item));
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
    return (
      UNSAFE_PAYLOAD_KEYS.has(normalizedKey) || hasUnsafePayload(nestedValue)
    );
  });
}

function buildMessageId(type: ServiceBusJobType, jobId?: string): string {
  return jobId?.trim() || `${type}-${randomUUID()}`;
}

export async function enqueueJob(
  type: ServiceBusJobType,
  payload: ServiceBusSafePayload,
  options: EnqueueServiceBusJobOptions = {}
): Promise<EnqueueServiceBusJobResult> {
  const enabled = await getFlag(AZURE_ASYNC_REVIEW_FEATURE_FLAG, options);
  if (!enabled) {
    return { ok: false, reason: "feature_disabled" };
  }

  if (hasUnsafePayload(payload)) {
    return { ok: false, reason: "unsafe_payload" };
  }

  const connectionString = await getServiceBusConnectionString(options);
  if (!connectionString) {
    return { ok: false, reason: "not_configured" };
  }

  const queueName = options.queueName ?? DEFAULT_SERVICE_BUS_QUEUE_NAME;
  const messageId = buildMessageId(type, options.jobId);
  let client: ServiceBusClientLike | null = null;
  let sender: ServiceBusSenderLike | null = null;

  try {
    client = options.serviceBusClientFactory
      ? await options.serviceBusClientFactory(connectionString)
      : await createDefaultServiceBusClient(connectionString);
    sender = client.createSender(queueName);
    await sender.sendMessages({
      applicationProperties: {
        jobType: type,
      },
      body: payload,
      contentType: "application/json",
      messageId,
    });
    return {
      messageId,
      ok: true,
      queueName,
    };
  } catch {
    return { ok: false, reason: "send_failed" };
  } finally {
    if (sender) {
      await sender.close().catch(() => undefined);
    }
    if (client) {
      await client.close().catch(() => undefined);
    }
  }
}
