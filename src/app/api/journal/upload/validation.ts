const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_IEND = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const WEBP_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X"]);
const GENERIC_TYPES = new Set(["", "application/octet-stream"]);

export const MAX_JOURNAL_UPLOAD_BYTES = 5 * 1024 * 1024;

export const JOURNAL_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type JournalImageType = (typeof JOURNAL_IMAGE_TYPES)[number];
type NormalizedDeclaredType = JournalImageType | "generic" | null;

const SUPPORTED_TYPES = new Set<JournalImageType>(JOURNAL_IMAGE_TYPES);

type UploadValidationResult =
  | {
      ok: true;
      buffer: Buffer;
      detectedType: JournalImageType;
      extension: "jpg" | "png" | "webp" | "gif";
    }
  | {
      ok: false;
      reason:
        | "file-too-large"
        | "unsupported-file-type"
        | "declared-type-mismatch"
        | "invalid-image-content";
    };

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
}

function isPng(buffer: Buffer): boolean {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }

  return (
    buffer.readUInt32BE(8) === 13 &&
    buffer.subarray(12, 16).toString("ascii") === "IHDR" &&
    buffer.subarray(buffer.length - 12).equals(PNG_IEND)
  );
}

function isWebp(buffer: Buffer): boolean {
  if (
    buffer.length < 20 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return false;
  }

  const riffSize = buffer.readUInt32LE(4);
  const chunkType = buffer.subarray(12, 16).toString("ascii");
  return riffSize + 8 === buffer.length && WEBP_CHUNKS.has(chunkType);
}

function isGif(buffer: Buffer): boolean {
  if (buffer.length < 14) {
    return false;
  }

  const header = buffer.subarray(0, 6).toString("ascii");
  return (
    (header === "GIF87a" || header === "GIF89a") &&
    buffer[buffer.length - 1] === 0x3b
  );
}

export function detectJournalImageType(buffer: Buffer): JournalImageType | null {
  if (isJpeg(buffer)) return "image/jpeg";
  if (isPng(buffer)) return "image/png";
  if (isWebp(buffer)) return "image/webp";
  if (isGif(buffer)) return "image/gif";
  return null;
}

function normalizeDeclaredType(type: string | null | undefined): NormalizedDeclaredType {
  const normalized = (type ?? "").trim().toLowerCase();
  if (GENERIC_TYPES.has(normalized)) {
    return "generic";
  }

  return SUPPORTED_TYPES.has(normalized as JournalImageType)
    ? (normalized as JournalImageType)
    : null;
}

function extensionForImageType(type: JournalImageType): "jpg" | "png" | "webp" | "gif" {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
  }
}

export async function validateJournalUploadFile(
  file: File
): Promise<UploadValidationResult> {
  if (file.size > MAX_JOURNAL_UPLOAD_BYTES) {
    return { ok: false, reason: "file-too-large" };
  }

  const declaredType = normalizeDeclaredType(file.type);
  if (declaredType === null) {
    return { ok: false, reason: "unsupported-file-type" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedType = detectJournalImageType(buffer);

  if (!detectedType) {
    return { ok: false, reason: "invalid-image-content" };
  }

  if (declaredType !== "generic" && declaredType !== detectedType) {
    return { ok: false, reason: "declared-type-mismatch" };
  }

  return {
    ok: true,
    buffer,
    detectedType,
    extension: extensionForImageType(detectedType),
  };
}
