import {
  getAppConfigConnectionString,
  type AzureClientOptions,
} from "@/lib/azure";

type MaybePromise<T> = T | Promise<T>;

export type AppConfigurationSettingLike = {
  value?: string | null;
};

export type AppConfigurationClientLike = {
  getConfigurationSetting(setting: {
    key: string;
    label?: string;
  }): Promise<AppConfigurationSettingLike>;
};

export type AppConfigurationClientFactory = (
  connectionString: string
) => MaybePromise<AppConfigurationClientLike>;

export type AzureFeatureFlagOptions = AzureClientOptions & {
  appConfigurationClientFactory?: AppConfigurationClientFactory;
  label?: string;
};

const FEATURE_FLAG_KEY_PREFIX = ".appconfig.featureflag/";

function normalizeFlagKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith(FEATURE_FLAG_KEY_PREFIX)
    ? trimmed
    : `${FEATURE_FLAG_KEY_PREFIX}${trimmed}`;
}

function parseFeatureFlagValue(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as { enabled?: unknown };
    return parsed.enabled === true;
  } catch {
    return false;
  }
}

async function createDefaultAppConfigurationClient(
  connectionString: string
): Promise<AppConfigurationClientLike> {
  const { AppConfigurationClient } = await import("@azure/app-configuration");
  return new AppConfigurationClient(connectionString);
}

async function getAppConfigurationClient(
  connectionString: string,
  factory?: AppConfigurationClientFactory
): Promise<AppConfigurationClientLike> {
  return factory
    ? await factory(connectionString)
    : createDefaultAppConfigurationClient(connectionString);
}

export async function getFlag(
  key: string,
  options: AzureFeatureFlagOptions = {}
): Promise<boolean> {
  const normalizedKey = normalizeFlagKey(key);
  if (!normalizedKey) {
    return false;
  }

  try {
    const connectionString = await getAppConfigConnectionString(options);
    if (!connectionString) {
      return false;
    }

    const client = await getAppConfigurationClient(
      connectionString,
      options.appConfigurationClientFactory
    );
    const setting = await client.getConfigurationSetting({
      key: normalizedKey,
      ...(options.label ? { label: options.label } : {}),
    });

    return parseFeatureFlagValue(setting.value);
  } catch {
    return false;
  }
}
