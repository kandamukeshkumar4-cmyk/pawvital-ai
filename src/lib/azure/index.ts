export type AzureEnv = Partial<Record<string, string | undefined>>;

export type AzureRuntimeConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  keyVaultName: string;
  vaultUrl: string;
};

type MaybePromise<T> = T | Promise<T>;

export type SecretClientLike = {
  getSecret(name: string): Promise<{ value?: string | null }>;
};

export type SecretClientFactory = (
  config: AzureRuntimeConfig
) => MaybePromise<SecretClientLike>;

type BlobContainerClientLike<TBlobClient> = {
  getBlockBlobClient(blobName: string): TBlobClient;
};

export type BlobServiceClientLike<TBlobClient = unknown> = {
  getContainerClient(containerName: string): BlobContainerClientLike<TBlobClient>;
};

export type BlobServiceClientFactory<TBlobClient = unknown> = (
  connectionString: string
) => MaybePromise<BlobServiceClientLike<TBlobClient>>;

export type AzureClientOptions<TBlobClient = unknown> = {
  env?: AzureEnv;
  secretClientFactory?: SecretClientFactory;
  blobServiceClientFactory?: BlobServiceClientFactory<TBlobClient>;
};

export type AzureKeyEndpointClient = {
  key: string;
  endpoint: string;
};

export type AzureRegionalKeyEndpointClient = AzureKeyEndpointClient & {
  region: string;
};

export type AzureKeyOnlyClient = {
  key: string;
};

export const AZURE_SECRET_NAMES = {
  appConfigConnectionString: "appconfig-connection-string",
  appInsightsConnectionString: "appinsights-connection-string",
  azureStorageConnectionString: "azure-storage-connection-string",
  contentSafetyEndpoint: "contentsafety-endpoint",
  contentSafetyKey: "contentsafety-key",
  customVisionTrainingEndpoint: "customvision-training-endpoint",
  customVisionTrainingKey: "customvision-training-key",
  docIntelEndpoint: "docintel-endpoint",
  docIntelKey: "docintel-key",
  mapsKey: "maps-key",
  serviceBusConnectionString: "servicebus-connection-string",
  speechEndpoint: "speech-endpoint",
  speechKey: "speech-key",
  speechRegion: "speech-region",
  translatorEndpoint: "translator-endpoint",
  translatorKey: "translator-key",
  translatorRegion: "translator-region",
  webPubSubConnectionString: "webpubsub-connection-string",
} as const;

