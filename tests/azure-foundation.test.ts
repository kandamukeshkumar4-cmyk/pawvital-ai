describe("azure foundation", () => {
  const configuredEnv = {
    AZURE_TENANT_ID: "tenant-id",
    AZURE_CLIENT_ID: "client-id",
    AZURE_CLIENT_SECRET: "client-secret",
    AZURE_KEY_VAULT_NAME: "pawvital-kv-test",
  };

  it("stays in demo mode when service principal env is absent", async () => {
    const azure = await import("@/lib/azure");
    const factory = jest.fn();

    await expect(
      azure.getSecret("speech-key", { env: {}, secretClientFactory: factory })
    ).resolves.toBeNull();

    expect(azure.getAzureRuntimeConfig({})).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it("uses the Key Vault name to build a secret client when configured", async () => {
    const azure = await import("@/lib/azure");
    const getSecret = jest.fn().mockResolvedValue({ value: " secret-value " });
    const factory = jest.fn().mockReturnValue({ getSecret });

    await expect(
      azure.getSecret("speech-key", {
        env: configuredEnv,
        secretClientFactory: factory,
      })
    ).resolves.toBe("secret-value");

    expect(factory).toHaveBeenCalledWith({
      tenantId: "tenant-id",
      clientId: "client-id",
      clientSecret: "client-secret",
      keyVaultName: "pawvital-kv-test",
      vaultUrl: "https://pawvital-kv-test.vault.azure.net",
    });
    expect(getSecret).toHaveBeenCalledWith("speech-key");
  });

  it("returns null instead of empty secret values", async () => {
    const azure = await import("@/lib/azure");

    await expect(
      azure.getSecret("missing-secret", {
        env: configuredEnv,
        secretClientFactory: () => ({
          getSecret: jest.fn().mockResolvedValue({ value: "   " }),
        }),
      })
    ).resolves.toBeNull();
  });

  it("creates blob clients from the Key Vault storage connection string", async () => {
    const azure = await import("@/lib/azure");
    const getSecret = jest
      .fn()
      .mockResolvedValue({ value: "DefaultEndpointsProtocol=https;..." });
    const getBlockBlobClient = jest.fn().mockReturnValue("blob-client");
    const getContainerClient = jest.fn().mockReturnValue({ getBlockBlobClient });
    const blobServiceClientFactory = jest.fn().mockReturnValue({
      getContainerClient,
    });

    await expect(
      azure.getBlobClient("reports", "case-1.pdf", {
        env: configuredEnv,
        secretClientFactory: () => ({ getSecret }),
        blobServiceClientFactory,
      })
    ).resolves.toBe("blob-client");

    expect(getSecret).toHaveBeenCalledWith("azure-storage-connection-string");
    expect(blobServiceClientFactory).toHaveBeenCalledWith(
      "DefaultEndpointsProtocol=https;..."
    );
    expect(getContainerClient).toHaveBeenCalledWith("reports");
    expect(getBlockBlobClient).toHaveBeenCalledWith("case-1.pdf");
  });

  it("returns speech config only when all speech secrets are present", async () => {
    const azure = await import("@/lib/azure");
    const values = new Map([
      ["speech-key", "speech-secret"],
      ["speech-endpoint", "https://speech.example"],
      ["speech-region", "centralus"],
    ]);

    await expect(
      azure.getSpeechToken({
        env: configuredEnv,
        secretClientFactory: () => ({
          getSecret: jest.fn(async (name: string) => ({
            value: values.get(name) ?? "",
          })),
        }),
      })
    ).resolves.toEqual({
      key: "speech-secret",
      endpoint: "https://speech.example",
      region: "centralus",
    });
  });

  it("returns null content safety config when either key or endpoint is absent", async () => {
    const azure = await import("@/lib/azure");

    await expect(
      azure.getContentSafetyClient({
        env: configuredEnv,
        secretClientFactory: () => ({
          getSecret: jest.fn(async (name: string) => ({
            value: name === "contentsafety-endpoint" ? "https://safe.example" : "",
          })),
        }),
      })
    ).resolves.toBeNull();
  });

  it("returns maps config from the Key Vault maps key", async () => {
    const azure = await import("@/lib/azure");

    await expect(
      azure.getMapsClient({
        env: configuredEnv,
        secretClientFactory: () => ({
          getSecret: jest.fn(async () => ({ value: "maps-secret" })),
        }),
      })
    ).resolves.toEqual({ key: "maps-secret" });
  });
});
