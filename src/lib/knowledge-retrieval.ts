import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PetProfile, TriageSession } from "./triage-engine";
import {
  buildReferenceImageSearchText,
  embedImageQueries,
  embedKnowledgeQueries,
  embeddingToVectorLiteral,
  isEmbeddingConfigured,
} from "./embedding-models";

export interface KnowledgeChunkMatch {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  chunkTitle: string;
  sourceUrl: string | null;
  citation: string | null;
  textContent: string;
  keywordTags: string[];
  score: number;
}

export interface ReferenceImageMatch {
  assetId: string;
  sourceId: string;
  sourceSlug: string;
  sourceTitle: string;
  datasetUrl: string;
  conditionLabel: string;
  localPath: string | null;
  assetUrl: string | null;
  caption: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

interface SearchKnowledgeChunkRpcRow {
  chunk_id: string;
  source_id: string;
  source_title: string;
  chunk_title: string;
  source_url: string | null;
  citation: string | null;
  text_content: string;
  keyword_tags: string[] | null;
  score: number;
}

interface FallbackKnowledgeChunkRow {
  id: string;
  source_id: string;
  title: string | null;
  text_content: string;
  citation: string | null;
  keyword_tags: string[] | null;
  source_url: string | null;
  knowledge_sources?: {
    title?: string | null;
    active?: boolean;
  } | null;
}

interface SemanticKnowledgeChunkRpcRow {
  chunk_id: string;
  source_id: string;
  source_title: string;
  chunk_title: string;
  source_url: string | null;
  citation: string | null;
  text_content: string;
  keyword_tags: string[] | null;
  similarity: number;
}

interface SearchReferenceImageRpcRow {
  asset_id: string;
  source_id: string;
  source_slug: string;
  source_title: string;
  dataset_url: string;
  condition_label: string;
  local_path: string | null;
  asset_url: string | null;
  caption: string | null;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

interface FallbackReferenceImageRow {
  id: string;
  source_id: string;
  condition_label: string;
  local_path: string | null;
  asset_url: string | null;
  caption: string | null;
  metadata: Record<string, unknown> | null;
  reference_image_sources?: {
    slug?: string | null;
    title?: string | null;
    dataset_url?: string | null;
    active?: boolean;
  } | null;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const isConfigured =
  supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://");

function getSupabase() {
  if (!isConfigured) return null;
  // Use service role key so RAG queries bypass RLS
  return createClient(supabaseUrl, serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
}

function normalizeTerm(term: string): string {
  return term.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function dedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawTerm of terms) {
    const term = normalizeTerm(rawTerm).toLowerCase();
    if (!term || term.length < 3) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    normalized.push(term);
  }
  return normalized;
}

export function isKnowledgeRetrievalConfigured(): boolean {
  return isConfigured;
}

export function buildKnowledgeSearchQuery(
  session: TriageSession,
  pet: PetProfile,
  topConditions: string[] = []
): string {
  const terms = dedupeTerms([
    pet.species || "dog",
    pet.breed || "",
    ...(pet.existing_conditions || []),
    ...session.known_symptoms,
    ...session.red_flags_triggered,
    ...(session.vision_symptoms || []),
    ...(session.roboflow_skin_labels || []),
    ...topConditions,
  ]);

  if (terms.length === 0) {
    return "dog wound skin infection dermatitis triage";
  }

  return terms.slice(0, 12).join(" ");
}

export function buildReferenceImageQuery(
  session: TriageSession,
  pet: PetProfile,
  topConditions: string[] = []
): string {
  const searchText = buildKnowledgeSearchQuery(session, pet, topConditions);
  return buildReferenceImageSearchText({
    searchText,
    conditionHints: topConditions,
    breed: pet.breed,
  });
}

function sanitizeSearchQuery(searchText: string): string {
  return searchText
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchKnowledgeChunks(
  searchText: string,
  limit = 4
): Promise<KnowledgeChunkMatch[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const safeQuery = sanitizeSearchQuery(searchText);
  if (!safeQuery) return [];

  try {
    const semanticMatches = await searchKnowledgeChunksSemantic(
      supabase,
      safeQuery,
      limit
    );
    const lexicalMatches = await searchKnowledgeChunksLexical(
      supabase,
      safeQuery,
      limit
    );

    return mergeKnowledgeMatches(semanticMatches, lexicalMatches, limit);
  } catch (error) {
    console.error("[Knowledge Retrieval] Search failed:", error);
    return [];
  }
}

async function searchKnowledgeChunksSemantic(
  supabase: SupabaseClient,
  safeQuery: string,
  limit: number
): Promise<KnowledgeChunkMatch[]> {
  if (!isEmbeddingConfigured()) return [];

  try {
    const [queryEmbedding] = await embedKnowledgeQueries([safeQuery]);
    if (!queryEmbedding?.length) return [];

    const { data, error } = await supabase.rpc(
      "match_knowledge_chunks_by_embedding_text",
      {
        query_embedding_text: embeddingToVectorLiteral(queryEmbedding),
        match_count: Math.max(1, limit),
      }
    );

    if (error || !data) return [];

    return (data as SemanticKnowledgeChunkRpcRow[]).map((row) => ({
      chunkId: row.chunk_id,
      sourceId: row.source_id,
      sourceTitle: row.source_title,
      chunkTitle: row.chunk_title,
      sourceUrl: row.source_url,
      citation: row.citation,
      textContent: row.text_content,
      keywordTags: row.keyword_tags || [],
      score: Number(row.similarity || 0),
    }));
  } catch (error) {
    console.error("[Knowledge Retrieval] Semantic search failed:", error);
    return [];
  }
}

async function searchKnowledgeChunksLexical(
  supabase: SupabaseClient,
  safeQuery: string,
  limit: number
): Promise<KnowledgeChunkMatch[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "search_knowledge_chunks",
    { search_text: safeQuery, match_count: Math.max(1, limit) }
  );

  if (!rpcError && rpcData && rpcData.length > 0) {
    return (rpcData as SearchKnowledgeChunkRpcRow[]).map((row) => ({
      chunkId: row.chunk_id,
      sourceId: row.source_id,
      sourceTitle: row.source_title,
      chunkTitle: row.chunk_title,
      sourceUrl: row.source_url,
      citation: row.citation,
      textContent: row.text_content,
      keywordTags: row.keyword_tags || [],
      score: Number(row.score || 0),
    }));
  }

  const fallbackTerms = safeQuery
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)
    .slice(0, 6);

