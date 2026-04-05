export function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

export function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

export function extractFirstJsonObject(text: string): string | null {
  const normalized = stripMarkdownCodeFences(stripThinkingBlocks(text));
  const start = normalized.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return normalized.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function safeParseJson<T>(text: string, contextLabel: string): T {
  const normalized = stripMarkdownCodeFences(stripThinkingBlocks(text));
  const candidate = extractFirstJsonObject(normalized) || normalized;

  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`${contextLabel} returned invalid JSON: ${reason}`);
  }
}

