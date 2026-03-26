-- PawVital AI retrieval schema
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('document', 'image_dataset')),
  source_type TEXT NOT NULL CHECK (source_type IN ('html', 'pdf', 'dataset')),
  title TEXT NOT NULL,
  canonical_url TEXT,
  license TEXT,
  trust_level INTEGER NOT NULL DEFAULT 50 CHECK (trust_level >= 0 AND trust_level <= 100),
  species_scope TEXT[] NOT NULL DEFAULT ARRAY['dog']::TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  title TEXT,
  text_content TEXT NOT NULL,
  citation TEXT,
  source_url TEXT,
  keyword_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(text_content, ''))
  ) STORED,
  embedding VECTOR,
  embedding_model TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS public.reference_image_sources (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  dataset_url TEXT NOT NULL,
  license TEXT,
  condition_labels TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reference_image_assets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.reference_image_sources(id) ON DELETE CASCADE,
  condition_label TEXT NOT NULL,
  asset_url TEXT,
  local_path TEXT,
  caption TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  embedding VECTOR,
  embedding_model TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.knowledge_chunks
  DROP CONSTRAINT IF EXISTS knowledge_chunks_embedding_status_check;

ALTER TABLE public.knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_embedding_status_check
  CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed'));

ALTER TABLE public.reference_image_assets
  DROP CONSTRAINT IF EXISTS reference_image_assets_embedding_status_check;

ALTER TABLE public.reference_image_assets
  ADD CONSTRAINT reference_image_assets_embedding_status_check
  CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_kind_active
  ON public.knowledge_sources(kind, active);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_id
  ON public.knowledge_chunks(source_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector
  ON public.knowledge_chunks USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_status
  ON public.knowledge_chunks(embedding_status);

CREATE INDEX IF NOT EXISTS idx_reference_image_sources_active
  ON public.reference_image_sources(active);

CREATE INDEX IF NOT EXISTS idx_reference_image_assets_source_condition
  ON public.reference_image_assets(source_id, condition_label);

CREATE INDEX IF NOT EXISTS idx_reference_image_assets_embedding_status
  ON public.reference_image_assets(embedding_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reference_image_assets_source_local_path
  ON public.reference_image_assets(source_id, local_path)
  WHERE local_path IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reference_image_assets_source_asset_url
  ON public.reference_image_assets(source_id, asset_url)
  WHERE asset_url IS NOT NULL;

-- Vector indexes intentionally come later, after the MedImageInsights
-- embedding dimension is locked for production.

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_image_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_image_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read knowledge sources" ON public.knowledge_sources;
CREATE POLICY "Public read knowledge sources"
  ON public.knowledge_sources
  FOR SELECT
  USING (active = TRUE);

DROP POLICY IF EXISTS "Public read knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Public read knowledge chunks"
  ON public.knowledge_chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.knowledge_sources ks
      WHERE ks.id = source_id
        AND ks.active = TRUE
    )
  );

DROP POLICY IF EXISTS "Public read reference image sources" ON public.reference_image_sources;
CREATE POLICY "Public read reference image sources"
  ON public.reference_image_sources
  FOR SELECT
  USING (active = TRUE);

DROP POLICY IF EXISTS "Public read reference image assets" ON public.reference_image_assets;
CREATE POLICY "Public read reference image assets"
  ON public.reference_image_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.reference_image_sources ris
      WHERE ris.id = source_id
        AND ris.active = TRUE
    )
  );

CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  search_text TEXT,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  source_id UUID,
  source_title TEXT,
  chunk_title TEXT,
  source_url TEXT,
  citation TEXT,
  text_content TEXT,
  keyword_tags TEXT[],
  score REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    kc.id AS chunk_id,
    ks.id AS source_id,
    ks.title AS source_title,
    COALESCE(kc.title, ks.title) AS chunk_title,
    COALESCE(kc.source_url, ks.canonical_url) AS source_url,
    kc.citation,
    kc.text_content,
    kc.keyword_tags,
    ts_rank_cd(kc.search_vector, websearch_to_tsquery('english', search_text))::REAL AS score
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks
    ON ks.id = kc.source_id
  WHERE ks.active = TRUE
    AND kc.search_vector @@ websearch_to_tsquery('english', search_text)
  ORDER BY score DESC, ks.trust_level DESC, kc.chunk_index ASC
  LIMIT GREATEST(match_count, 1);
$$;

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding VECTOR,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  source_id UUID,
  source_title TEXT,
  chunk_title TEXT,
  source_url TEXT,
  citation TEXT,
  text_content TEXT,
  keyword_tags TEXT[],
  similarity REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    kc.id AS chunk_id,
    ks.id AS source_id,
    ks.title AS source_title,
    COALESCE(kc.title, ks.title) AS chunk_title,
    COALESCE(kc.source_url, ks.canonical_url) AS source_url,
    kc.citation,
    kc.text_content,
    kc.keyword_tags,
    (1 - (kc.embedding <=> query_embedding))::REAL AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks
    ON ks.id = kc.source_id
  WHERE ks.active = TRUE
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding ASC
  LIMIT GREATEST(match_count, 1);
$$;

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks_by_embedding_text(
  query_embedding_text TEXT,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  source_id UUID,
  source_title TEXT,
  chunk_title TEXT,
  source_url TEXT,
  citation TEXT,
  text_content TEXT,
  keyword_tags TEXT[],
  similarity REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    kc.id AS chunk_id,
    ks.id AS source_id,
    ks.title AS source_title,
    COALESCE(kc.title, ks.title) AS chunk_title,
    COALESCE(kc.source_url, ks.canonical_url) AS source_url,
    kc.citation,
    kc.text_content,
    kc.keyword_tags,
    (1 - (kc.embedding <=> query_embedding_text::vector))::REAL AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks
    ON ks.id = kc.source_id
  WHERE ks.active = TRUE
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding_text::vector ASC
  LIMIT GREATEST(match_count, 1);
$$;

CREATE OR REPLACE FUNCTION public.match_reference_image_assets_by_embedding_text(
  query_embedding_text TEXT,
  match_count INTEGER DEFAULT 6,
  condition_filters TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  asset_id UUID,
  source_id UUID,
  source_slug TEXT,
  source_title TEXT,
  dataset_url TEXT,
  condition_label TEXT,
  local_path TEXT,
  asset_url TEXT,
  caption TEXT,
  metadata JSONB,
  similarity REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    ria.id AS asset_id,
    ris.id AS source_id,
    ris.slug AS source_slug,
    ris.title AS source_title,
    ris.dataset_url,
    ria.condition_label,
    ria.local_path,
    ria.asset_url,
    ria.caption,
    ria.metadata,
    (1 - (ria.embedding <=> query_embedding_text::vector))::REAL AS similarity
  FROM public.reference_image_assets ria
  JOIN public.reference_image_sources ris
    ON ris.id = ria.source_id
  WHERE ris.active = TRUE
    AND ria.embedding IS NOT NULL
    AND (
      condition_filters IS NULL
      OR array_length(condition_filters, 1) IS NULL
      OR ria.condition_label = ANY(condition_filters)
    )
  ORDER BY ria.embedding <=> query_embedding_text::vector ASC
  LIMIT GREATEST(match_count, 1);
$$;
