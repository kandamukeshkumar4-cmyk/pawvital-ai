import { NextResponse } from "next/server";
import { translateTexts } from "@/lib/azure/translator";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const MAX_TRANSLATOR_ITEMS = 25;
const MAX_TRANSLATOR_TEXT_CHARS = 5_000;
const MAX_TRANSLATOR_BATCH_CHARS = 25_000;
const MAX_TRANSLATOR_REQUEST_CHARS = 150_000;
const ALLOWED_TRANSLATOR_REQUEST_KEYS = new Set([
  "sourceLanguage",
  "targetLanguage",
  "text",
  "texts",
]);
const UNSAFE_TEXT_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069<>]/;

type TranslatorRequestBody = {
  sourceLanguage?: unknown;
  targetLanguage?: unknown;
  text?: unknown;
  texts?: unknown;
};

type ValidatedTranslatorRequest = {
  sourceLanguage: string | null;
  targetLanguage: string;
  texts: string[];
};

function jsonNoStore(body: unknown, status = 200, headers = {}) {
  return NextResponse.json(body, {
    headers: {
      ...NO_STORE_HEADERS,
      ...headers,
    },
    status,
  });
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json");
}

function isRecord(value: unknown): value is TranslatorRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyAllowedRequestKeys(value: TranslatorRequestBody): boolean {
  return Object.keys(value).every((key) =>
    ALLOWED_TRANSLATOR_REQUEST_KEYS.has(key),
  );
}

async function readTranslatorRequestBody(
  request: Request,
): Promise<TranslatorRequestBody | null> {
  if (!hasJsonContentType(request)) {
    return null;
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return null;
  }

  if (!rawBody || rawBody.length > MAX_TRANSLATOR_REQUEST_CHARS) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeTranslatorText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().normalize("NFC");
  if (
    text.length === 0 ||
    text.length > MAX_TRANSLATOR_TEXT_CHARS ||
    UNSAFE_TEXT_PATTERN.test(text)
  ) {
    return null;
  }

  try {
    encodeURIComponent(text);
  } catch {
    return null;
  }

  return text;
}

function normalizeTexts(body: TranslatorRequestBody): string[] | null {
  const hasText = typeof body.text !== "undefined";
  const hasTexts = typeof body.texts !== "undefined";
  if (hasText === hasTexts) {
    return null;
  }

  const rawTexts = Array.isArray(body.texts)
    ? body.texts
    : hasText
      ? [body.text]
      : null;
  if (
    !rawTexts ||
    rawTexts.length === 0 ||
    rawTexts.length > MAX_TRANSLATOR_ITEMS
  ) {
    return null;
  }

  const texts = rawTexts.map(sanitizeTranslatorText);
  if (!texts.every((text): text is string => text !== null)) {
    return null;
  }

  const batchChars = texts.reduce((total, text) => total + text.length, 0);
  return batchChars <= MAX_TRANSLATOR_BATCH_CHARS ? texts : null;
}

function normalizeLanguage(value: unknown): string | null {
  const language = typeof value === "string" ? value.trim() : "";
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(language)
    ? language.toLowerCase()
    : null;
}

function hasLanguageValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validateTranslatorRequest(
  body: TranslatorRequestBody,
): ValidatedTranslatorRequest | null {
  if (
    !hasOnlyAllowedRequestKeys(body) ||
    (typeof body.sourceLanguage !== "undefined" &&
      !hasLanguageValue(body.sourceLanguage))
  ) {
    return null;
  }

  const targetLanguage = normalizeLanguage(body.targetLanguage);
  const sourceLanguage = hasLanguageValue(body.sourceLanguage)
    ? normalizeLanguage(body.sourceLanguage)
    : null;
  const texts = normalizeTexts(body);

  if (
    !targetLanguage ||
    (hasLanguageValue(body.sourceLanguage) && !sourceLanguage) ||
    !texts
  ) {
    return null;
  }

  return {
    sourceLanguage,
    targetLanguage,
    texts,
  };
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Translation is unavailable in demo mode",
  });
  if ("response" in auth) {
    return auth.response;
  }

  // Charge authenticated callers before parsing payloads or touching Azure.
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request, auth.user.id),
  );
  if (!rateLimitResult.success) {
    return jsonNoStore(
      { error: "Too many requests. Please slow down." },
      429,
      {
        "Retry-After": String(
          Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
        ),
      },
    );
  }

  const body = await readTranslatorRequestBody(request);
  if (!body) {
    return jsonNoStore(
      { enabled: false, reason: "invalid_request" },
      400,
    );
  }

  const validated = validateTranslatorRequest(body);
  if (!validated) {
    return jsonNoStore(
      { enabled: false, reason: "invalid_request" },
      400,
    );
  }

  let result;
  try {
    result = await translateTexts({
      sourceLanguage: validated.sourceLanguage,
      targetLanguage: validated.targetLanguage,
      texts: validated.texts,
    });
  } catch {
    return jsonNoStore(
      { enabled: false, reason: "translator_unavailable" },
      503,
    );
  }

  if (!result.enabled && result.reason === "feature_disabled") {
    return jsonNoStore({ enabled: false, reason: "feature_disabled" });
  }

  if (!result.enabled) {
    return jsonNoStore(
      { enabled: false, reason: "translator_unavailable" },
      503,
    );
  }

  return jsonNoStore({
    detectedLanguage: result.detectedLanguage,
    enabled: true,
    sourceLanguage: result.sourceLanguage,
    targetLanguage: result.targetLanguage,
    translated: result.translated,
    translations: result.translations,
  });
}
