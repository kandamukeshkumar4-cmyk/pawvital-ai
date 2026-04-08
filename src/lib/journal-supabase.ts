import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalEntry } from "@/types/journal";

const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

function isHttpUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

/**
 * Replace storage object paths with short-lived signed URLs for the journal-photos bucket.
 */
export async function expandJournalPhotoUrls(
  supabase: SupabaseClient,
  entries: JournalEntry[]
): Promise<JournalEntry[]> {
  const out: JournalEntry[] = [];
  for (const row of entries) {
    const urls: string[] = [];
    for (const u of row.photo_urls || []) {
      if (!u) continue;
      if (isHttpUrl(u)) {
        urls.push(u);
        continue;
      }
      const { data, error } = await supabase.storage
        .from("journal-photos")
        .createSignedUrl(u, SIGNED_URL_TTL_SEC);
      if (!error && data?.signedUrl) {
        urls.push(data.signedUrl);
      } else {
        urls.push(u);
      }
    }
    out.push({ ...row, photo_urls: urls });
  }
  return out;
}
