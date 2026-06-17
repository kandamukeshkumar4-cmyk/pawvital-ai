export type PlatformAuthProviderId = "supabase" | "azure-entra";
export type PlatformDbProviderId = "supabase" | "azure-postgres";
export type PlatformBlobProviderId = "azure" | "supabase";

export interface PlatformUser {
  id: string;
  email: string | null;
}

export interface PlatformAuthProvider {
  readonly id: PlatformAuthProviderId;
  getCurrentUser(): Promise<PlatformUser | null>;
}

export interface PlatformDbProvider {
  readonly id: PlatformDbProviderId;
  /** Health probe for cutover smoke tests */
  ping(): Promise<boolean>;
}

export interface PlatformBlobProvider {
  readonly id: PlatformBlobProviderId;
  isConfigured(): Promise<boolean>;
}
