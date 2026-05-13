import { stripThinkingBlocks } from "./llm-output";
import {
  getFeatureModelRoute,
  isLikelyPlaceholderKey,
  type ModelFeature,
} from "./model-router";

const XAI_BASE_URL = "https://api.x.ai/v1";

interface GrokCompletionOptions {
  feature: Extract<ModelFeature, "grok_final_safety" | "grok_final_report">;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

interface GrokChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            text?: string;
            type?: string;
          }>;
    };
  }>;
}

type GrokChatMessage = NonNullable<
  NonNullable<GrokChatCompletionResponse["choices"]>[number]["message"]
>;

function getXaiRuntimeConfig(): { apiKey: string; baseURL: string } | null {
  const apiKey =
    process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim() || "";

  if (!apiKey || isLikelyPlaceholderKey(apiKey)) {
    return null;
  }

  return {
    apiKey,
    baseURL: (process.env.XAI_BASE_URL?.trim() || XAI_BASE_URL).replace(
      /\/+$/,
      ""
    ),
  };
}

function readMessageContent(
  message: GrokChatMessage | undefined
): string {
  if (!message?.content) {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .map((part) => (part.type === "text" || !part.type ? part.text ?? "" : ""))
    .join("");
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|timeout/i.test(error.message))
  );
}

export function isGrokConfigured(): boolean {
  return getXaiRuntimeConfig() !== null;
}

export async function completeWithGrok({
  feature,
  prompt,
  systemPrompt,
  maxTokens = 600,
  temperature = 0,
}: GrokCompletionOptions): Promise<string> {
  const runtime = getXaiRuntimeConfig();
  if (!runtime) {
    throw new Error("Grok provider not configured");
  }

  const route = getFeatureModelRoute(feature);
  if (!route || route.provider !== "grok") {
    throw new Error(`Grok route not configured for ${feature}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), route.timeoutMs);

  try {
    const response = await fetch(`${runtime.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: route.primaryModel,
        messages: [
          ...(systemPrompt
            ? [{ role: "system", content: systemPrompt }]
            : []),
          { role: "user", content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Grok provider error (${response.status}): ${body || response.statusText}`
      );
    }

    const payload = (await response.json()) as GrokChatCompletionResponse;
    const content = stripThinkingBlocks(
      readMessageContent(payload.choices?.[0]?.message).trim()
    );

    if (!content) {
      throw new Error("Grok provider returned an empty response");
    }

    return content;
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error("timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