  if (fallbackTerms.length === 0) return [];

  const orFilter = fallbackTerms
    .map((t) => `text_content.ilike.%${t}%`)
    .join(",");

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("knowledge_chunks")
    .select(
      "id, source_id, title, text_content, citation, keyword_tags, source_url, knowledge_sources!inner(title, active)"
    )
    .eq("knowledge_sources.active", true)
    .or(orFilter)
    .limit(Math.max(1, limit));

  if (fallbackError || !fallbackData) return [];

  return (fallbackData as FallbackKnowledgeChunkRow[]).map((row) => ({
    chunkId: row.id,
    sourceId: row.source_id,
    sourceTitle:
      row.knowledge_sources?.title || row.title || "Veterinary Reference",
    chunkTitle: row.title || "Veterinary Reference",
    sourceUrl: row.source_url || null,
    citation: row.citation || null,
    textContent: row.text_content,
    keywordTags: row.keyword_tags || [],
    score: 0.1,
  }));
}

function mergeKnowledgeMatches(
  semanticMatches: KnowledgeChunkMatch[],
  lexicalMatches: KnowledgeChunkMatch[],
  limit: number
): KnowledgeChunkMatch[] {
  const merged = new Map<string, KnowledgeChunkMatch>();

  for (const match of semanticMatches) {
    merged.set(match.chunkId, match);
  }

  for (const match of lexicalMatches) {
    if (!merged.has(match.chunkId)) {
      merged.set(match.chunkId, match);
    }
  }

  return [...merged.values()].slice(0, Math.max(1, limit));
}

export async function searchReferenceImages(
  searchText: string,
  limit = 4,
  conditionFilters: string[] = []
): Promise<ReferenceImageMatch[]> {
  const supabase = getSupabase();
  if (!supabase || !isEmbeddingConfigured()) return [];

  const safeQuery = sanitizeSearchQuery(searchText);
  if (!safeQuery) return [];

  try {
    const [queryEmbedding] = await embedImageQueries([safeQuery]);
    if (!queryEmbedding?.length) {
      return [];
    }

    const { data, error } = await supabase.rpc(
      "match_reference_image_assets_by_embedding_text",
      {
        query_embedding_text: embeddingToVectorLiteral(queryEmbedding),
        match_count: Math.max(1, limit),
        condition_filters:
          conditionFilters.length > 0 ? conditionFilters : null,
      }
    );

    if (!error && data && data.length > 0) {
      return (data as SearchReferenceImageRpcRow[]).map((row) => ({
        assetId: row.asset_id,
        sourceId: row.source_id,
        sourceSlug: row.source_slug,
        sourceTitle: row.source_title,
        datasetUrl: row.dataset_url,
        conditionLabel: row.condition_label,
        localPath: row.local_path,
        assetUrl: row.asset_url,
        caption: row.caption,
        metadata: row.metadata || {},
        similarity: Number(row.similarity || 0),
      }));
    }

    return await searchReferenceImagesFallback(
      supabase,
      safeQuery,
      limit,
      conditionFilters
    );
  } catch (error) {
    console.error("[Reference Image Retrieval] Search failed:", error);
    return [];
  }
}

async function searchReferenceImagesFallback(
  supabase: SupabaseClient,
  safeQuery: string,
  limit: number,
  conditionFilters: string[]
): Promise<ReferenceImageMatch[]> {
  const fallbackTerms = safeQuery
    .split(/\s+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 4)
    .slice(0, 6);

  const labelTerms = dedupeTerms([...fallbackTerms, ...conditionFilters]).map(
    (term) => term.replace(/\s+/g, "_")
  );

  let query = supabase
    .from("reference_image_assets")
    .select(
      "id, source_id, condition_label, local_path, asset_url, caption, metadata, reference_image_sources!inner(slug, title, dataset_url, active)"
    )
    .eq("reference_image_sources.active", true)
    .limit(Math.max(1, limit));

  if (labelTerms.length > 0) {
    query = query.in("condition_label", labelTerms);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as FallbackReferenceImageRow[]).map((row) => ({
    assetId: row.id,
    sourceId: row.source_id,
    sourceSlug: row.reference_image_sources?.slug || "reference-images",
    sourceTitle:
      row.reference_image_sources?.title || "Reference Image Dataset",
    datasetUrl: row.reference_image_sources?.dataset_url || "",
    conditionLabel: row.condition_label,
    localPath: row.local_path,
    assetUrl: row.asset_url,
    caption: row.caption,
    metadata: row.metadata || {},
    similarity: 0.1,
  }));
}

export function formatKnowledgeContext(chunks: KnowledgeChunkMatch[]): string {
  if (chunks.length === 0) return "";

  return chunks
    .map((chunk, index) => {
      const excerpt =
        chunk.textContent.length > 700
          ? `${chunk.textContent.slice(0, 700).trim()}...`
          : chunk.textContent;
      const tags =
        chunk.keywordTags.length > 0
          ? `Tags: ${chunk.keywordTags.join(", ")}`
          : "Tags: none";
      const citation = chunk.citation || chunk.sourceUrl || "No source URL";
      return `${index + 1}. ${chunk.sourceTitle}\nSource: ${citation}\n${tags}\nExcerpt: ${excerpt}`;
    })
    .join("\n\n");
}

export function formatReferenceImageContext(
  matches: ReferenceImageMatch[]
): string {
  if (matches.length === 0) return "";

  return matches
    .map((match, index) => {
      const relativePath =
        typeof match.metadata.relative_path === "string"
          ? match.metadata.relative_path
          : match.localPath || "local-only";
      const similarity = Number.isFinite(match.similarity)
        ? `${(match.similarity * 100).toFixed(1)}%`
        : "n/a";

      return `${index + 1}. ${match.conditionLabel} (${similarity} visual similarity)\nSource: ${match.sourceTitle}\nPath: ${relativePath}\nCaption: ${match.caption || "No caption"}`;
    })
    .join("\n\n");
}
