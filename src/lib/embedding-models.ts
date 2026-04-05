import { isLikelyPlaceholderKey } from "./nvidia-models";

const NVIDIA_EMBEDDINGS_URL = "https://integrate.api.nvidia.com/v1/embeddings";

export const KNOWLEDGE_EMBEDDING_MODEL = "nvidia/llama-3.2-nv-embedqa-1b-v2";
export const IMAGE_EMBEDDING_MODEL = "nvidia/nvclip";

function getEmbeddingApiKey(): string {
  const candidates = [
    process.env.NVIDIA_API_KEY,
    process.env.NVIDIA_QWEN_API_KEY,
    process.env.NVIDIA_DEEPSEEK_API_KEY,
    process.env.NVIDIA_KIMI_API_KEY,
    process.env.NVIDIA_GLM_API_KEY,
  ];

  for (const candidate of candidates) {
    const key = candidate?.trim();
    if (key && !isLikelyPlaceholderKey(key)) {
      return key;
    }
  }

  return "";
}

export function isEmbeddingConfigured(): boolean {
  const apiKey = getEmbeddingApiKey();
  return Boolean(apiKey);
}

interface EmbeddingResponseRow {
  embedding: number[];
  index: number;
}

interface EmbeddingResponseBody {
  data?: EmbeddingResponseRow[];
  error?: string;
}

async function createEmbeddings(
  payload: Record<string, unknown>
): Promise<number[][]> {
  const apiKey = getEmbeddingApiKey();
  if (!apiKey) {
    throw new Error("NVIDIA embedding API key is not configured");
  }

  const response = await fetch(NVIDIA_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  const parsed = responseText
    ? (JSON.parse(responseText) as EmbeddingResponseBody)
    : {};

  if (!response.ok) {
    throw new Error(
      parsed.error ||
        `Embedding request failed with status ${response.status}`
    );
  }

  const rows = parsed.data || [];
  return rows
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
}

export async function embedKnowledgeQueries(
  inputs: string[]
): Promise<number[][]> {
  return createEmbeddings({
    model: KNOWLEDGE_EMBEDDING_MODEL,
    input: inputs,
    input_type: "query",
  });
}

export async function embedKnowledgePassages(
  inputs: string[]
): Promise<number[][]> {
  return createEmbeddings({
    model: KNOWLEDGE_EMBEDDING_MODEL,
    input: inputs,
    input_type: "passage",
  });
}

export async function embedImageQueries(
  inputs: string[]
): Promise<number[][]> {
  return createEmbeddings({
    model: IMAGE_EMBEDDING_MODEL,
    input: inputs,
  });
}

export async function embedImages(
  inputs: string[]
): Promise<number[][]> {
  return createEmbeddings({
    model: IMAGE_EMBEDDING_MODEL,
    input: inputs,
  });
}

export function embeddingToVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export function buildKnowledgePassageText(input: {
  title?: string | null;
  textContent: string;
  citation?: string | null;
  keywordTags?: string[] | null;
}): string {
  const parts = [
    input.title?.trim() || "",
    input.keywordTags?.length ? `Tags: ${input.keywordTags.join(", ")}` : "",
    input.citation ? `Source: ${input.citation}` : "",
    input.textContent.trim(),
  ].filter(Boolean);

  return parts.join("\n");
}

export function buildReferenceImageSearchText(input: {
  searchText: string;
  conditionHints?: string[];
  breed?: string;
}): string {
  const parts = [input.searchText.trim()];

  if (input.conditionHints?.length) {
    parts.push(`Likely conditions: ${input.conditionHints.join(", ")}`);
  }

  if (input.breed?.trim()) {
    parts.push(`Dog breed: ${input.breed.trim()}`);
  }

  return parts.filter(Boolean).join("\n");
}
