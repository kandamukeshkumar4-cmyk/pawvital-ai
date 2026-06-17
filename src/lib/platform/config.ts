import type {
  PlatformAuthProviderId,
  PlatformBlobProviderId,
  PlatformDbProviderId,
} from "./types";

export interface PlatformProviderConfig {
  auth: PlatformAuthProviderId;
  db: PlatformDbProviderId;
  blob: PlatformBlobProviderId;
}

export function resolvePlatformProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): PlatformProviderConfig {
  const auth = env.PLATFORM_AUTH_PROVIDER?.trim().toLowerCase();
  const db = env.PLATFORM_DB_PROVIDER?.trim().toLowerCase();
  const blob = env.PLATFORM_BLOB_PROVIDER?.trim().toLowerCase();

  return {
    auth: auth === "azure-entra" ? "azure-entra" : "supabase",
    db: db === "azure-postgres" ? "azure-postgres" : "supabase",
    blob: blob === "supabase" ? "supabase" : "azure",
  };
}
