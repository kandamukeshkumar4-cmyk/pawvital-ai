-- Minimal persisted supplement lifecycle for Dog Brain follow-up loop.
-- Owner starts a trial (ask-vet framing only). Outcomes (better/same/worse/side_effect)
-- feed back into Brain context. Never stores dosage.
--
-- Lifecycle statuses:
--   ask_vet          → owner intends to discuss with vet (no started_at yet)
--   active           → trial underway
--   stopped          → owner stopped the trial without recording an outcome
--   follow_up_due    → a follow-up nudge is due (transient)
--   outcome_recorded → terminal: owner answered with an outcome (better/same/worse/side_effect)

CREATE TABLE IF NOT EXISTS public.dog_brain_supplement_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  supplement_name text NOT NULL,
  reason_signal_key text,
  status text NOT NULL CHECK (status IN ('ask_vet','active','stopped','follow_up_due','outcome_recorded')),
  started_at timestamptz,
  follow_up_due_at timestamptz,
  outcome text CHECK (outcome IN ('better','same','worse','side_effect')),
  outcome_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent applies onto an older revision of this table that predates the
-- terminal/answered columns and the widened status CHECK.
ALTER TABLE public.dog_brain_supplement_trials
  ADD COLUMN IF NOT EXISTS outcome_at timestamptz;
ALTER TABLE public.dog_brain_supplement_trials
  DROP CONSTRAINT IF EXISTS dog_brain_supplement_trials_status_check;
ALTER TABLE public.dog_brain_supplement_trials
  ADD CONSTRAINT dog_brain_supplement_trials_status_check
  CHECK (status IN ('ask_vet','active','stopped','follow_up_due','outcome_recorded'));

ALTER TABLE public.dog_brain_supplement_trials ENABLE ROW LEVEL SECURITY;

-- RLS: owner only
DROP POLICY IF EXISTS "dog_brain_supplement_trials_owner_all" ON public.dog_brain_supplement_trials;
CREATE POLICY "dog_brain_supplement_trials_owner_all"
  ON public.dog_brain_supplement_trials
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- One OPEN trial per (pet, supplement, reason) — prevents duplicate trials on
-- retry. COALESCE keeps NULL reason_signal_key from defeating the constraint
-- (NULLs are otherwise distinct). The route still pre-queries; this index is the
-- race backstop, raising 23505 on a concurrent insert.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_supplement_trial_open
  ON public.dog_brain_supplement_trials (user_id, pet_id, supplement_name, COALESCE(reason_signal_key, ''))
  WHERE status IN ('ask_vet','active');

-- Indexes for loop queries
CREATE INDEX IF NOT EXISTS idx_dog_brain_supplement_trials_user_pet
  ON public.dog_brain_supplement_trials (user_id, pet_id, status);
CREATE INDEX IF NOT EXISTS idx_dog_brain_supplement_trials_due
  ON public.dog_brain_supplement_trials (follow_up_due_at) WHERE follow_up_due_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dog_brain_supplement_trials TO authenticated;
