import { randomUUID } from "node:crypto";
import {
  getTranslatorClient,
  type AzureClientOptions,
  type AzureRegionalKeyEndpointClient,
} from "@/lib/azure";
import { getFlag, type AzureFeatureFlagOptions } from "@/lib/azure/app-config";
import { trackEvent, type TrackOptions } from "@/lib/azure/telemetry";

export const AZURE_TRANSLATOR_FEATURE_FLAG = "azure.translator.enabled";

const TRANSLATOR_API_VERSION = "3.0";
const MAX_TRANSLATOR_ITEMS = 25;
const MAX_TRANSLATOR_TEXT_CHARS = 5_000;
const UNSAFE_TRANSLATOR_TEXT_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069<>]/;

type MaybePromise<T> = T | Promise<T>;

export type AzureTranslatorFetchResponse = Pick<
  Response,
  "json" | "ok" | "status"
>;

export type AzureTranslatorFetch = (
  input: string | URL,
  init: RequestInit,
) => MaybePromise<AzureTranslatorFetchResponse>;

export type TranslateTextInput = {
  sourceLanguage?: string | null;
  targetLanguage: string;
  texts: string[];
};

export type TranslateTextResult =
  | {
      enabled: false;
      reason:
        | "feature_disabled"
        | "invalid_request"
        | "not_configured"
        | "translator_unavailable";
    }
  | {
      detectedLanguage: string | null;
      enabled: true;
      sourceLanguage: string | null;
      targetLanguage: string;
      translated: boolean;
      translations: string[];
    };

export type TranslateTextOptions = AzureClientOptions &
  AzureFeatureFlagOptions &
  TrackOptions & {
    fetchTranslator?: AzureTranslatorFetch;
  };

type TranslatorResponsePayload = Array<{
  detectedLanguage?: {
    language?: unknown;
    score?: unknown;
  };
  translations?: Array<{
    text?: unknown;
    to?: unknown;
  }>;
}>;

type TranslatorErrorCode = "not_configured" | "translator_unavailable";

function defaultFetchTranslator(
  input: string | URL,
  init: RequestInit,
): Promise<AzureTranslatorFetchResponse> {
  return fetch(input, init);
}

function normalizeLanguage(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(normalized)
    ? normalized
    : null;
}

export function normalizeTranslatorPlainText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().normalize("NFC");
  if (
    text.length === 0 ||
    text.length > MAX_TRANSLATOR_TEXT_CHARS ||
    UNSAFE_TRANSLATOR_TEXT_PATTERN.test(text)
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

function normalizeTexts(texts: string[]): string[] | null {
  if (!Array.isArray(texts) || texts.length === 0) {
    return null;
  }

  const normalized = texts.map(normalizeTranslatorPlainText);
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TRANSLATOR_ITEMS ||
    !normalized.every((text): text is string => text !== null)
  ) {
    return null;
  }

  return normalized;
}

function joinAzurePath(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

function buildTranslateUrl(
  client: AzureRegionalKeyEndpointClient,
  input: TranslateTextInput,
): URL | null {
  const targetLanguage = normalizeLanguage(input.targetLanguage);
  if (!targetLanguage) {
    return null;
  }

  let path = "/translate";
  try {
    const endpoint = new URL(client.endpoint);
    if (
      endpoint.hostname.endsWith(".cognitiveservices.azure.com") &&
      !endpoint.pathname.includes("/translator/text/v3.0")
    ) {
      path = "/translator/text/v3.0/translate";
    } else if (endpoint.pathname.includes("/translator/text/v3.0")) {
      path = endpoint.pathname.endsWith("/translate") ? "" : "/translate";
    }
  } catch {
    return null;
  }

  const url = new URL(joinAzurePath(client.endpoint, path));
  url.searchParams.set("api-version", TRANSLATOR_API_VERSION);
  url.searchParams.set("to", targetLanguage);

  const sourceLanguage = normalizeLanguage(input.sourceLanguage);
  if (sourceLanguage) {
    url.searchParams.set("from", sourceLanguage);
  }

  return url;
}

function buildHeaders(client: AzureRegionalKeyEndpointClient) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": client.key,
    "X-ClientTraceId": randomUUID(),
  };

  if (client.region && client.region.toLowerCase() !== "global") {
    headers["Ocp-Apim-Subscription-Region"] = client.region;
  }

  return headers;
}

