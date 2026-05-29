import { getWebPubSubConnectionString } from "@/lib/azure";
import {
  getFlag,
  type AzureFeatureFlagOptions,
} from "@/lib/azure/app-config";
import { trackEvent, type TrackOptions } from "@/lib/azure/telemetry";

export const AZURE_WEB_PUBSUB_FEATURE_FLAG = "azure.webpubsub.enabled";
export const DEFAULT_WEB_PUBSUB_HUB_NAME = "pawvital_triage";

const SAFE_USER_ID_PATTERN = /^[A-Za-z0-9:_@.-]{1,128}$/;
const SAFE_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WebPubSubErrorCode =
  | "feature_disabled"
  | "invalid_request"
  | "negotiate_failed"
  | "not_configured"
  | "publish_failed";

export type TriageLiveUpdateStatus =
  | "processing"
  | "response_ready"
  | "report_ready"
  | "failed";

export type TriageLiveUpdate = {
  action: "chat" | "generate_report";
  generatedAt: string;
  sessionId: string;
  status: TriageLiveUpdateStatus;
  type: "triage_update";
};

type ClientAccessToken = {
  url?: string;
};

export type WebPubSubServiceClientLike = {
  getClientAccessToken(options?: {
    expirationTimeInMinutes?: number;
    userId?: string;
  }): Promise<ClientAccessToken>;
  sendToUser(userId: string, message: TriageLiveUpdate): Promise<void>;
};

export type WebPubSubServiceClientFactory = (
  connectionString: string,
  hubName: string,
) => Promise<WebPubSubServiceClientLike> | WebPubSubServiceClientLike;

export type WebPubSubOptions = AzureFeatureFlagOptions &
  TrackOptions & {
    hubName?: string;
    webPubSubClientFactory?: WebPubSubServiceClientFactory;
  };

export type NegotiateTriageLiveUpdatesResult =
  | {
      enabled: true;
      sessionId: string;
      url: string;
    }
  | {
      enabled: false;
      reason:
        | "feature_disabled"
        | "invalid_request"
        | "negotiate_failed"
        | "not_configured";
    };

export type PublishTriageLiveUpdateResult =
  | {
      enabled: true;
      published: true;
    }
  | {
      enabled: false;
      reason:
        | "feature_disabled"
        | "invalid_request"
        | "not_configured"
        | "publish_failed";
    };

export function normalizeWebPubSubUserId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return SAFE_USER_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function normalizeWebPubSubSessionId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return SAFE_SESSION_ID_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

async function createDefaultWebPubSubClient(
  connectionString: string,
  hubName: string,
): Promise<WebPubSubServiceClientLike> {
  const { WebPubSubServiceClient } = await import("@azure/web-pubsub");
  return new WebPubSubServiceClient(
    connectionString,
    hubName,
  ) as unknown as WebPubSubServiceClientLike;
}

async function getWebPubSubClient(
  connectionString: string,
  options: WebPubSubOptions,
): Promise<WebPubSubServiceClientLike> {
  const hubName = options.hubName ?? DEFAULT_WEB_PUBSUB_HUB_NAME;
  return options.webPubSubClientFactory
    ? await options.webPubSubClientFactory(connectionString, hubName)
    : createDefaultWebPubSubClient(connectionString, hubName);
}

async function trackWebPubSubEvent(
  input: {
    errorCode?: WebPubSubErrorCode;
    statusCode: number;
  },
  options: WebPubSubOptions,
): Promise<void> {
  await trackEvent(
    {
      name: "azure.service.called",
      properties: {
        azureService: "webpubsub",
        errorCode: input.errorCode,
        statusCode: input.statusCode,
      },
    },
    options,
  );
}

export async function negotiateTriageLiveUpdates(
  input: { sessionId: string; userId: string },
  options: WebPubSubOptions = {},
): Promise<NegotiateTriageLiveUpdatesResult> {
  const userId = normalizeWebPubSubUserId(input.userId);
  const sessionId = normalizeWebPubSubSessionId(input.sessionId);
  if (!userId || !sessionId) {
    await trackWebPubSubEvent(
      { errorCode: "invalid_request", statusCode: 400 },
      options,
    );
    return { enabled: false, reason: "invalid_request" };
  }

  const enabled = await getFlag(AZURE_WEB_PUBSUB_FEATURE_FLAG, options);
  if (!enabled) {
    await trackWebPubSubEvent(
      { errorCode: "feature_disabled", statusCode: 204 },
      options,
    );
    return { enabled: false, reason: "feature_disabled" };
  }

  const connectionString = await getWebPubSubConnectionString(options);
  if (!connectionString) {
    await trackWebPubSubEvent(
      { errorCode: "not_configured", statusCode: 503 },
      options,
    );
    return { enabled: false, reason: "not_configured" };
  }

  try {
    const client = await getWebPubSubClient(connectionString, options);
    const token = await client.getClientAccessToken({
      expirationTimeInMinutes: 60,
      userId,
    });
    if (!token.url) {
      await trackWebPubSubEvent(
        { errorCode: "negotiate_failed", statusCode: 502 },
        options,
      );
      return { enabled: false, reason: "negotiate_failed" };
    }

    await trackWebPubSubEvent({ statusCode: 200 }, options);
    return {
      enabled: true,
      sessionId,
      url: token.url,
    };
  } catch {
    await trackWebPubSubEvent(
      { errorCode: "negotiate_failed", statusCode: 503 },
      options,
    );
    return { enabled: false, reason: "negotiate_failed" };
  }
}

export async function publishTriageLiveUpdate(
  input: {
    action: "chat" | "generate_report";
    sessionId: string;
    status: TriageLiveUpdateStatus;
    userId: string | null;
  },
  options: WebPubSubOptions = {},
): Promise<PublishTriageLiveUpdateResult> {
  const userId = normalizeWebPubSubUserId(input.userId);
  const sessionId = normalizeWebPubSubSessionId(input.sessionId);
  if (!userId || !sessionId) {
    await trackWebPubSubEvent(
      { errorCode: "invalid_request", statusCode: 400 },
      options,
    );
    return { enabled: false, reason: "invalid_request" };
  }

  const enabled = await getFlag(AZURE_WEB_PUBSUB_FEATURE_FLAG, options);
  if (!enabled) {
    await trackWebPubSubEvent(
      { errorCode: "feature_disabled", statusCode: 204 },
      options,
    );
    return { enabled: false, reason: "feature_disabled" };
  }

  const connectionString = await getWebPubSubConnectionString(options);
  if (!connectionString) {
    await trackWebPubSubEvent(
      { errorCode: "not_configured", statusCode: 503 },
      options,
    );
    return { enabled: false, reason: "not_configured" };
  }

  try {
    const client = await getWebPubSubClient(connectionString, options);
    await client.sendToUser(userId, {
      action: input.action,
      generatedAt: new Date().toISOString(),
      sessionId,
      status: input.status,
      type: "triage_update",
    });
    await trackWebPubSubEvent({ statusCode: 200 }, options);
    return { enabled: true, published: true };
  } catch {
    await trackWebPubSubEvent(
      { errorCode: "publish_failed", statusCode: 503 },
      options,
    );
    return { enabled: false, reason: "publish_failed" };
  }
}
