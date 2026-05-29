import type { SecretClientLike } from "@/lib/azure";
import {
  uploadAudio,
  uploadAzureBlob,
  uploadPetMedia,
  uploadReport,
  type AzureBlockBlobClientLike,
} from "@/lib/azure/blob";

const CONFIGURED_ENV = {
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_KEY_VAULT_NAME: "test-vault",
};

function makeSecretClient(
  secrets: Record<string, string>
): SecretClientLike {
  return {
    getSecret: async (name: string) => ({ value: secrets[name] ?? null }),
  };
}

describe("uploadAzureBlob", () => {
  it("returns a local demo URL when Azure env is absent", async () => {
    const blobServiceClientFactory = jest.fn();

    await expect(
      uploadPetMedia(
        {
          blobName: "user-1/photo.jpg",
          body: Buffer.from("image"),
        },
        { env: {}, blobServiceClientFactory }
      )
    ).resolves.toEqual({
      blobName: "user-1/photo.jpg",
      containerName: "pet-media",
      demo: true,
      ok: true,
      url: "/demo/azure-blobs/pet-media/user-1/photo.jpg",
    });

    expect(blobServiceClientFactory).not.toHaveBeenCalled();
  });

  it("returns a local demo URL when the storage connection string secret is absent", async () => {
    const blobServiceClientFactory = jest.fn();

    await expect(
      uploadReport(
        {
          blobName: "case-1/report.pdf",
          body: Buffer.from("%PDF"),
        },
        {
          env: CONFIGURED_ENV,
          secretClientFactory: () => makeSecretClient({}),
          blobServiceClientFactory,
        }
      )
    ).resolves.toEqual({
      blobName: "case-1/report.pdf",
      containerName: "reports",
      demo: true,
      ok: true,
      url: "/demo/azure-blobs/reports/case-1/report.pdf",
    });

    expect(blobServiceClientFactory).not.toHaveBeenCalled();
  });

  it("uploads through the mocked Azure Block Blob client", async () => {
    const uploadData = jest.fn().mockResolvedValue({
      etag: "etag-1",
      requestId: "request-1",
      versionId: "version-1",
    });
    const blobClient: AzureBlockBlobClientLike = {
      url: "https://storage.example/reports/case-1/report.pdf",
      uploadData,
    };
    const getBlockBlobClient = jest.fn().mockReturnValue(blobClient);
    const getContainerClient = jest.fn().mockReturnValue({ getBlockBlobClient });
    const blobServiceClientFactory = jest.fn().mockReturnValue({
      getContainerClient,
    });

    const result = await uploadReport(
      {
        blobName: "case-1/report.pdf",
        body: "%PDF",
        contentDisposition: "attachment; filename=report.pdf",
        contentType: "application/pdf",
        metadata: {
          empty: " ",
          invalidKey: "kept",
          "not-azure-valid": "dropped",
          sizeBytes: 4,
        },
      },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () =>
          makeSecretClient({
            "azure-storage-connection-string":
              "DefaultEndpointsProtocol=https;AccountName=test;",
          }),
        blobServiceClientFactory,
      }
    );

    expect(blobServiceClientFactory).toHaveBeenCalledWith(
      "DefaultEndpointsProtocol=https;AccountName=test;"
    );
    expect(getContainerClient).toHaveBeenCalledWith("reports");
    expect(getBlockBlobClient).toHaveBeenCalledWith("case-1/report.pdf");
    expect(uploadData).toHaveBeenCalledWith(Buffer.from("%PDF"), {
      blobHTTPHeaders: {
        blobContentDisposition: "attachment; filename=report.pdf",
        blobContentType: "application/pdf",
      },
      metadata: {
        invalidKey: "kept",
        sizeBytes: "4",
      },
    });
    expect(result).toEqual({
      blobName: "case-1/report.pdf",
      containerName: "reports",
      etag: "etag-1",
      ok: true,
      requestId: "request-1",
      url: "https://storage.example/reports/case-1/report.pdf",
      versionId: "version-1",
    });
  });

  it.each(["", " /leading-space", "/absolute", "../escape", "case/../escape"])(
    "rejects unsafe blob name %p before creating Azure clients",
    async (blobName) => {
      const blobServiceClientFactory = jest.fn();

      await expect(
        uploadAudio(
          {
            blobName,
            body: Buffer.from("payload"),
          },
          { env: CONFIGURED_ENV, blobServiceClientFactory }
        )
      ).resolves.toEqual({ ok: false, reason: "invalid_blob_name" });

      expect(blobServiceClientFactory).not.toHaveBeenCalled();
    }
  );

  it("returns upload_failed without exposing the Azure error", async () => {
    const uploadData = jest
      .fn()
      .mockRejectedValue(new Error("container reports missing in centralus"));
    const blobServiceClientFactory = jest.fn().mockReturnValue({
      getContainerClient: () => ({
        getBlockBlobClient: () => ({ uploadData }),
      }),
    });

    await expect(
      uploadAzureBlob(
        {
          blobName: "case-1/report.pdf",
          body: Buffer.from("%PDF"),
          containerName: "reports",
        },
        {
          env: CONFIGURED_ENV,
          secretClientFactory: () =>
            makeSecretClient({
              "azure-storage-connection-string": "UseDevelopmentStorage=true",
            }),
          blobServiceClientFactory,
        }
      )
    ).resolves.toEqual({ ok: false, reason: "upload_failed" });
  });

  it("uses the provisioned pet-media container for pet media uploads", async () => {
    const uploadData = jest.fn().mockResolvedValue({});
    const getBlockBlobClient = jest.fn().mockReturnValue({ uploadData });
    const getContainerClient = jest.fn().mockReturnValue({ getBlockBlobClient });

    await uploadPetMedia(
      {
        blobName: "pets/pet-1/image.png",
        body: Buffer.from("png"),
        contentType: "image/png",
      },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () =>
          makeSecretClient({
            "azure-storage-connection-string": "UseDevelopmentStorage=true",
          }),
        blobServiceClientFactory: () => ({ getContainerClient }),
      }
    );

    expect(getContainerClient).toHaveBeenCalledWith("pet-media");
    expect(getBlockBlobClient).toHaveBeenCalledWith("pets/pet-1/image.png");
  });
});
