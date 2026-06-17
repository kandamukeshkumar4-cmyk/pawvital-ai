import { resolvePlatformProviderConfig } from "../config";
import type { PlatformDbProvider } from "../types";
import { AzurePostgresDbProvider } from "./azure-postgres-provider";
import { SupabaseDbProvider } from "./supabase-provider";

let cachedDbProvider: PlatformDbProvider | null = null;

export function getPlatformDbProvider(
  env: NodeJS.ProcessEnv = process.env
): PlatformDbProvider {
  if (cachedDbProvider) {
    return cachedDbProvider;
  }

  const config = resolvePlatformProviderConfig(env);
  cachedDbProvider =
    config.db === "azure-postgres"
      ? new AzurePostgresDbProvider()
      : new SupabaseDbProvider();

  return cachedDbProvider;
}

export function resetPlatformDbProviderForTests(): void {
  cachedDbProvider = null;
}
