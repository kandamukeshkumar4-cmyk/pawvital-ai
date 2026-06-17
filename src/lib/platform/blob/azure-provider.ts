import { AZURE_SECRET_NAMES, getSecret } from "@/lib/azure";
import type { PlatformBlobProvider } from "../types";

export class AzureBlobProvider implements PlatformBlobProvider {
  readonly id = "azure" as const;

  async isConfigured(): Promise<boolean> {
    const connectionString = await getSecret(
      AZURE_SECRET_NAMES.azureStorageConnectionString
    );
    return Boolean(connectionString);
  }
}
