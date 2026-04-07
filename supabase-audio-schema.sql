-- Audio corpus tables for future classification
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.audio_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  dataset_name TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.audio_sources(id) ON DELETE CASCADE,
  local_path TEXT NOT NULL,
  category TEXT NOT NULL,
  is_pathological BOOLEAN NOT NULL DEFAULT false,
  duration_seconds REAL,
  sample_rate INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, local_path)
);

CREATE INDEX IF NOT EXISTS idx_audio_assets_category ON public.audio_assets(category);
CREATE INDEX IF NOT EXISTS idx_audio_assets_pathological ON public.audio_assets(is_pathological);
