-- Production hardening additions for PawVital AI.
-- Safe to re-run after the core Supabase schema files.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Billing mirror protection
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_profile_billing_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (
    NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
    NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
  ) THEN
    RAISE EXCEPTION 'Billing-managed profile fields are read-only for end users';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_profile_billing_fields ON public.profiles;
CREATE TRIGGER protect_profile_billing_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_billing_fields();

-- ---------------------------------------------------------------------------
-- Stripe webhook durability
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  stripe_created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_received
  ON public.stripe_webhook_events(status, received_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages stripe webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Service role manages stripe webhook events"
  ON public.stripe_webhook_events
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Performance indexes for live query patterns
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_symptom_checks_pet_created
  ON public.symptom_checks(pet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_symptom_checks_created
  ON public.symptom_checks(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_entry_date_created
  ON public.journal_entries(user_id, entry_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_pet_entry_date_created
  ON public.journal_entries(user_id, pet_id, entry_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Audio corpus RLS posture
-- ---------------------------------------------------------------------------

ALTER TABLE public.audio_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages audio sources" ON public.audio_sources;
CREATE POLICY "Service role manages audio sources"
  ON public.audio_sources
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages audio assets" ON public.audio_assets;
CREATE POLICY "Service role manages audio assets"
  ON public.audio_assets
  TO service_role
  USING (true)
  WITH CHECK (true);
