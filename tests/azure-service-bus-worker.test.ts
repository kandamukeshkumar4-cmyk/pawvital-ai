import type { SecretClientLike } from "@/lib/azure";
import {
  AZURE_ASYNC_REVIEW_FEATURE_FLAG,
  DEFAULT_SERVICE_BUS_QUEUE_NAME,
} from "@/lib/azure/service-bus";
import {
  runServiceBusWorkerOnce,
  type ServiceBusReceiverLike,
  type ServiceBusWorkerClientLike,
} from "@/lib/azure/service-bus-worker";
import { trackEvent } from "@/lib/azure/telemetry";

jest.mock("@/lib/azure/telemetry", () => ({
  trackEvent: jest.fn().mockResolvedValue(undefined),
}));

const CONFIGURED_ENV = {
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_KEY_VAULT_NAME: "test-vault",
};

const APP_CONFIG_CONNECTION_STRING =
  "Endpoint=https://pawvital-appconfig.azconfig.io;Id=test;Secret=test";
const SERVICE_BUS_CONNECTION_STRING =
  "Endpoint=sb://pawvital-test.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=fake";

function makeSecretClient(secrets: Record<string, string>): SecretClientLike {
  return {
    getSecret: async (name: string) => ({ value: secrets[name] ?? null }),
  };
}

function enabledFlagClient() {
  return {
    getConfigurationSetting: async (setting: { key: string }) => {
      expect(setting.key).toBe(
        `.appconfig.featureflag/${AZURE_ASYNC_REVIEW_FEATURE_FLAG}`,
      );
      return {
        value: JSON.stringify({ enabled: true }),
      };
    },
  };
}

function disabledFlagClient() {
  return {
    getConfigurationSetting: async () => ({
      value: JSON.stringify({ enabled: false }),
    }),
  };
}

function baseOptions() {
  return {
    appConfigurationClientFactory: () => enabledFlagClient(),
    env: CONFIGURED_ENV,
    secretClientFactory: () =>
      makeSecretClient({
        "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
        "servicebus-connection-string": SERVICE_BUS_CONNECTION_STRING,
      }),
  };
}

function makeReceiver(
  messages: Awaited<ReturnType<ServiceBusReceiverLike["receiveMessages"]>>,
) {
  return {
    abandonMessage: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    completeMessage: jest.fn().mockResolvedValue(undefined),
    deadLetterMessage: jest.fn().mockResolvedValue(undefined),
    receiveMessages: jest.fn().mockResolvedValue(messages),
  } satisfies ServiceBusReceiverLike;
}

function makeClient(receiver: ServiceBusReceiverLike) {
  return {
    close: jest.fn().mockResolvedValue(undefined),
    createReceiver: jest.fn().mockReturnValue(receiver),
  } satisfies ServiceBusWorkerClientLike;
}

function expectServiceBusTelemetry(
  statusCode: number,
  errorCode?: string,
): void {
  expect(trackEvent).toHaveBeenCalledWith(
    {
      name: "azure.service.called",
      properties: {
        azureService: "servicebus",
        errorCode,
        statusCode,
      },
    },
    expect.any(Object),
  );
}

