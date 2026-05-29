import {
  AZURE_TRANSLATOR_FEATURE_FLAG,
  translateTexts,
  type AzureTranslatorFetch,
} from "@/lib/azure/translator";
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
    getConfigurationSetting: async (setting: { key: string }) => {
      expect(setting.key).toBe(`.appconfig.featureflag/${AZURE_TRANSLATOR_FEATURE_FLAG}`);
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

describe("azure translator helper", () => {
  it("defaults off when the App Config translator flag is disabled", async () => {
    const fetchTranslator = jest.fn();

    await expect(
      translateTexts(
        { targetLanguage: "en", texts: ["Mi perro vomita"] },
        {
          appConfigurationClientFactory: () => disabledFlagClient(),
          env: CONFIGURED_ENV,
          fetchTranslator,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            }),
        },
      ),
    ).resolves.toEqual({
      enabled: false,
      reason: "feature_disabled",
    });

    expect(fetchTranslator).not.toHaveBeenCalled();
  });

  it("translates owner text through the global Translator endpoint without exposing the key", async () => {
    const fetchTranslator: jest.MockedFunction<AzureTranslatorFetch> = jest.fn(
      async () => ({
        json: async () => [
          {
            detectedLanguage: { language: "es", score: 1 },
            translations: [{ text: "Buddy is vomiting", to: "en" }],
          },
        ],
        ok: true,
        status: 200,
      }),
    );

    const result = await translateTexts(
      { targetLanguage: "en", texts: ["Buddy está vomitando"] },
      {
        appConfigurationClientFactory: () => enabledFlagClient(),
        env: CONFIGURED_ENV,
        fetchTranslator,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            "translator-endpoint": "https://api.cognitive.microsofttranslator.com/",
            "translator-key": "translator-secret",
            "translator-region": "global",
          }),
      },
    );

    expect(result).toEqual({
      detectedLanguage: "es",
      enabled: true,
      sourceLanguage: null,
      targetLanguage: "en",
      translated: true,
      translations: ["Buddy is vomiting"],
    });

    const [url, init] = fetchTranslator.mock.calls[0];
    expect(String(url)).toContain("https://api.cognitive.microsofttranslator.com/translate");
    expect(String(url)).toContain("api-version=3.0");
    expect(String(url)).toContain("to=en");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": "translator-secret",
      "X-ClientTraceId": expect.any(String),
    });
    expect(init.headers).not.toHaveProperty("Ocp-Apim-Subscription-Region");
    expect(JSON.stringify(result)).not.toContain("translator-secret");
  });

  it("uses the custom cognitive-services Translator path and regional header when configured", async () => {
    const fetchTranslator: jest.MockedFunction<AzureTranslatorFetch> = jest.fn(
      async () => ({
        json: async () => [
          {
            translations: [{ text: "¿Cuántas veces ha vomitado?", to: "es" }],
          },
        ],
        ok: true,
        status: 200,
      }),
    );

    await translateTexts(
      {
        sourceLanguage: "en",
        targetLanguage: "es",
        texts: ["How many times has he vomited?"],
      },
      {
        appConfigurationClientFactory: () => enabledFlagClient(),
        env: CONFIGURED_ENV,
        fetchTranslator,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            "translator-endpoint": "https://pawvital-translator.cognitiveservices.azure.com/",
            "translator-key": "translator-secret",
            "translator-region": "centralus",
          }),
      },
    );

    const [url, init] = fetchTranslator.mock.calls[0];
    expect(String(url)).toContain(
      "https://pawvital-translator.cognitiveservices.azure.com/translator/text/v3.0/translate",
    );
    expect(String(url)).toContain("from=en");
    expect(String(url)).toContain("to=es");
    expect(init.headers).toMatchObject({
      "Ocp-Apim-Subscription-Region": "centralus",
    });
  });

  it("fails closed when Translator secrets are missing", async () => {
    const fetchTranslator = jest.fn();

    await expect(
      translateTexts(
        { targetLanguage: "en", texts: ["Mi perro vomita"] },
        {
          appConfigurationClientFactory: () => enabledFlagClient(),
          env: CONFIGURED_ENV,
          fetchTranslator,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            }),
        },
      ),
    ).resolves.toEqual({
      enabled: false,
      reason: "not_configured",
    });

    expect(fetchTranslator).not.toHaveBeenCalled();
  });
});
