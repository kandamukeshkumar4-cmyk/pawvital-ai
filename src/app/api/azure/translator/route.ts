import { NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeTranslatorPlainText,
  translateTexts,
} from "@/lib/azure/translator";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import {
  checkRateLimit,
  getRateLimitId,
  translatorApiLimiter,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const MAX_TRANSLATOR_ITEMS = 25;
const MAX_TRANSLATOR_BATCH_CHARS = 25_000;
const MAX_TRANSLATOR_REQUEST_CHARS = 32_000;
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i;

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

const languageSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(LANGUAGE_TAG_PATTERN)
  .transform((language) => language.toLowerCase());

const translatorRequestSchema = z
  .object({
    sourceLanguage: languageSchema.optional(),
    targetLanguage: languageSchema,
    text: z.string().optional(),
    texts: z.array(z.string()).max(MAX_TRANSLATOR_ITEMS).optional(),
  })
  .strict()
  .superRefine((requestBody, context) => {
    const hasText = typeof requestBody.text !== "undefined";
    const hasTexts = typeof requestBody.texts !== "undefined";
    if (hasText === hasTexts) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of text or texts.",
        path: ["text"],
      });
    }
  });

type ParsedTranslatorRequestBody = z.infer<typeof translatorRequestSchema>;

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
  // Security boundary: only plain owner-visible text reaches Azure Translator.
  return normalizeTranslatorPlainText(value);
}

function normalizeTexts(body: ParsedTranslatorRequestBody): string[] | null {
  const rawTexts =
    typeof body.text !== "undefined" ? [body.text] : (body.texts ?? []);
  if (rawTexts.length === 0) {
    return null;
  }

  const texts = rawTexts.map(sanitizeTranslatorText);
  if (!texts.every((text): text is string => text !== null)) {
    return null;
  }

  const batchChars = texts.reduce((total, text) => total + text.length, 0);
  return batchChars <= MAX_TRANSLATOR_BATCH_CHARS ? texts : null;
}

function validateTranslatorRequest(
  body: TranslatorRequestBody,
): ValidatedTranslatorRequest | null {
  const parsed = translatorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }

  const texts = normalizeTexts(parsed.data);
  if (!texts) {
    return null;
  }

  return {
    sourceLanguage: parsed.data.sourceLanguage ?? null,
    targetLanguage: parsed.data.targetLanguage,
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

  // Dedicated 20/min/user limiter runs before parsing payloads or touching Azure.
  const rateLimitResult = await checkRateLimit(
    translatorApiLimiter,
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
