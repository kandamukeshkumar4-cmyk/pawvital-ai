import type { PlatformAuthProvider, PlatformUser } from "../types";

/**
 * Entra External ID adapter (C1). Requires Auth.js Entra provider wiring at cutover.
 * Until PLATFORM_AUTH_PROVIDER=azure-entra and Entra env vars are set, returns null.
 */
export class AzureEntraAuthProvider implements PlatformAuthProvider {
  readonly id = "azure-entra" as const;

  async getCurrentUser(): Promise<PlatformUser | null> {
    const tenantId = process.env.AZURE_ENTRA_TENANT_ID?.trim();
    const clientId = process.env.AZURE_ENTRA_CLIENT_ID?.trim();
    if (!tenantId || !clientId) {
      return null;
    }

    // Session resolution is delegated to Auth.js route handlers once C1 lands.
    return null;
  }
}
