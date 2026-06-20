import {
  extractSafeSupabaseErrorDetails,
  isMissingRelationSupabaseError,
} from "@/lib/supabase-error";

/**
 * Detect "table not applied yet" so a feature degrades gracefully until its
 * migration is run. Matches both the Postgres code (42P01) and PostgREST's
 * schema-cache miss (PGRST205), plus the human-readable fallbacks.
 *
 * Lightweight form for handlers that already hold a Supabase error object with
 * `{ code, message }` (dog-brain signals/follow-ups, health-log, reminders).
 */
export function isMissingTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(
    error.message ?? "",
  );
}

/**
 * Same intent for handlers that only hold an `unknown` thrown value (the pets
 * routes). Normalises the error first, then reuses the shared relation-missing
 * detector in `supabase-error.ts`. Kept as a distinct export because it matches
 * Postgres 42P01 / "table … does not exist" rather than the PostgREST schema
 * cache codes above — preserving each route's existing behaviour exactly.
 */
export function isMissingTableError(err: unknown): boolean {
  return isMissingRelationSupabaseError(extractSafeSupabaseErrorDetails(err));
}
