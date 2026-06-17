import {
  AZURE_SPEECH_TOKEN_TTL_SECONDS,
  getSpeechAuthorizationToken,
  type SpeechTokenFetch,
} from "@/lib/azure/speech";
import type { SecretClientLike } from "@/lib/azure";

const CONFIGURED_ENV = {
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_KEY_VAULT_NAME: "test-vault",
};

const APP_CONFIG_CONNECTION_STRING =
  "Endpoint=https://pawvital-appconfig.azconfig.io;Id=test;Secret=test";

function makeSecretClient(secrets: Record<string, string>): SecretClientLike {
  return {
    getSecret: async (name: string) => ({ value: secrets[name] ?? null }),
  };
}

function enabledFlagClient() {
  return {
    getConfigurationSetting: async () => ({
      value: JSON.stringify({ enabled: true }),
    }),
  };
}

describe("azure speech authorization token", () => {
  it("defaults off when App Configuration disables speech", async () => {
    const fetchToken = jest.fn();

    await expect(
      getSpeechAuthorizationToken({
        env: CONFIGURED_ENV,
        fetchToken,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
          }),
        appConfigurationClientFactory: () => ({
          getConfigurationSetting: async () => ({
            value: JSON.stringify({ enabled: false }),
          }),
        }),
      })
    ).resolves.toEqual({
      enabled: false,
      reason: "feature_disabled",
    });

    expect(fetchToken).not.toHaveBeenCalled();
  });

  it("exchanges the Key Vault speech key for a short-lived browser token", async () => {
    const fetchToken: jest.MockedFunction<SpeechTokenFetch> = jest.fn(
      async () => ({
        ok: true,
        status: 200,
        text: async () => " browser-token ",
      })
    );

    await expect(
      getSpeechAuthorizationToken({
        env: CONFIGURED_ENV,
        fetchToken,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            "speech-endpoint": "https://centralus.api.cognitive.microsoft.com/",
            "speech-key": "speech-secret",
            "speech-region": "centralus",
          }),
        appConfigurationClientFactory: () => enabledFlagClient(),
      })
    ).resolves.toEqual({
      enabled: true,
      expiresInSeconds: AZURE_SPEECH_TOKEN_TTL_SECONDS,
      region: "centralus",
      token: "browser-token",
    });

    expect(fetchToken).toHaveBeenCalledWith(
      "https://centralus.api.cognitive.microsoft.com/sts/v1.0/issueToken",
      {
        headers: {
          "Ocp-Apim-Subscription-Key": "speech-secret",
        },
        method: "POST",
      }
    );
  });

  it("does not expose the subscription key when token exchange fails", async () => {
    const fetchToken: jest.MockedFunction<SpeechTokenFetch> = jest.fn(
      async () => ({
        ok: false,
        status: 403,
        text: async () => "speech-secret forbidden",
      })
    );

    const result = await getSpeechAuthorizationToken({
      env: CONFIGURED_ENV,
      fetchToken,
      secretClientFactory: () =>
        makeSecretClient({
          "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
          "speech-endpoint": "https://centralus.api.cognitive.microsoft.com/",
          "speech-key": "speech-secret",
          "speech-region": "centralus",
        }),
      appConfigurationClientFactory: () => enabledFlagClient(),
    });

    expect(result).toEqual({
      enabled: false,
      reason: "speech_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("speech-secret");
  });

  it("returns unavailable when speech secrets are missing after the flag is enabled", async () => {
    const fetchToken = jest.fn();

    await expect(
      getSpeechAuthorizationToken({
        env: CONFIGURED_ENV,
        fetchToken,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
          }),
        appConfigurationClientFactory: () => enabledFlagClient(),
      })
    ).resolves.toEqual({
      enabled: false,
      reason: "speech_unavailable",
    });

    expect(fetchToken).not.toHaveBeenCalled();
  });
});
