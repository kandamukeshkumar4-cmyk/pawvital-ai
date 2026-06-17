import type { SecretClientLike } from "@/lib/azure";
import {
  AZURE_WEB_PUBSUB_FEATURE_FLAG,
  DEFAULT_WEB_PUBSUB_HUB_NAME,
  negotiateTriageLiveUpdates,
  publishTriageLiveUpdate,
  type WebPubSubServiceClientLike,
} from "@/lib/azure/web-pubsub";
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
const WEB_PUBSUB_CONNECTION_STRING =
  "Endpoint=https://pawvital-webpubsub.webpubsub.azure.com;AccessKey=secret;Version=1.0;";
const LIVE_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeSecretClient(secrets: Record<string, string>): SecretClientLike {
  return {
    getSecret: async (name: string) => ({ value: secrets[name] ?? null }),
  };
}

function enabledFlagClient() {
  return {
    getConfigurationSetting: async (setting: { key: string }) => {
      expect(setting.key).toBe(
        `.appconfig.featureflag/${AZURE_WEB_PUBSUB_FEATURE_FLAG}`,
      );
      return { value: JSON.stringify({ enabled: true }) };
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

function baseOptions(secrets: Record<string, string> = {}) {
  return {
    appConfigurationClientFactory: () => enabledFlagClient(),
    env: CONFIGURED_ENV,
    secretClientFactory: () =>
      makeSecretClient({
        "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
        "webpubsub-connection-string": WEB_PUBSUB_CONNECTION_STRING,
        ...secrets,
      }),
  };
}

function makeClient() {
  return {
    getClientAccessToken: jest.fn().mockResolvedValue({
      url: "wss://pawvital-webpubsub.webpubsub.azure.com/client/hubs/pawvital_triage?access_token=client-token",
    }),
    sendToUser: jest.fn().mockResolvedValue(undefined),
  } satisfies WebPubSubServiceClientLike;
}

describe("Azure Web PubSub helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("defaults off when the App Config Web PubSub flag is disabled", async () => {
    const webPubSubClientFactory = jest.fn();

    await expect(
      negotiateTriageLiveUpdates(
        { sessionId: LIVE_SESSION_ID, userId: "user-1" },
        {
          ...baseOptions(),
          appConfigurationClientFactory: () => disabledFlagClient(),
          webPubSubClientFactory,
        },
      ),
    ).resolves.toEqual({ enabled: false, reason: "feature_disabled" });

    expect(webPubSubClientFactory).not.toHaveBeenCalled();
  });

  it("creates a short-lived browser connection URL without exposing the connection string", async () => {
    const client = makeClient();

    const result = await negotiateTriageLiveUpdates(
      { sessionId: LIVE_SESSION_ID, userId: "user-1" },
      {
        ...baseOptions(),
        webPubSubClientFactory: jest.fn().mockReturnValue(client),
      },
    );

    expect(result).toEqual({
      enabled: true,
      sessionId: LIVE_SESSION_ID,
      url: expect.stringContaining("wss://"),
    });
    expect(JSON.stringify(result)).not.toContain("AccessKey=secret");
    expect(client.getClientAccessToken).toHaveBeenCalledWith({
      expirationTimeInMinutes: 60,
      userId: "user-1",
    });
  });

  it("fails closed when the Web PubSub connection string is absent", async () => {
    const webPubSubClientFactory = jest.fn();

    await expect(
      negotiateTriageLiveUpdates(
        { sessionId: LIVE_SESSION_ID, userId: "user-1" },
        {
          ...baseOptions({ "webpubsub-connection-string": "" }),
          webPubSubClientFactory,
        },
      ),
    ).resolves.toEqual({ enabled: false, reason: "not_configured" });

    expect(webPubSubClientFactory).not.toHaveBeenCalled();
  });

  it("fails closed when Azure does not issue a client URL", async () => {
    const client = {
      ...makeClient(),
      getClientAccessToken: jest.fn().mockResolvedValue({}),
    };

    await expect(
      negotiateTriageLiveUpdates(
        { sessionId: LIVE_SESSION_ID, userId: "user-1" },
        {
          ...baseOptions(),
          webPubSubClientFactory: jest.fn().mockReturnValue(client),
        },
      ),
    ).resolves.toEqual({ enabled: false, reason: "negotiate_failed" });
  });

  it("publishes metadata-only triage updates to the authenticated user", async () => {
    const client = makeClient();

    await expect(
      publishTriageLiveUpdate(
        {
          action: "chat",
          sessionId: LIVE_SESSION_ID,
          status: "response_ready",
          userId: "user-1",
        },
        {
          ...baseOptions(),
          webPubSubClientFactory: jest.fn().mockReturnValue(client),
        },
      ),
    ).resolves.toEqual({ enabled: true, published: true });

    expect(client.sendToUser).toHaveBeenCalledWith("user-1", {
      action: "chat",
      generatedAt: expect.any(String),
      sessionId: LIVE_SESSION_ID,
      status: "response_ready",
      type: "triage_update",
    });
    expect(JSON.stringify(client.sendToUser.mock.calls[0])).not.toContain(
      "vomit",
    );
  });

  it("fails closed when publishing to Web PubSub fails", async () => {
    const client = {
      ...makeClient(),
      sendToUser: jest.fn().mockRejectedValue(new Error("broker offline")),
    };

    await expect(
      publishTriageLiveUpdate(
        {
          action: "chat",
          sessionId: LIVE_SESSION_ID,
          status: "failed",
          userId: "user-1",
        },
        {
          ...baseOptions(),
          webPubSubClientFactory: jest.fn().mockReturnValue(client),
        },
      ),
    ).resolves.toEqual({ enabled: false, reason: "publish_failed" });
  });

  it("rejects unsafe IDs before negotiating or publishing", async () => {
    const client = makeClient();
    const webPubSubClientFactory = jest.fn().mockReturnValue(client);

    await expect(
      negotiateTriageLiveUpdates(
        { sessionId: "../session", userId: "user-1" },
        {
          ...baseOptions(),
          webPubSubClientFactory,
        },
      ),
    ).resolves.toEqual({ enabled: false, reason: "invalid_request" });

    await expect(
      publishTriageLiveUpdate(
        {
          action: "chat",
          sessionId: LIVE_SESSION_ID,
          status: "processing",
          userId: "user 1",
        },
        {
          ...baseOptions(),
          webPubSubClientFactory,
        },
      ),
    ).resolves.toEqual({ enabled: false, reason: "invalid_request" });

    expect(webPubSubClientFactory).not.toHaveBeenCalled();
  });

  it("uses the expected default hub name for the service client", async () => {
    const client = makeClient();
    const webPubSubClientFactory = jest.fn().mockReturnValue(client);

    await negotiateTriageLiveUpdates(
      { sessionId: LIVE_SESSION_ID, userId: "user-1" },
      {
        ...baseOptions(),
        webPubSubClientFactory,
      },
    );

    expect(webPubSubClientFactory).toHaveBeenCalledWith(
      WEB_PUBSUB_CONNECTION_STRING,
      DEFAULT_WEB_PUBSUB_HUB_NAME,
    );
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "azure.service.called",
      }),
      expect.any(Object),
    );
  });
});
