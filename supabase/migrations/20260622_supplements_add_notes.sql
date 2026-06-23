-- Add free-text owner notes to tracked supplements.
-- Surfaced on the Supplements page card as the "Notes" column
-- (e.g. "Intermittent stiffness after play"), alongside Purpose and the
-- created_at "Added" date. Read by GET /api/supplements.
ALTER TABLE public.supplements
  ADD COLUMN IF NOT EXISTS notes text;
