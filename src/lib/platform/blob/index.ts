import { resolvePlatformProviderConfig } from "../config";
import type { PlatformBlobProvider } from "../types";
import { AzureBlobProvider } from "./azure-provider";

let cachedBlobProvider: PlatformBlobProvider | null = null;

export function getPlatformBlobProvider(
  env: NodeJS.ProcessEnv = process.env
): PlatformBlobProvider {
  if (cachedBlobProvider) {
    return cachedBlobProvider;
  }

  const config = resolvePlatformProviderConfig(env);
  if (config.blob === "azure") {
    cachedBlobProvider = new AzureBlobProvider();
  } else {
    cachedBlobProvider = new AzureBlobProvider();
  }

  return cachedBlobProvider;
}

export function resetPlatformBlobProviderForTests(): void {
  cachedBlobProvider = null;
}
