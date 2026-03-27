import OpenAI from "openai";

const MINIMAX_BASE_URL =
  process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const MINIMAX_API_KEY =
  process.env.MINIMAX_API_KEY ||
  process.env.MINIMAX_CHAT_API_KEY ||
  process.env.MINIMAX_CODING_API_KEY ||
  "";

const MEMORY_MODEL_CANDIDATES = [
  process.env.MINIMAX_MEMORY_MODEL,
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
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
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
          max_completion_tokens: 400,
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

      return { summary, model };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError =
        error instanceof Error ? error : new Error("MiniMax compression failed");
    }
  }

  throw lastError || new Error("MiniMax compression failed");
}
