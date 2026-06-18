"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import type { HealthLog } from "@/lib/health-log/types";
import { SELECT_FIELDS } from "@/lib/health-log/types";
import {
  buildDailySignalsGrid,
  buildStatusTimeline,
  type CellState,
  type SignalTone,
} from "@/lib/analytics/health-signals";
import type { SymptomCheckEntry } from "@/components/timeline/types";

const TONE_BG: Record<SignalTone, string> = {
  good: "rgba(0,168,120,0.12)",
  watch: "rgba(224,164,88,0.18)",
  alert: "rgba(226,92,92,0.14)",
};
const TONE_TEXT: Record<SignalTone, string> = {
  good: "#0a7d5b",
  watch: "#9a6b1f",
  alert: "#b23636",
};

const CELL_STYLE: Record<CellState, { bg: string; title: string }> = {
  normal: { bg: "#00a878", title: "Normal" },
  changed: { bg: "#d98b3a", title: "Changed" },
  missing: { bg: "#e8e2d8", title: "Not logged" },
};

function fieldLabel(key: string, value: string): string {
  const def = SELECT_FIELDS.find((f) => f.key === key);
  return def?.options.find((o) => o.value === value)?.label ?? value;
}

function fieldTone(key: string, value: string): SignalTone {
  const def = SELECT_FIELDS.find((f) => f.key === key);
  return (def?.options.find((o) => o.value === value)?.tone as SignalTone) ?? "good";
}

/** Snapshot of the most recent daily log, synced from the Daily Log. */
export function DailyLogSnapshot({
  latest,
  petName,
}: {
  latest: HealthLog | null;
  petName: string;
}) {
  if (!latest) {
    return (
      <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[#0a7d5b]" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
            Recent daily signals
          </p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#6b665d]">
          No daily check-ins logged yet. A 30-second daily log helps you spot whether
          {" "}{petName} is getting better or worse.
        </p>
        <Link
          href="/health-log"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#0a7d5b] hover:underline"
        >
          Log today&apos;s check-in →
        </Link>
      </section>
    );
  }

  const tiles: { label: string; value: string; tone: SignalTone }[] = SELECT_FIELDS.map(
    (f) => {
      const value = (latest as unknown as Record<string, string>)[f.key];
      return { label: f.label, value: fieldLabel(f.key, value), tone: fieldTone(f.key, value) };
    },
  );
  tiles.push({
    label: "Vomiting",
    value: latest.vomiting_count === 0 ? "None" : `${latest.vomiting_count}×`,
    tone: latest.vomiting_count === 0 ? "good" : latest.vomiting_count > 2 ? "alert" : "watch",
  });

  return (
    <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[#0a7d5b]" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
            Recent daily signals
          </p>
        </div>
        <span className="text-xs text-[#a8a097]">{latest.log_date}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl px-3 py-2"
            style={{ background: TONE_BG[t.tone] }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: TONE_TEXT[t.tone] }}>
              {t.label}
            </p>
            <p className="text-sm font-semibold" style={{ color: TONE_TEXT[t.tone] }}>
              {t.value}
            </p>
          </div>
        ))}
        {latest.meds_given ? (
          <div className="rounded-xl bg-[#f7f4ef] px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#6b665d]">Meds</p>
            <p className="text-sm font-semibold text-[#4a463f]">Given ✓</p>
          </div>
        ) : null}
      </div>

      <Link
        href="/health-log"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#0a7d5b] hover:underline"
      >
        Update today&apos;s log →
      </Link>
    </section>
  );
}

/** 7-day grid of daily signals (appetite / water / bathroom / energy / vomiting). */
export function DailySignalsGridView({
  logs,
  now,
}: {
  logs: HealthLog[];
  now: Date;
}) {
  const grid = buildDailySignalsGrid(logs, now, 7);
  if (!grid.hasData) return null;

  return (
    <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
        Last 7 days
      </p>
      <div className="mt-3 space-y-2">
        {grid.rows.map((row) => (
          <div key={row.key} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-[#6b665d]">{row.label}</span>
            <div className="flex flex-1 gap-1.5">
              {row.cells.map((cell) => (
                <span
                  key={cell.date}
                  className="h-5 flex-1 rounded"
                  style={{ background: CELL_STYLE[cell.state].bg }}
                  title={`${cell.date}: ${CELL_STYLE[cell.state].title}`}
                  role="img"
                  aria-label={`${row.label} ${cell.date}: ${CELL_STYLE[cell.state].title}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-[#8a857a]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "#00a878" }} /> Normal
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "#d98b3a" }} /> Changed
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "#e8e2d8" }} /> Not logged
        </span>
      </div>
    </section>
  );
}

/** Simple status story over time from symptom checks (Monitor → Call vet → …). */
export function StatusTimeline({ entries }: { entries: SymptomCheckEntry[] }) {
  const steps = buildStatusTimeline(entries, 6);
  if (steps.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
        The story so far
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {steps.map((step, i) => (
          <span key={`${step.date}-${i}`} className="flex items-center gap-1.5">
            <span
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: TONE_BG[step.tone], color: TONE_TEXT[step.tone] }}
              title={step.date}
            >
              {step.label}
            </span>
            {i < steps.length - 1 ? (
              <span className="text-[#c9c1b5]" aria-hidden>→</span>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}
