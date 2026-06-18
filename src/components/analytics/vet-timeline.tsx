"use client";

import { ClipboardList, BookOpen, Activity, Pill, Camera, ChevronDown } from "lucide-react";
import type { VetTimelineData, VetTimelineEntry, VetTimelineSource, VetTimelineTone } from "@/lib/analytics/vet-timeline";

/**
 * VetTimeline — chronological vet-ready story of all owner-logged data.
 *
 * Shows changed-from-normal signals, source labels, recurring symptoms,
 * what to tell the vet, and what to log next. Purely presentational; data
 * comes from the /api/analytics/vet-timeline route.
 */

const SOURCE_ICON: Record<VetTimelineSource, React.ComponentType<{ className?: string }>> = {
  symptom_check: Activity,
  daily_log: ClipboardList,
  journal: BookOpen,
  medication: Pill,
};

const SOURCE_LABEL: Record<VetTimelineSource, string> = {
  symptom_check: "Symptom check",
  daily_log: "Daily check-in",
  journal: "Journal",
  medication: "Medication",
};

const TONE_DOT: Record<VetTimelineTone, string> = {
  normal: "bg-[#00a878]",
  changed: "bg-amber-400",
  alert: "bg-red-500",
};

const TONE_ROW: Record<VetTimelineTone, string> = {
  normal: "border-[#e8e2d8]",
  changed: "border-amber-200 bg-amber-50/40",
  alert: "border-red-200 bg-red-50/40",
};

function TimelineRow({ entry }: { entry: VetTimelineEntry }) {
  const Icon = SOURCE_ICON[entry.source];
  return (
    <div
      className={`flex gap-3 rounded-xl border px-4 py-3 ${TONE_ROW[entry.tone]}`}
    >
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[entry.tone]}`}
          aria-hidden
        />
        <div className="w-px flex-1 bg-[#e8e2d8]" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-medium text-[#8a857a]">{entry.date}</span>
          <span className="flex items-center gap-1 rounded-full bg-[#f3f0eb] px-2 py-0.5 text-xs text-[#6b665d]">
            <Icon className="h-3 w-3" aria-hidden />
            {SOURCE_LABEL[entry.source]}
          </span>
          {entry.hasPhotos && (
            <span className="flex items-center gap-1 rounded-full bg-[#f3f0eb] px-2 py-0.5 text-xs text-[#6b665d]">
              <Camera className="h-3 w-3" aria-hidden />
              Photo
            </span>
          )}
        </div>
        <p className="text-sm text-[#2c2a26]">{entry.summary}</p>
        {entry.details.length > 0 && (
          <ul className="mt-1 space-y-0.5 pl-0">
            {entry.details.map((d, i) => (
              <li key={i} className="text-xs text-[#6b665d]">
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function VetTimeline({ data, petName }: { data: VetTimelineData; petName: string }) {
  const { entries, vetSummary, recurringSymptoms, logNext } = data;

  return (
    <div className="space-y-4">
      {/* Vet-ready summary */}
      {vetSummary && (
        <div className="rounded-2xl border border-[#e8e2d8] bg-white px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#00a878]">
            What to tell the vet
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#2c2a26]">{vetSummary}</p>
        </div>
      )}

      {/* Recurring symptoms */}
      {recurringSymptoms.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Recurring signs to mention
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recurringSymptoms.map((s) => (
              <span
                key={s}
                className="rounded-full border border-amber-200 bg-white px-3 py-0.5 text-sm capitalize text-amber-800"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chronological timeline */}
      {entries.length > 0 ? (
        <details className="group rounded-2xl border border-[#e8e2d8] bg-white" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-medium text-[#7c4dc4]">
            <span>{petName}&apos;s story over time</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-2 border-t border-[#e8e2d8] px-4 py-4 sm:px-5">
            <p className="mb-3 text-xs text-[#8a857a]">
              All sources, newest first — symptom checks, daily logs, journal, and meds. Owner observations only; not a clinical record.
            </p>
            {entries.map((e, i) => (
              <TimelineRow key={`${e.source}-${e.date}-${i}`} entry={e} />
            ))}
          </div>
        </details>
      ) : (
        <div className="rounded-2xl border border-[#e8e2d8] bg-white px-5 py-8 text-center text-sm text-[#6b665d]">
          No events logged yet. Start a symptom check or add a daily log to build {petName}&apos;s timeline.
        </div>
      )}

      {/* Log next prompts */}
      {logNext.length > 0 && (
        <div className="rounded-2xl border border-[#e8e2d8] bg-white px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b665d]">
            What to log next
          </p>
          <ul className="mt-2 space-y-1.5">
            {logNext.map((tip, i) => (
              <li key={i} className="text-sm text-[#2c2a26]">
                • {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
