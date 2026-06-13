export { resolvePlatformProviderConfig, type PlatformProviderConfig } from "./config";
export { getPlatformAuthProvider, resetPlatformAuthProviderForTests } from "./auth";
export { getPlatformDbProvider, resetPlatformDbProviderForTests } from "./db";
export { getPlatformBlobProvider, resetPlatformBlobProviderForTests } from "./blob";
export type {
  PlatformAuthProvider,
  PlatformAuthProviderId,
  PlatformBlobProvider,
  PlatformBlobProviderId,
  PlatformDbProvider,
  PlatformDbProviderId,
  PlatformUser,
} from "./types";
