import { getFlag } from "@/lib/azure/app-config";
import type { SecretClientLike } from "@/lib/azure";

const CONFIGURED_ENV = {
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_KEY_VAULT_NAME: "test-vault",
};

const TEST_CONNECTION_STRING =
  "Endpoint=https://pawvital-appconfig.azconfig.io;Id=test;Secret=test";

function makeSecretClient(secrets: Record<string, string>): SecretClientLike {
  return {
    getSecret: async (name: string) => ({ value: secrets[name] ?? null }),
  };
}

describe("azure app configuration feature flags", () => {
  it("defaults off when Azure runtime env is absent", async () => {
    const secretClientFactory = jest.fn();
    const appConfigurationClientFactory = jest.fn();

    await expect(
      getFlag("azure.speech.enabled", {
        env: {},
        secretClientFactory,
        appConfigurationClientFactory,
      })
    ).resolves.toBe(false);

    expect(secretClientFactory).not.toHaveBeenCalled();
    expect(appConfigurationClientFactory).not.toHaveBeenCalled();
  });

  it("reads enabled App Configuration feature flags through the Key Vault connection string", async () => {
    const getConfigurationSetting = jest.fn(async () => ({
      value: JSON.stringify({
        id: "azure.speech.enabled",
        enabled: true,
      }),
    }));
    const appConfigurationClientFactory = jest.fn(() => ({
      getConfigurationSetting,
    }));

    await expect(
      getFlag("azure.speech.enabled", {
        env: CONFIGURED_ENV,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": TEST_CONNECTION_STRING,
          }),
        appConfigurationClientFactory,
      })
    ).resolves.toBe(true);

    expect(appConfigurationClientFactory).toHaveBeenCalledWith(
      TEST_CONNECTION_STRING
    );
    expect(getConfigurationSetting).toHaveBeenCalledWith({
      key: ".appconfig.featureflag/azure.speech.enabled",
    });
  });

  it("passes an optional label to App Configuration", async () => {
    const getConfigurationSetting = jest.fn(async () => ({
      value: JSON.stringify({ enabled: true }),
    }));

    await getFlag("azure.docintel.enabled", {
      env: CONFIGURED_ENV,
      label: "production",
      secretClientFactory: () =>
        makeSecretClient({
          "appconfig-connection-string": TEST_CONNECTION_STRING,
        }),
      appConfigurationClientFactory: () => ({ getConfigurationSetting }),
    });

    expect(getConfigurationSetting).toHaveBeenCalledWith({
      key: ".appconfig.featureflag/azure.docintel.enabled",
      label: "production",
    });
  });

  it("defaults off when the Key Vault appconfig secret is missing", async () => {
    const appConfigurationClientFactory = jest.fn();

    await expect(
      getFlag("azure.translator.enabled", {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeSecretClient({}),
        appConfigurationClientFactory,
      })
    ).resolves.toBe(false);

    expect(appConfigurationClientFactory).not.toHaveBeenCalled();
  });

  it("defaults off when App Configuration is unreachable or returns malformed flags", async () => {
    await expect(
      getFlag("azure.async-review.enabled", {
        env: CONFIGURED_ENV,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": TEST_CONNECTION_STRING,
          }),
        appConfigurationClientFactory: () => ({
          getConfigurationSetting: async () => {
            throw new Error("network unavailable");
          },
        }),
      })
    ).resolves.toBe(false);

    await expect(
      getFlag("azure.async-review.enabled", {
        env: CONFIGURED_ENV,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": TEST_CONNECTION_STRING,
          }),
        appConfigurationClientFactory: () => ({
          getConfigurationSetting: async () => ({ value: "not-json" }),
        }),
      })
    ).resolves.toBe(false);

    await expect(
      getFlag("azure.async-review.enabled", {
        env: CONFIGURED_ENV,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": TEST_CONNECTION_STRING,
          }),
        appConfigurationClientFactory: () => ({
          getConfigurationSetting: async () => ({
            value: JSON.stringify({ enabled: false }),
          }),
        }),
      })
    ).resolves.toBe(false);
  });
});
