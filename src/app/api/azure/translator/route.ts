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
const UNSAFE_CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

type TranslatorRequestBody = {
  sourceLanguage?: unknown;
  targetLanguage?: unknown;
  text?: unknown;
  texts?: unknown;
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

function normalizeTexts(body: TranslatorRequestBody): string[] | null {
  const rawTexts = Array.isArray(body.texts)
    ? body.texts
    : typeof body.text === "string"
      ? [body.text]
      : null;
  if (!rawTexts) {
    return null;
  }

  const texts = rawTexts
    .map((text) => (typeof text === "string" ? text.trim() : ""))
    .filter(Boolean);
  if (
    texts.length === 0 ||
    texts.length > MAX_TRANSLATOR_ITEMS ||
    texts.some(
      (text) =>
        text.length > MAX_TRANSLATOR_TEXT_CHARS ||
        UNSAFE_CONTROL_CHAR_PATTERN.test(text),
    )
  ) {
    return null;
  }

  return texts;
}

function normalizeLanguage(value: unknown): string | null {
  const language = typeof value === "string" ? value.trim() : "";
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(language)
    ? language
    : null;
}

function hasLanguageValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Translation is unavailable in demo mode",
  });
  if ("response" in auth) {
    return auth.response;
  }

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

  let body: TranslatorRequestBody;
  try {
    body = (await request.json()) as TranslatorRequestBody;
  } catch {
    return jsonNoStore(
      { enabled: false, reason: "invalid_request" },
      400,
    );
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
    return jsonNoStore(
      { enabled: false, reason: "invalid_request" },
      400,
    );
  }

  const result = await translateTexts({
    sourceLanguage,
    targetLanguage,
    texts,
  });

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
