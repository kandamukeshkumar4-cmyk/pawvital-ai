import { complete, isNvidiaRoleConfigured, type ModelRole } from "./nvidia-models";
import { safeParseJson } from "./llm-output";

interface GenerateNvidiaTextOptions {
  role: ModelRole;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  contextLabel?: string;
}

export function isNvidiaGenerationConfigured(role: ModelRole): boolean {
  return isNvidiaRoleConfigured(role);
}

export async function generateNvidiaText({
  role,
  prompt,
  systemPrompt,
  maxTokens,
  temperature,
  contextLabel,
}: GenerateNvidiaTextOptions): Promise<string> {
  try {
    return await complete({
      role,
      prompt,
      systemPrompt,
      maxTokens,
      temperature,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${contextLabel || role} generation failed: ${reason}`);
  }
}

export async function generateNvidiaJson<T>(
  options: GenerateNvidiaTextOptions
): Promise<T> {
  const text = await generateNvidiaText(options);
  return safeParseJson<T>(text, options.contextLabel || `${options.role} JSON`);
}