describe("Azure Service Bus worker consumer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not connect when the async-review feature flag is disabled", async () => {
    const serviceBusClientFactory = jest.fn();

    await expect(
      runServiceBusWorkerOnce({
        ...baseOptions(),
        appConfigurationClientFactory: () => disabledFlagClient(),
        serviceBusClientFactory,
      }),
    ).resolves.toEqual({ ok: false, reason: "feature_disabled" });

    expect(serviceBusClientFactory).not.toHaveBeenCalled();
    expectServiceBusTelemetry(204, "feature_disabled");
  });

  it("does not connect when the Service Bus connection string is missing", async () => {
    const serviceBusClientFactory = jest.fn();

    await expect(
      runServiceBusWorkerOnce({
        ...baseOptions(),
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
          }),
        serviceBusClientFactory,
      }),
    ).resolves.toEqual({ ok: false, reason: "not_configured" });

    expect(serviceBusClientFactory).not.toHaveBeenCalled();
    expectServiceBusTelemetry(503, "not_configured");
  });

  it("receives, dispatches, completes, and tracks one valid queue message", async () => {
    const receiver = makeReceiver([
      {
        applicationProperties: { jobType: "document-processing" },
        body: { documentId: "doc-1", jobId: "job-1" },
        messageId: "msg-1",
      },
    ]);
    const client = makeClient(receiver);
    const handler = jest.fn().mockResolvedValue(undefined);

    await expect(
      runServiceBusWorkerOnce({
        ...baseOptions(),
        handler,
        serviceBusClientFactory: jest.fn().mockReturnValue(client),
      }),
    ).resolves.toEqual({
      jobType: "document-processing",
      messageId: "msg-1",
      ok: true,
      processed: true,
      queueName: DEFAULT_SERVICE_BUS_QUEUE_NAME,
    });

    expect(client.createReceiver).toHaveBeenCalledWith(
      DEFAULT_SERVICE_BUS_QUEUE_NAME,
    );
    expect(receiver.receiveMessages).toHaveBeenCalledWith(1, {
      maxWaitTimeInMs: 5000,
    });
    expect(handler).toHaveBeenCalledWith({
      messageId: "msg-1",
      payload: { documentId: "doc-1", jobId: "job-1" },
      type: "document-processing",
    });
    expect(receiver.completeMessage).toHaveBeenCalledTimes(1);
    expect(receiver.deadLetterMessage).not.toHaveBeenCalled();
    expectServiceBusTelemetry(200);
  });

  it("dead-letters unsupported or unsafe job envelopes", async () => {
    const receiver = makeReceiver([
      {
        applicationProperties: { jobType: "unknown-job" },
        body: { jobId: "job-1" },
        messageId: "msg-unsafe",
      },
    ]);
    const client = makeClient(receiver);

    await expect(
      runServiceBusWorkerOnce({
        ...baseOptions(),
        serviceBusClientFactory: jest.fn().mockReturnValue(client),
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_message" });

    expect(receiver.deadLetterMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "msg-unsafe" }),
      {
        deadLetterErrorDescription: "Unsupported or unsafe job envelope.",
        deadLetterReason: "invalid_message",
      },
    );
    expect(receiver.completeMessage).not.toHaveBeenCalled();
    expectServiceBusTelemetry(400, "invalid_message");
  });

  it("abandons the message when the handler fails", async () => {
    const receiver = makeReceiver([
      {
        applicationProperties: { jobType: "shadow-telemetry" },
        body: Buffer.from(JSON.stringify({ jobId: "shadow-1" })),
        messageId: "msg-handler",
      },
    ]);
    const client = makeClient(receiver);
    const handler = jest.fn().mockRejectedValue(new Error("boom"));

    await expect(
      runServiceBusWorkerOnce({
        ...baseOptions(),
        handler,
        serviceBusClientFactory: jest.fn().mockReturnValue(client),
      }),
    ).resolves.toEqual({ ok: false, reason: "handler_failed" });

    expect(receiver.abandonMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "msg-handler" }),
    );
    expect(receiver.completeMessage).not.toHaveBeenCalled();
    expectServiceBusTelemetry(500, "handler_failed");
  });

  it("returns no_messages without completing anything when the queue is empty", async () => {
    const receiver = makeReceiver([]);
    const client = makeClient(receiver);

    await expect(
      runServiceBusWorkerOnce({
        ...baseOptions(),
        serviceBusClientFactory: jest.fn().mockReturnValue(client),
      }),
    ).resolves.toEqual({
      ok: true,
      processed: false,
      reason: "no_messages",
    });

    expect(receiver.completeMessage).not.toHaveBeenCalled();
    expect(receiver.deadLetterMessage).not.toHaveBeenCalled();
    expectServiceBusTelemetry(204, "no_messages");
  });

  it("returns receive_failed and tracks a sanitized error code when receive fails", async () => {
    const receiver = {
      abandonMessage: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      completeMessage: jest.fn().mockResolvedValue(undefined),
      deadLetterMessage: jest.fn().mockResolvedValue(undefined),
      receiveMessages: jest.fn().mockRejectedValue(new Error("raw broker error")),
    } satisfies ServiceBusReceiverLike;
    const client = makeClient(receiver);

    await expect(
      runServiceBusWorkerOnce({
        ...baseOptions(),
        serviceBusClientFactory: jest.fn().mockReturnValue(client),
      }),
    ).resolves.toEqual({ ok: false, reason: "receive_failed" });

    expect(receiver.completeMessage).not.toHaveBeenCalled();
    expect(receiver.deadLetterMessage).not.toHaveBeenCalled();
    expect(receiver.abandonMessage).not.toHaveBeenCalled();
    expect(receiver.close).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
    expectServiceBusTelemetry(503, "receive_failed");
  });
});