function readEnv(env: AzureEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function normalizeVaultName(rawValue: string): string {
  if (!rawValue.startsWith("http://") && !rawValue.startsWith("https://")) {
    return rawValue.replace(/\/+$/, "");
  }

  try {
    const hostname = new URL(rawValue).hostname;
    return hostname.replace(/\.vault\.azure\.net$/i, "");
  } catch {
    return rawValue.replace(/\/+$/, "");
  }
}

function buildVaultUrl(keyVaultName: string): string {
  return `https://${keyVaultName}.vault.azure.net`;
}

export function getAzureRuntimeConfig(
  env: AzureEnv = process.env
): AzureRuntimeConfig | null {
  const tenantId = readEnv(env, "AZURE_TENANT_ID");
  const clientId = readEnv(env, "AZURE_CLIENT_ID");
  const clientSecret = readEnv(env, "AZURE_CLIENT_SECRET");
  const rawKeyVaultName = readEnv(env, "AZURE_KEY_VAULT_NAME");

  if (!tenantId || !clientId || !clientSecret || !rawKeyVaultName) {
    return null;
  }

  const keyVaultName = normalizeVaultName(rawKeyVaultName);
  return {
    tenantId,
    clientId,
    clientSecret,
    keyVaultName,
    vaultUrl: buildVaultUrl(keyVaultName),
  };
}

async function createDefaultSecretClient(
  config: AzureRuntimeConfig
): Promise<SecretClientLike> {
  const [{ ClientSecretCredential }, { SecretClient }] = await Promise.all([
    import("@azure/identity"),
    import("@azure/keyvault-secrets"),
  ]);
  const credential = new ClientSecretCredential(
    config.tenantId,
    config.clientId,
    config.clientSecret
  );
  return new SecretClient(config.vaultUrl, credential);
}

async function getSecretClient(
  config: AzureRuntimeConfig,
  factory?: SecretClientFactory
): Promise<SecretClientLike> {
  return factory ? await factory(config) : createDefaultSecretClient(config);
}

async function createDefaultBlobServiceClient<TBlobClient = unknown>(
  connectionString: string
): Promise<BlobServiceClientLike<TBlobClient>> {
  const { BlobServiceClient } = await import("@azure/storage-blob");
  return BlobServiceClient.fromConnectionString(
    connectionString
  ) as unknown as BlobServiceClientLike<TBlobClient>;
}

function normalizeSecretValue(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getSecret(
  name: string,
  options: AzureClientOptions = {}
): Promise<string | null> {
  const config = getAzureRuntimeConfig(options.env);
  if (!config) {
    return null;
  }

  try {
    const client = await getSecretClient(config, options.secretClientFactory);
    const secret = await client.getSecret(name);
    return normalizeSecretValue(secret.value);
  } catch {
    return null;
  }
}

async function getRequiredSecrets(
  names: string[],
  options: AzureClientOptions = {}
): Promise<string[] | null> {
  const values = await Promise.all(names.map((name) => getSecret(name, options)));
  if (values.some((value) => !value)) {
    return null;
  }
  return values as string[];
}

export async function getBlobClient<TBlobClient = unknown>(
  containerName: string,
  blobName: string,
  options: AzureClientOptions<TBlobClient> = {}
): Promise<TBlobClient | null> {
  const connectionString = await getSecret(
    AZURE_SECRET_NAMES.azureStorageConnectionString,
    options
  );
  if (!connectionString) {
    return null;
  }

  const blobServiceClient = options.blobServiceClientFactory
    ? await options.blobServiceClientFactory(connectionString)
    : await createDefaultBlobServiceClient<TBlobClient>(connectionString);

  return blobServiceClient
    .getContainerClient(containerName)
    .getBlockBlobClient(blobName);
}

function inferRegionFromEndpoint(endpoint: string): string | null {
  const hostname = (() => {
    try {
      return new URL(endpoint).hostname;
    } catch {
      return "";
    }
  })();
  const match = hostname.match(/^([a-z0-9-]+)\.api\.cognitive\.microsoft\.com$/i);
  return match?.[1] ?? null;
}

export async function getSpeechToken(
  options: AzureClientOptions = {}
): Promise<AzureRegionalKeyEndpointClient | null> {
  const values = await getRequiredSecrets(
    [AZURE_SECRET_NAMES.speechKey, AZURE_SECRET_NAMES.speechEndpoint],
    options
  );
  if (!values) {
    return null;
  }

  const [key, endpoint] = values;
  const explicitRegion = await getSecret(AZURE_SECRET_NAMES.speechRegion, options);
  const region = explicitRegion ?? inferRegionFromEndpoint(endpoint);
  if (!region) {
    return null;
  }

  return { key, endpoint, region };
}

async function getKeyEndpointClient(
  keySecretName: string,
  endpointSecretName: string,
  options: AzureClientOptions = {}
): Promise<AzureKeyEndpointClient | null> {
  const values = await getRequiredSecrets(
    [keySecretName, endpointSecretName],
    options
  );
  if (!values) {
    return null;
  }

  const [key, endpoint] = values;
  return { key, endpoint };
}

export function getContentSafetyClient(
  options: AzureClientOptions = {}
): Promise<AzureKeyEndpointClient | null> {
  return getKeyEndpointClient(
    AZURE_SECRET_NAMES.contentSafetyKey,
    AZURE_SECRET_NAMES.contentSafetyEndpoint,
    options
  );
}

export function getDocumentIntelligenceClient(
  options: AzureClientOptions = {}
): Promise<AzureKeyEndpointClient | null> {
  return getKeyEndpointClient(
    AZURE_SECRET_NAMES.docIntelKey,
    AZURE_SECRET_NAMES.docIntelEndpoint,
    options
  );
}

export function getTranslatorClient(
  options: AzureClientOptions = {}
): Promise<AzureRegionalKeyEndpointClient | null> {
  return getRequiredSecrets(
    [
      AZURE_SECRET_NAMES.translatorKey,
      AZURE_SECRET_NAMES.translatorEndpoint,
      AZURE_SECRET_NAMES.translatorRegion,
    ],
    options
  ).then((values) => {
    if (!values) {
      return null;
    }

    const [key, endpoint, region] = values;
    return { key, endpoint, region };
  });
}

export function getCustomVisionTrainingClient(
  options: AzureClientOptions = {}
): Promise<AzureKeyEndpointClient | null> {
  return getKeyEndpointClient(
    AZURE_SECRET_NAMES.customVisionTrainingKey,
    AZURE_SECRET_NAMES.customVisionTrainingEndpoint,
    options
  );
}

export async function getMapsClient(
  options: AzureClientOptions = {}
): Promise<AzureKeyOnlyClient | null> {
  const key = await getSecret(AZURE_SECRET_NAMES.mapsKey, options);
  return key ? { key } : null;
}

export function getAppConfigConnectionString(
  options: AzureClientOptions = {}
): Promise<string | null> {
  return getSecret(AZURE_SECRET_NAMES.appConfigConnectionString, options);
}

export function getAppInsightsConnectionString(
  options: AzureClientOptions = {}
): Promise<string | null> {
  return getSecret(AZURE_SECRET_NAMES.appInsightsConnectionString, options);
}

export function getServiceBusConnectionString(
  options: AzureClientOptions = {}
): Promise<string | null> {
  return getSecret(AZURE_SECRET_NAMES.serviceBusConnectionString, options);
}

export function getWebPubSubConnectionString(
  options: AzureClientOptions = {}
): Promise<string | null> {
  return getSecret(AZURE_SECRET_NAMES.webPubSubConnectionString, options);
}
