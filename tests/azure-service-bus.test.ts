import type { SecretClientLike } from "@/lib/azure";
import {
  AZURE_ASYNC_REVIEW_FEATURE_FLAG,
  DEFAULT_SERVICE_BUS_QUEUE_NAME,
  enqueueJob,
  type ServiceBusClientLike,
} from "@/lib/azure/service-bus";

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
        `.appconfig.featureflag/${AZURE_ASYNC_REVIEW_FEATURE_FLAG}`
      );
      return {
        value: JSON.stringify({ enabled: true }),
      };
    },
  };
}

describe("Azure Service Bus queue producer", () => {
  it("defaults off when the async-review feature flag is disabled", async () => {
    const serviceBusClientFactory = jest.fn();

    await expect(
      enqueueJob(
        "async-review",
        { jobId: "case-1" },
        {
          appConfigurationClientFactory: () => ({
            getConfigurationSetting: async () => ({
              value: JSON.stringify({ enabled: false }),
            }),
          }),
          env: CONFIGURED_ENV,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
              "servicebus-connection-string": SERVICE_BUS_CONNECTION_STRING,
            }),
          serviceBusClientFactory,
        }
      )
    ).resolves.toEqual({ ok: false, reason: "feature_disabled" });

    expect(serviceBusClientFactory).not.toHaveBeenCalled();
  });

  it("falls back when the connection string secret is missing", async () => {
    const serviceBusClientFactory = jest.fn();

    await expect(
      enqueueJob(
        "document-processing",
        { documentId: "doc-1", petId: "pet-1" },
        {
          appConfigurationClientFactory: () => enabledFlagClient(),
          env: CONFIGURED_ENV,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            }),
          serviceBusClientFactory,
        }
      )
    ).resolves.toEqual({ ok: false, reason: "not_configured" });

    expect(serviceBusClientFactory).not.toHaveBeenCalled();
  });

  it("sends one sanitized JSON message to the configured Basic queue", async () => {
    const sendMessages = jest.fn().mockResolvedValue(undefined);
    const senderClose = jest.fn().mockResolvedValue(undefined);
    const clientClose = jest.fn().mockResolvedValue(undefined);
    const createSender = jest.fn().mockReturnValue({
      close: senderClose,
      sendMessages,
    });
    const serviceBusClientFactory = jest.fn().mockReturnValue({
      close: clientClose,
      createSender,
    } satisfies ServiceBusClientLike);

    const result = await enqueueJob(
      "async-review",
      {
        jobId: "case-1",
        reportId: "report-1",
        symptomCheckId: "check-1",
      },
      {
        appConfigurationClientFactory: () => enabledFlagClient(),
        env: CONFIGURED_ENV,
        jobId: "case-1",
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            "servicebus-connection-string": SERVICE_BUS_CONNECTION_STRING,
          }),
        serviceBusClientFactory,
      }
    );

    expect(result).toEqual({
      messageId: "case-1",
      ok: true,
      queueName: DEFAULT_SERVICE_BUS_QUEUE_NAME,
    });
    expect(serviceBusClientFactory).toHaveBeenCalledWith(
      SERVICE_BUS_CONNECTION_STRING
    );
    expect(createSender).toHaveBeenCalledWith(DEFAULT_SERVICE_BUS_QUEUE_NAME);
    expect(sendMessages).toHaveBeenCalledWith({
      applicationProperties: { jobType: "async-review" },
      body: {
        jobId: "case-1",
        reportId: "report-1",
        symptomCheckId: "check-1",
      },
      contentType: "application/json",
      messageId: "case-1",
    });
    expect(senderClose).toHaveBeenCalledTimes(1);
    expect(clientClose).toHaveBeenCalledTimes(1);
  });

  it("rejects payloads that contain raw owner data before creating a sender", async () => {
    const serviceBusClientFactory = jest.fn();

    await expect(
      enqueueJob(
        "async-review",
        {
          image: "data:image/jpeg;base64,ZmFrZQ==",
          jobId: "case-1",
        },
        {
          appConfigurationClientFactory: () => enabledFlagClient(),
          env: CONFIGURED_ENV,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
              "servicebus-connection-string": SERVICE_BUS_CONNECTION_STRING,
            }),
          serviceBusClientFactory,
        }
      )
    ).resolves.toEqual({ ok: false, reason: "unsafe_payload" });

    expect(serviceBusClientFactory).not.toHaveBeenCalled();
  });

  it("returns a redacted send failure and still closes clients", async () => {
    const sendMessages = jest
      .fn()
      .mockRejectedValue(new Error("SharedAccessKey=fake leaked error"));
    const senderClose = jest.fn().mockResolvedValue(undefined);
    const clientClose = jest.fn().mockResolvedValue(undefined);
    const serviceBusClientFactory = jest.fn().mockReturnValue({
      close: clientClose,
      createSender: () => ({
        close: senderClose,
        sendMessages,
      }),
    } satisfies ServiceBusClientLike);

    await expect(
      enqueueJob(
        "shadow-telemetry",
        { jobId: "shadow-1", shadowObservationId: "obs-1" },
        {
          appConfigurationClientFactory: () => enabledFlagClient(),
          env: CONFIGURED_ENV,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
              "servicebus-connection-string": SERVICE_BUS_CONNECTION_STRING,
            }),
          serviceBusClientFactory,
        }
      )
    ).resolves.toEqual({ ok: false, reason: "send_failed" });

    expect(senderClose).toHaveBeenCalledTimes(1);
    expect(clientClose).toHaveBeenCalledTimes(1);
  });
});
