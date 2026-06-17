import {
  resolvePlatformProviderConfig,
  resetPlatformAuthProviderForTests,
  getPlatformAuthProvider,
} from "@/lib/platform";

describe("platform adapters (VET-1585)", () => {
  afterEach(() => {
    resetPlatformAuthProviderForTests();
  });

  it("defaults to supabase auth and db with azure blob", () => {
    expect(
      resolvePlatformProviderConfig({
        PLATFORM_AUTH_PROVIDER: "supabase",
        PLATFORM_DB_PROVIDER: "supabase",
        PLATFORM_BLOB_PROVIDER: "azure",
      })
    ).toEqual({
      auth: "supabase",
      db: "supabase",
      blob: "azure",
    });
  });

  it("selects azure adapters when configured", () => {
    expect(
      resolvePlatformProviderConfig({
        PLATFORM_AUTH_PROVIDER: "azure-entra",
        PLATFORM_DB_PROVIDER: "azure-postgres",
      })
    ).toEqual({
      auth: "azure-entra",
      db: "azure-postgres",
      blob: "azure",
    });
    expect(
      getPlatformAuthProvider({
        PLATFORM_AUTH_PROVIDER: "azure-entra",
      }).id
    ).toBe("azure-entra");
  });
});
