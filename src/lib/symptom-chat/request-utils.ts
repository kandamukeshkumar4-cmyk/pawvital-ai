import { NextResponse } from "next/server";

export const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

export type BodyParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

export function jsonError(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status });
}

function decodeUtf8(chunks: Uint8Array[], totalBytes: number) {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes: number
): Promise<BodyParseResult<T>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: jsonError("Request body too large", 413, "PAYLOAD_TOO_LARGE"),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      response: jsonError("Request body is required", 400, "INVALID_JSON"),
    };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {}

        return {
          ok: false,
          response: jsonError(
            "Request body too large",
            413,
            "PAYLOAD_TOO_LARGE"
          ),
        };
      }

      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: jsonError("Malformed JSON body", 400, "INVALID_JSON"),
    };
  }

  const rawBody = decodeUtf8(chunks, totalBytes).trim();
  if (!rawBody) {
    return {
      ok: false,
      response: jsonError("Request body is required", 400, "INVALID_JSON"),
    };
  }

  try {
    return { ok: true, value: JSON.parse(rawBody) as T };
  } catch {
    return {
      ok: false,
      response: jsonError("Malformed JSON body", 400, "INVALID_JSON"),
    };
  }
}
