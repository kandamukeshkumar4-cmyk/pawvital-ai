import OpenAI from "openai";

const MINIMAX_BASE_URL = (
  process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1"
).trim();
const MINIMAX_API_KEY = (
  process.env.MINIMAX_API_KEY ||
  process.env.MINIMAX_CHAT_API_KEY ||
  process.env.MINIMAX_CODING_API_KEY ||
  ""
).trim();

// Timeout for MiniMax API calls (45 seconds to handle network latency)
// Can be overridden via MINIMAX_TIMEOUT_MS environment variable
const MINIMAX_TIMEOUT_MS = Number(process.env.MINIMAX_TIMEOUT_MS) || 45000;
const MINIMAX_MEMORY_MAX_TOKENS =
  Number(process.env.MINIMAX_MEMORY_MAX_TOKENS) || 800;

const MEMORY_MODEL_CANDIDATES = [
  process.env.MINIMAX_MEMORY_MODEL?.trim(),
  "MiniMax-M2.7",
  "MiniMax-M2.5-highspeed",
  "MiniMax-M2.5",
].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

let minimaxClient: OpenAI | null | undefined;

function getMiniMaxClient(): OpenAI | null {
  if (minimaxClient !== undefined) {
    return minimaxClient;
  }

  minimaxClient = MINIMAX_API_KEY
    ? new OpenAI({
        baseURL: MINIMAX_BASE_URL,
        apiKey: MINIMAX_API_KEY,
      })
    : null;

  return minimaxClient;
}

export function isMiniMaxConfigured(): boolean {
  return Boolean(MINIMAX_API_KEY);
}

function stripThinkingArtifacts(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;

  if (cause instanceof DOMException && cause.name === "AbortError") {
    return true;
  }

  if (cause instanceof Error && cause.name === "AbortError") {
    return true;
  }

  return false;
}

export async function compressCaseMemoryWithMiniMax(prompt: string): Promise<{
  summary: string;
  model: string;
}> {
  const client = getMiniMaxClient();
  if (!client) {
    throw new Error("MiniMax is not configured");
  }

  let lastError: Error | null = null;

  for (const model of MEMORY_MODEL_CANDIDATES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MINIMAX_TIMEOUT_MS);

    try {
      console.log(`[MiniMax] Attempting compression with model: ${model}`);
      const response = await client.chat.completions.create(
        {
          model,
          messages: [
            {
              role: "system",
              content:
                "You compress veterinary triage conversations into stable, factual case memory. Return only the requested text.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          top_p: 0.9,
          max_completion_tokens: MINIMAX_MEMORY_MAX_TOKENS,
        },
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const summary = stripThinkingArtifacts(
        response.choices[0]?.message?.content || ""
      );
      if (!summary) {
        throw new Error(`MiniMax returned empty summary for ${model}`);
      }

      console.log(`[MiniMax] Successfully compressed with model: ${model}`);
      return { summary, model };
    } catch (error) {
      clearTimeout(timeoutId);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAbortError = isAbortLikeError(error);
      console.error(`[MiniMax] Error with ${model}: ${errorMessage}${isAbortError ? " (timeout/aborted)" : ""}`);
      lastError =
        error instanceof Error ? error : new Error("MiniMax compression failed");
    }
  }

  throw lastError || new Error("MiniMax compression failed");
}
