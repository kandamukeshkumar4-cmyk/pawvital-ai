import { getServiceBusConnectionString } from "@/lib/azure";
import {
  getFlag,
  type AzureFeatureFlagOptions,
} from "@/lib/azure/app-config";
import {
  AZURE_ASYNC_REVIEW_FEATURE_FLAG,
  DEFAULT_SERVICE_BUS_QUEUE_NAME,
  hasUnsafeServiceBusPayload,
  type ServiceBusJobType,
  type ServiceBusSafePayload,
} from "@/lib/azure/service-bus";
import { trackEvent, type TrackOptions } from "@/lib/azure/telemetry";

export type ServiceBusReceivedMessageLike = {
  applicationProperties?: Record<string, unknown>;
  body: unknown;
  messageId?: string;
};

export type ServiceBusReceiverLike = {
  abandonMessage(message: ServiceBusReceivedMessageLike): Promise<void>;
  close(): Promise<void>;
  completeMessage(message: ServiceBusReceivedMessageLike): Promise<void>;
  deadLetterMessage(
    message: ServiceBusReceivedMessageLike,
    options?: {
      deadLetterErrorDescription?: string;
      deadLetterReason?: string;
    },
  ): Promise<void>;
  receiveMessages(
    maxMessageCount: number,
    options?: { maxWaitTimeInMs?: number },
  ): Promise<ServiceBusReceivedMessageLike[]>;
};

export type ServiceBusWorkerClientLike = {
  close(): Promise<void>;
  createReceiver(queueName: string): ServiceBusReceiverLike;
};

export type ServiceBusWorkerClientFactory = (
  connectionString: string,
) => Promise<ServiceBusWorkerClientLike> | ServiceBusWorkerClientLike;

export type ServiceBusWorkerJob = {
  messageId: string;
  payload: ServiceBusSafePayload;
  type: ServiceBusJobType;
};

export type ServiceBusWorkerJobHandler = (
  job: ServiceBusWorkerJob,
) => Promise<void> | void;

export type RunServiceBusWorkerOnceOptions = AzureFeatureFlagOptions &
  TrackOptions & {
    handler?: ServiceBusWorkerJobHandler;
    maxWaitTimeInMs?: number;
    queueName?: string;
    serviceBusClientFactory?: ServiceBusWorkerClientFactory;
  };

export type RunServiceBusWorkerOnceResult =
  | {
      ok: true;
      processed: false;
      reason: "no_messages";
    }
  | {
      jobType: ServiceBusJobType;
      messageId: string;
      ok: true;
      processed: true;
      queueName: string;
    }
  | {
      ok: false;
      reason:
        | "feature_disabled"
        | "handler_failed"
        | "invalid_message"
        | "not_configured"
        | "receive_failed";
    };

const SUPPORTED_JOB_TYPES = new Set<ServiceBusJobType>([
  "async-review",
  "document-processing",
  "report-generation",
  "shadow-telemetry",
]);

async function createDefaultServiceBusWorkerClient(
  connectionString: string,
): Promise<ServiceBusWorkerClientLike> {
  const { ServiceBusClient } = await import("@azure/service-bus");
  return new ServiceBusClient(
    connectionString,
  ) as unknown as ServiceBusWorkerClientLike;
}

function toStringProperty(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return null;
}

function isServiceBusJobType(value: string | null): value is ServiceBusJobType {
  return Boolean(value && SUPPORTED_JOB_TYPES.has(value as ServiceBusJobType));
}

function isSafePayload(value: unknown): value is ServiceBusSafePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !hasUnsafeServiceBusPayload(value as ServiceBusSafePayload)
  );
}

function parseJsonPayload(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseMessageBody(body: unknown): unknown {
  if (typeof body === "string") {
    return parseJsonPayload(body);
  }
  if (body instanceof Uint8Array) {
    return parseJsonPayload(Buffer.from(body).toString("utf8"));
  }
  if (isSafePayload(body)) {
    return body;
  }
  return null;
}

function parseWorkerJob(
  message: ServiceBusReceivedMessageLike,
): ServiceBusWorkerJob | null {
  const payload = parseMessageBody(message.body);
  if (!isSafePayload(payload)) {
    return null;
  }

  const jobType = toStringProperty(message.applicationProperties?.jobType);
  if (!isServiceBusJobType(jobType)) {
    return null;
  }

  return {
    messageId: message.messageId || `servicebus-${jobType}`,
    payload,
    type: jobType,
  };
}

async function defaultJobHandler(): Promise<void> {
  return undefined;
}

async function trackWorkerEvent(input: {
  errorCode?: string;
  statusCode: number;
  trackOptions: TrackOptions;
}): Promise<void> {
  await trackEvent(
    {
      name: "azure.service.called",
      properties: {
        azureService: "servicebus",
        errorCode: input.errorCode,
        statusCode: input.statusCode,
      },
    },
    input.trackOptions,
  );
}

export async function runServiceBusWorkerOnce(
  options: RunServiceBusWorkerOnceOptions = {},
): Promise<RunServiceBusWorkerOnceResult> {
  const enabled = await getFlag(AZURE_ASYNC_REVIEW_FEATURE_FLAG, options);
  if (!enabled) {
    return { ok: false, reason: "feature_disabled" };
  }

  const connectionString = await getServiceBusConnectionString(options);
  if (!connectionString) {
    return { ok: false, reason: "not_configured" };
  }

  const queueName = options.queueName ?? DEFAULT_SERVICE_BUS_QUEUE_NAME;
  let client: ServiceBusWorkerClientLike | null = null;
  let receiver: ServiceBusReceiverLike | null = null;

  try {
    client = options.serviceBusClientFactory
      ? await options.serviceBusClientFactory(connectionString)
      : await createDefaultServiceBusWorkerClient(connectionString);
    receiver = client.createReceiver(queueName);
    const [message] = await receiver.receiveMessages(1, {
      maxWaitTimeInMs: options.maxWaitTimeInMs ?? 5_000,
    });

    if (!message) {
      return { ok: true, processed: false, reason: "no_messages" };
    }

    const job = parseWorkerJob(message);
    if (!job) {
      await receiver.deadLetterMessage(message, {
        deadLetterErrorDescription: "Unsupported or unsafe job envelope.",
        deadLetterReason: "invalid_message",
      });
      await trackWorkerEvent({
        errorCode: "invalid_message",
        statusCode: 400,
        trackOptions: options,
      });
      return { ok: false, reason: "invalid_message" };
    }

    try {
      await (options.handler ?? defaultJobHandler)(job);
      await receiver.completeMessage(message);
      await trackWorkerEvent({
        statusCode: 200,
        trackOptions: options,
      });
      return {
        jobType: job.type,
        messageId: job.messageId,
        ok: true,
        processed: true,
        queueName,
      };
    } catch {
      await receiver.abandonMessage(message);
      await trackWorkerEvent({
        errorCode: "handler_failed",
        statusCode: 500,
        trackOptions: options,
      });
      return { ok: false, reason: "handler_failed" };
    }
  } catch {
    await trackWorkerEvent({
      errorCode: "receive_failed",
      statusCode: 503,
      trackOptions: options,
    });
    return { ok: false, reason: "receive_failed" };
  } finally {
    if (receiver) {
      await receiver.close().catch(() => undefined);
    }
    if (client) {
      await client.close().catch(() => undefined);
    }
  }
}
