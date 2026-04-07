-- PawVital: shareable symptom report links (run in Supabase SQL Editor after base schema)

CREATE TABLE IF NOT EXISTS public.shared_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES public.symptom_checks(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_token ON public.shared_reports(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_reports_check_id ON public.shared_reports(check_id);

ALTER TABLE public.shared_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert only for symptom checks on their own pets
CREATE POLICY "Owners can create shared report links"
  ON public.shared_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.symptom_checks sc
      JOIN public.pets p ON p.id = sc.pet_id
      WHERE sc.id = check_id
        AND p.user_id = auth.uid()
    )
  );

-- Owners can list/delete their own shares (optional UX)
CREATE POLICY "Owners can view own shared reports"
  ON public.shared_reports
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Owners can delete own shared reports"
  ON public.shared_reports
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Public read by token without exposing all rows: SECURITY DEFINER RPC
CREATE OR REPLACE FUNCTION public.get_shared_report(p_token text)
RETURNS TABLE (
  check_id uuid,
  ai_response text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.check_id, sc.ai_response, sr.expires_at
  FROM public.shared_reports sr
  INNER JOIN public.symptom_checks sc ON sc.id = sr.check_id
  WHERE sr.share_token = p_token
    AND sr.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;
