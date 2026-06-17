import { getBlobClient, type AzureClientOptions } from "./index";

export const AZURE_BLOB_CONTAINERS = {
  audio: "audio-corpus",
  petMedia: "pet-media",
  reports: "reports",
} as const;

export type AzureBlobKind = keyof typeof AZURE_BLOB_CONTAINERS;

type BlobBody = ArrayBuffer | Buffer | Uint8Array | string;

export type AzureBlockBlobUploadResult = {
  etag?: string;
  requestId?: string;
  versionId?: string;
};

export type AzureBlockBlobClientLike = {
  url?: string;
  uploadData(
    body: Buffer,
    options?: {
      blobHTTPHeaders?: {
        blobContentDisposition?: string;
        blobContentType?: string;
      };
      metadata?: Record<string, string>;
    }
  ): Promise<AzureBlockBlobUploadResult>;
};

export type UploadAzureBlobInput = {
  blobName: string;
  body: BlobBody;
  containerName?: string;
  contentDisposition?: string;
  contentType?: string;
  kind?: AzureBlobKind;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type UploadAzureBlobSuccess = {
  blobName: string;
  containerName: string;
  demo?: false;
  etag?: string;
  ok: true;
  requestId?: string;
  url?: string;
  versionId?: string;
};

export type UploadAzureBlobDemo = {
  blobName: string;
  containerName: string;
  demo: true;
  ok: true;
  url: string;
};

export type UploadAzureBlobSkipped = {
  ok: false;
  reason: "invalid_blob_name" | "invalid_container" | "upload_failed";
};

export type UploadAzureBlobResult =
  | UploadAzureBlobDemo
  | UploadAzureBlobSkipped
  | UploadAzureBlobSuccess;

export type UploadAzureBlobOptions =
  AzureClientOptions<AzureBlockBlobClientLike>;

type UploadNamedAzureBlobInput = Omit<
  UploadAzureBlobInput,
  "containerName" | "kind"
>;

const METADATA_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function resolveContainerName(input: UploadAzureBlobInput): string | null {
  const rawName =
    input.containerName ??
    (input.kind ? AZURE_BLOB_CONTAINERS[input.kind] : undefined);
  const normalized = rawName?.trim().toLowerCase();
  return normalized || null;
}

function isSafeBlobName(blobName: string): boolean {
  const normalized = blobName.trim();
  if (!normalized || normalized !== blobName) return false;
  if (normalized.length > 1024) return false;
  if (normalized.startsWith("/") || normalized.startsWith("\\")) return false;
  if (normalized.includes("\0")) return false;

  return normalized
    .split(/[\\/]+/)
    .every((segment) => segment && segment !== "." && segment !== "..");
}

function toBuffer(body: BlobBody): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(body);
}

function normalizeMetadata(
  metadata: UploadAzureBlobInput["metadata"]
): Record<string, string> | undefined {
  if (!metadata) return undefined;

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!METADATA_KEY_RE.test(key) || value === null || value === undefined) {
      continue;
    }
    const stringValue = String(value).trim();
    if (stringValue) {
      normalized[key] = stringValue;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildDemoBlobUrl(containerName: string, blobName: string): string {
  const encodedBlobName = blobName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/demo/azure-blobs/${encodeURIComponent(containerName)}/${encodedBlobName}`;
}

export async function uploadAzureBlob(
  input: UploadAzureBlobInput,
  options: UploadAzureBlobOptions = {}
): Promise<UploadAzureBlobResult> {
  const containerName = resolveContainerName(input);
  if (!containerName) {
    return { ok: false, reason: "invalid_container" };
  }

  if (!isSafeBlobName(input.blobName)) {
    return { ok: false, reason: "invalid_blob_name" };
  }

  const blobClient = await getBlobClient<AzureBlockBlobClientLike>(
    containerName,
    input.blobName,
    options
  );
  if (!blobClient) {
    return {
      blobName: input.blobName,
      containerName,
      demo: true,
      ok: true,
      url: buildDemoBlobUrl(containerName, input.blobName),
    };
  }

  try {
    const result = await blobClient.uploadData(toBuffer(input.body), {
      blobHTTPHeaders: {
        blobContentDisposition: input.contentDisposition,
        blobContentType: input.contentType,
      },
      metadata: normalizeMetadata(input.metadata),
    });

    return {
      blobName: input.blobName,
      containerName,
      etag: result.etag,
      ok: true,
      requestId: result.requestId,
      url: blobClient.url,
      versionId: result.versionId,
    };
  } catch {
    return { ok: false, reason: "upload_failed" };
  }
}

export function uploadPetMedia(
  input: UploadNamedAzureBlobInput,
  options: UploadAzureBlobOptions = {}
): Promise<UploadAzureBlobResult> {
  return uploadAzureBlob({ ...input, kind: "petMedia" }, options);
}

export function uploadReport(
  input: UploadNamedAzureBlobInput,
  options: UploadAzureBlobOptions = {}
): Promise<UploadAzureBlobResult> {
  return uploadAzureBlob({ ...input, kind: "reports" }, options);
}

export function uploadAudio(
  input: UploadNamedAzureBlobInput,
  options: UploadAzureBlobOptions = {}
): Promise<UploadAzureBlobResult> {
  return uploadAzureBlob({ ...input, kind: "audio" }, options);
}
