import type { SecretClientLike } from "@/lib/azure";
import {
  AZURE_MAPS_FEATURE_FLAG,
  findNearestEmergencyVets,
  type AzureMapsFetch,
} from "@/lib/azure/maps";

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
      expect(setting.key).toBe(`.appconfig.featureflag/${AZURE_MAPS_FEATURE_FLAG}`);
      return {
        value: JSON.stringify({ enabled: true }),
      };
    },
  };
}

describe("Azure Maps nearest emergency vet lookup", () => {
  it("defaults off when the maps feature flag is disabled", async () => {
    const fetchMaps = jest.fn();

    await expect(
      findNearestEmergencyVets(
        { latitude: 41.149, longitude: -81.358 },
        {
          appConfigurationClientFactory: () => ({
            getConfigurationSetting: async () => ({
              value: JSON.stringify({ enabled: false }),
            }),
          }),
          env: CONFIGURED_ENV,
          fetchMaps,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
              "maps-key": "maps-secret",
            }),
        }
      )
    ).resolves.toEqual({
      clinics: [],
      enabled: false,
      reason: "feature_disabled",
    });

    expect(fetchMaps).not.toHaveBeenCalled();
  });

  it("returns not_configured when the Key Vault maps key is absent", async () => {
    const fetchMaps = jest.fn();

    await expect(
      findNearestEmergencyVets(
        { latitude: 41.149, longitude: -81.358 },
        {
          appConfigurationClientFactory: () => enabledFlagClient(),
          env: CONFIGURED_ENV,
          fetchMaps,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            }),
        }
      )
    ).resolves.toEqual({
      clinics: [],
      enabled: false,
      reason: "not_configured",
    });

    expect(fetchMaps).not.toHaveBeenCalled();
  });

  it("rejects invalid owner coordinates before reading secrets", async () => {
    const fetchMaps = jest.fn();

    await expect(
      findNearestEmergencyVets(
        { latitude: 95, longitude: -81.358 },
        {
          appConfigurationClientFactory: () => enabledFlagClient(),
          env: CONFIGURED_ENV,
          fetchMaps,
          secretClientFactory: () => makeSecretClient({}),
        }
      )
    ).resolves.toEqual({
      clinics: [],
      enabled: false,
      reason: "invalid_location",
    });

    expect(fetchMaps).not.toHaveBeenCalled();
  });

  it("returns sanitized clinic records from Azure Maps search results", async () => {
    const fetchMaps: jest.MockedFunction<AzureMapsFetch> = jest.fn(
      async (input) => {
        const url = input instanceof URL ? input : new URL(input);
        expect(url.origin).toBe("https://atlas.microsoft.com");
        expect(url.pathname).toBe("/search/fuzzy/json");
        expect(url.searchParams.get("subscription-key")).toBe("maps-secret");
        expect(url.searchParams.get("query")).toBe("emergency veterinarian");
        expect(url.searchParams.get("lat")).toBe("41.149000");
        expect(url.searchParams.get("lon")).toBe("-81.358000");

        return {
          json: async () => ({
            results: [
              {
                address: { freeformAddress: "1 Clinic Way, Kent, OH" },
                dist: 3218.68,
                id: "clinic-1",
                poi: {
                  name: "Kent Emergency Veterinary Hospital",
                  phone: "+13305550123",
                  url: "https://clinic.example",
                },
                position: { lat: 41.15, lon: -81.36 },
              },
              {
                poi: { name: "Missing position" },
              },
            ],
          }),
          ok: true,
          status: 200,
        };
      }
    );

    await expect(
      findNearestEmergencyVets(
        { latitude: 41.149, longitude: -81.358 },
        {
          appConfigurationClientFactory: () => enabledFlagClient(),
          env: CONFIGURED_ENV,
          fetchMaps,
          secretClientFactory: () =>
            makeSecretClient({
              "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
              "maps-key": "maps-secret",
            }),
        }
      )
    ).resolves.toEqual({
      clinics: [
        {
          address: "1 Clinic Way, Kent, OH",
          distanceMeters: 3218.68,
          id: "clinic-1",
          mapUrl: "https://www.google.com/maps/search/?api=1&query=41.150000%2C-81.360000",
          name: "Kent Emergency Veterinary Hospital",
          phone: "+13305550123",
          website: "https://clinic.example",
        },
      ],
      enabled: true,
    });
  });

  it("returns a redacted maps_unavailable result when Azure Maps fails", async () => {
    const fetchMaps: jest.MockedFunction<AzureMapsFetch> = jest.fn(
      async () => ({
        json: async () => ({ error: "maps-secret forbidden" }),
        ok: false,
        status: 403,
      })
    );

    const result = await findNearestEmergencyVets(
      { latitude: 41.149, longitude: -81.358 },
      {
        appConfigurationClientFactory: () => enabledFlagClient(),
        env: CONFIGURED_ENV,
        fetchMaps,
        secretClientFactory: () =>
          makeSecretClient({
            "appconfig-connection-string": APP_CONFIG_CONNECTION_STRING,
            "maps-key": "maps-secret",
          }),
      }
    );

    expect(result).toEqual({
      clinics: [],
      enabled: false,
      reason: "maps_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("maps-secret");
  });
});
