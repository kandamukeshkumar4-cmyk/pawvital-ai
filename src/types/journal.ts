/** Mood emoji / journal mood (matches DB check constraint). */
export type JournalMood = "happy" | "normal" | "low" | "sick";

/** Row returned from Supabase `journal_entries` (API may expand photo_urls to signed URLs). */
export interface JournalEntry {
  id: string;
  user_id: string;
  pet_id: string;
  entry_date: string;
  mood: JournalMood | null;
  energy_level: number | null;
  notes: string | null;
  ai_summary: string | null;
  photo_urls: string[];
  created_at: string;
  updated_at?: string;
}

/** Payload to create a journal entry (server sets user_id). */
export interface JournalEntryInput {
  pet_id: string;
  entry_date?: string;
  mood?: JournalMood | null;
  energy_level?: number | null;
  notes?: string | null;
  photo_urls?: string[];
  ai_summary?: string | null;
}

/** NVIDIA weekly summary JSON shape. */
export interface JournalSummary {
  summary: string;
  trend: string;
  flags: string[];
  recommendation: string;
}
