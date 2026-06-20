"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { VetTimelineData } from "@/lib/analytics/vet-timeline";
import { VetTimeline } from "./vet-timeline";

/**
 * BrainTimelineSection — fetches the owner-scoped Dog Brain timeline
 * (`/api/analytics/vet-timeline`) and renders the presentational VetTimeline.
 *
 * The timeline component already existed but was wired to no page; this is the
 * data wrapper that surfaces it (History tab today, reusable elsewhere). Owner
 * observations only — never a clinical record.
 */
export function BrainTimelineSection({
  petId,
  petName,
}: {
  petId: string | null;
  petName: string;
}) {
  const [data, setData] = useState<VetTimelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!petId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/analytics/vet-timeline?pet_id=${petId}`);
        const j = (await r.json().catch(() => null)) as {
          data?: VetTimelineData | null;
        } | null;
        if (!cancelled) setData(j?.data ?? null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [petId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#1f9d6b] animate-spin" aria-label="Loading timeline" />
      </div>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-600">
        No Brain timeline yet. Save daily logs, journal notes, or symptom checks
        and {petName}&apos;s story will build here.
      </div>
    );
  }

  return <VetTimeline data={data} petName={petName} />;
}