function parseTranslations(
  payload: TranslatorResponsePayload,
): Pick<
  Extract<TranslateTextResult, { enabled: true }>,
  "detectedLanguage" | "translations"
> | null {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const translations = payload.map((entry) => {
    const text = entry.translations?.[0]?.text;
    return normalizeTranslatorPlainText(text);
  });
  if (!translations.every((text): text is string => text !== null)) {
    return null;
  }

  const detectedLanguage = payload
    .map((entry) => entry.detectedLanguage?.language)
    .find((language): language is string => typeof language === "string");

  return {
    detectedLanguage: detectedLanguage ?? null,
    translations,
  };
}

async function trackTranslatorOutcome(
  input: {
    characterCount?: number;
    errorCode?: TranslatorErrorCode;
    statusCode: number;
  },
  options: TranslateTextOptions,
) {
  await trackEvent(
    {
      measurements:
        typeof input.characterCount === "number"
          ? { characterCount: input.characterCount }
          : undefined,
      name: "azure.service.called",
      properties: {
        azureService: "translator",
        demoMode: false,
        errorCode: input.errorCode,
        statusCode: input.statusCode,
      },
    },
    options,
  );
}

export async function translateTexts(
  input: TranslateTextInput,
  options: TranslateTextOptions = {},
): Promise<TranslateTextResult> {
  const targetLanguage = normalizeLanguage(input.targetLanguage);
  const sourceLanguage = normalizeLanguage(input.sourceLanguage);
  const texts = normalizeTexts(input.texts);
  if (!targetLanguage || !texts) {
    return { enabled: false, reason: "invalid_request" };
  }

  const enabled = await getFlag(AZURE_TRANSLATOR_FEATURE_FLAG, options);
  if (!enabled) {
    return { enabled: false, reason: "feature_disabled" };
  }

  const client = await getTranslatorClient(options);
  if (!client) {
    await trackTranslatorOutcome(
      { errorCode: "not_configured", statusCode: 503 },
      options,
    );
    return { enabled: false, reason: "not_configured" };
  }

  const url = buildTranslateUrl(client, {
    sourceLanguage,
    targetLanguage,
    texts,
  });
  if (!url) {
    return { enabled: false, reason: "invalid_request" };
  }

  try {
    const fetchTranslator = options.fetchTranslator ?? defaultFetchTranslator;
    const response = await fetchTranslator(url, {
      body: JSON.stringify(texts.map((text) => ({ Text: text }))),
      headers: buildHeaders(client),
      method: "POST",
    });

    if (!response.ok) {
      await trackTranslatorOutcome(
        { errorCode: "translator_unavailable", statusCode: response.status },
        options,
      );
      return { enabled: false, reason: "translator_unavailable" };
    }

    const parsed = parseTranslations(
      (await response.json()) as TranslatorResponsePayload,
    );
    if (!parsed) {
      await trackTranslatorOutcome(
        { errorCode: "translator_unavailable", statusCode: 502 },
        options,
      );
      return { enabled: false, reason: "translator_unavailable" };
    }

    await trackTranslatorOutcome(
      {
        characterCount: texts.join("").length,
        statusCode: 200,
      },
      options,
    );

    return {
      detectedLanguage: parsed.detectedLanguage,
      enabled: true,
      sourceLanguage,
      targetLanguage,
      translated:
        Boolean(parsed.detectedLanguage && parsed.detectedLanguage !== targetLanguage) ||
        parsed.translations.some((text, index) => text !== texts[index]),
      translations: parsed.translations,
    };
  } catch {
    await trackTranslatorOutcome(
      { errorCode: "translator_unavailable", statusCode: 503 },
      options,
    );
    return { enabled: false, reason: "translator_unavailable" };
  }
}
