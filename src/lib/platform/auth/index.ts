import { resolvePlatformProviderConfig } from "../config";
import type { PlatformAuthProvider } from "../types";
import { AzureEntraAuthProvider } from "./azure-entra-provider";
import { SupabaseAuthProvider } from "./supabase-provider";

let cachedAuthProvider: PlatformAuthProvider | null = null;

export function getPlatformAuthProvider(
  env: NodeJS.ProcessEnv = process.env
): PlatformAuthProvider {
  if (cachedAuthProvider) {
    return cachedAuthProvider;
  }

  const config = resolvePlatformProviderConfig(env);
  cachedAuthProvider =
    config.auth === "azure-entra"
      ? new AzureEntraAuthProvider()
      : new SupabaseAuthProvider();

  return cachedAuthProvider;
}

export function resetPlatformAuthProviderForTests(): void {
  cachedAuthProvider = null;
}
