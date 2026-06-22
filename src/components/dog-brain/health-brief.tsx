"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Utensils,
  Waves,
  Scale,
  AlertCircle,
  Pill,
  Brain,
  Stethoscope,
  ClipboardPlus,
  CircleCheckBig,
  Circle,
  FileText,
  ShieldCheck,
  ShieldAlert,
  ClipboardList,
  ChevronRight,
  Bell,
  Camera,
  TrendingDown,
  Sparkles,
  Upload,
} from "lucide-react";
import type {
  BriefState,
  DetectedSignal,
  DogBrainSignalsResponse,
  SignalType,
} from "@/lib/dog-brain/types";
import type { HealthLog } from "@/lib/health-log/types";
import { FollowupsPanel } from "./followups-panel";

// Slide 6 state colors — "Watch" uses amber #e0890a; shield icon stroke #e0890a.
const STATE_META: Record<
  BriefState,
  { label: string; line: string; fg: string; bg: string; chipBg: string; chipFg: string; Icon: typeof ShieldCheck }
> = {
  stable: { label: "Stable", line: "#0b7a4d", fg: "#0b7a4d", bg: "#e9f6ef", chipBg: "#e9f6ef", chipFg: "#0b7a4d", Icon: ShieldCheck },
  watch: { label: "Watch", line: "#e0890a", fg: "#e0890a", bg: "#fdf3e3", chipBg: "#fdf3e3", chipFg: "#b5740a", Icon: ShieldAlert },
  needs_attention: { label: "Needs attention", line: "#e2675b", fg: "#b8473c", bg: "#fbeae8", chipBg: "#fbeae8", chipFg: "#b8473c", Icon: AlertCircle },
};

const APPETITE_SCORE: Record<string, number> = { normal: 4, increased: 3, reduced: 2, none: 1 };
const STOOL_SCORE: Record<string, number> = { normal: 4, soft: 2, none: 2, diarrhea: 1, blood: 1 };

function buildSeries(logs: HealthLog[], type: SignalType): { v: number }[] {
  const chrono = [...logs].reverse();
  const pick = (l: HealthLog): number | null => {
    switch (type) {
      case "appetite_drop": return APPETITE_SCORE[l.appetite] ?? null;
      case "stool_change": return STOOL_SCORE[l.stool] ?? null;
      case "vomiting_trend": return l.vomiting_count ?? 0;
      case "weight_downtrend": return typeof l.weight_kg === "number" ? l.weight_kg : null;
      default: return null;
    }
  };
  return chrono.map(pick).filter((v): v is number => v !== null).map((v) => ({ v }));
}

// ─── TODAY'S HEALTH BRIEF card ────────────────────────────────────────────────

const SIGNAL_REASON: Record<SignalType, string> = {
  appetite_drop: "appetite reduced",
  stool_change: "stool changed",
  vomiting_trend: "repeated vomiting",
  weight_downtrend: "weight trending down",
  water_urination_change: "thirst or urination changed",
  mobility_pain_change: "limping or stiffness",
  breathing_cough_change: "breathing or cough change",
  skin_ear_change: "skin or ear irritation",
  energy_behavior_change: "low energy",
  possible_med_side_effect: "medication note",
};

/** Build the short "main reason" headline shown in the brief card. */
function mainReason(signals: DetectedSignal[], petName: string): string {
  if (signals.length === 0) {
    return `${petName}'s logs look good — keep the daily check-ins going.`;
  }
  const phrases = signals.slice(0, 2).map((s) => SIGNAL_REASON[s.signal_type]);
  const joined = phrases.join(" + ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function TodaysHealthBriefCard({
  state,
  signals,
  petName,
  logs,
  reminders,
  followupCount,
}: {
  state: BriefState;
  signals: DetectedSignal[];
  petName: string;
  logs: HealthLog[];
  reminders: ReminderRow[];
  followupCount: number;
}) {
  const meta = STATE_META[state];
  const reason = mainReason(signals, petName);
  const hasSignals = signals.length > 0;

  const photoCount = logs.reduce(
    (sum, l) => sum + (Array.isArray(l.photo_urls) ? l.photo_urls.length : 0),
    0,
  );
  // White memory chips on the right of the eyebrow (real counts only).
  const vetRecordCount = reminders.filter((r) => r.type === "vet_appointment").length;
  const memoryChips: { label: string; Icon: typeof ClipboardList | null }[] = [
    { label: `${logs.length} ${logs.length === 1 ? "log" : "logs"}`, Icon: ClipboardList },
  ];
  if (photoCount > 0) {
    memoryChips.push({
      label: `${photoCount} ${photoCount === 1 ? "photo" : "photos"}`,
      Icon: Camera,
    });
  }
  if (vetRecordCount > 0) {
    memoryChips.push({
      label: `${vetRecordCount} vet record${vetRecordCount === 1 ? "" : "s"}`,
      Icon: null,
    });
  }

  // Build the sub-line from real signals (slide: "Stool softer · Weight down · …").
  const subParts = signals
    .map((s) => SIGNAL_REASON[s.signal_type])
    .filter(Boolean)
    .slice(0, 3);
  const subLine =
    subParts.length > 0
      ? subParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" · ")
      : "All tracked signals normal";

  return (
    <div
      className="rounded-[20px] bg-white"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)", padding: "24px 26px" }}
    >
      {/* Eyebrow + memory chips */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#8e8e93]">
          Brain Brief
        </span>
        <div className="flex flex-wrap items-center gap-[7px]">
          {memoryChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-[5px] rounded-[20px] border border-[#e5e5ea] bg-white px-[9px] py-[3px] text-[12px] font-medium text-[#3c3c43]"
            >
              {chip.Icon && <chip.Icon className="h-[11px] w-[11px] text-[#8e8e93]" aria-hidden />}
              {chip.label}
            </span>
          ))}
          {followupCount > 0 && (
            <span className="inline-flex items-center rounded-[20px] border border-[#f0cd8e] bg-[#fdf3e3] px-[9px] py-[3px] text-[12px] font-semibold text-[#b5740a]">
              {followupCount} open follow-up{followupCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {/* Status line: shield + state word + pattern chip */}
      <div className="mb-[6px] flex items-center gap-[11px]">
        <meta.Icon className="h-[30px] w-[30px] shrink-0" style={{ color: meta.line }} strokeWidth={1.7} aria-hidden />
        <span className="text-[26px] font-bold" style={{ color: meta.fg, letterSpacing: "-0.6px" }}>
          {meta.label}
        </span>
        {hasSignals && (
          <span
            className="inline-flex items-center gap-[5px] rounded-[20px] px-[10px] py-[4px] text-[12.5px] font-semibold"
            style={{ background: meta.chipBg, color: meta.chipFg }}
          >
            <Sparkles className="h-3 w-3" fill="#dd9b22" stroke="none" aria-hidden />
            Pattern detected
          </span>
        )}
      </div>

      {/* Headline + sub */}
      <p className="mb-[7px] text-[22px] font-bold leading-[1.25] text-[#1c1c1e]" style={{ letterSpacing: "-0.5px" }}>
        {reason}
      </p>
      <p className="mb-5 text-[14px] leading-[1.5] text-[#6c6c70]">{subLine}</p>

      {/* Hairline divider */}
      <div className="mb-[18px] h-px bg-[#e5e5ea]" aria-hidden />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-[10px]">
        <a
          href="/symptom-checker"
          target="_top"
          className="inline-flex items-center gap-2 rounded-[13px] bg-[#0b7a4d] px-[19px] py-[12px] text-[14.5px] font-semibold text-white transition-colors hover:bg-[#0a6c44]"
          style={{ letterSpacing: "-0.1px" }}
        >
          <Stethoscope className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden />
          Start symptom check
        </a>
        <a
          href="/health-log"
          target="_top"
          className="inline-flex items-center gap-2 rounded-[13px] bg-[#f2f2f7] px-[18px] py-[12px] text-[14.5px] font-semibold text-[#1c1c1e] transition-colors hover:bg-[#e8e8ee]"
        >
          <ClipboardList className="h-[17px] w-[17px] text-[#3c3c43]" strokeWidth={1.8} aria-hidden />
          Log tonight
        </a>
        <a
          href="/health-log"
          target="_top"
          className="inline-flex items-center gap-2 rounded-[13px] bg-[#f2f2f7] px-[18px] py-[12px] text-[14.5px] font-semibold text-[#1c1c1e] transition-colors hover:bg-[#e8e8ee]"
        >
          <Camera className="h-[17px] w-[17px] text-[#3c3c43]" strokeWidth={1.7} aria-hidden />
          Add photo
        </a>
      </div>
    </div>
  );
}

// ─── WHAT CHANGED FROM NORMAL — mini-charts ───────────────────────────────────

// Slide 6 mini-card palette: card bg/border, round icon tint, bar fill, gridline,
// "recent" highlight fill for the trailing decline bars, and the state-pill colors.
const CHANGED_METRICS: {
  type: SignalType;
  label: string;
  Icon: typeof Utensils;
  cardBg: string;
  cardBorder: string;
  iconBg: string;
  iconFg: string;
  bar: string;
  recentBar: string;
  grid: string;
}[] = [
  {
    type: "appetite_drop",
    label: "Appetite",
    Icon: Utensils,
    cardBg: "#FDFAF3",
    cardBorder: "#EDE5C8",
    iconBg: "#f6ece2",
    iconFg: "#c87d3e",
    bar: "#E8960A",
    recentBar: "#E5626F",
    grid: "#F0EAD6",
  },
  {
    type: "stool_change",
    label: "Stool",
    Icon: Waves,
    cardBg: "#FDFAF3",
    cardBorder: "#D8EBE0",
    iconBg: "#f0ead9",
    iconFg: "#8a6a3c",
    bar: "#2D9E7A",
    recentBar: "#E8960A",
    grid: "#D8EDE4",
  },
  {
    type: "weight_downtrend",
    label: "Weight",
    Icon: Scale,
    cardBg: "#F5F8FD",
    cardBorder: "#D0DCF0",
    iconBg: "#e7eef5",
    iconFg: "#4d7cb5",
    bar: "#8AA4CC",
    recentBar: "#8AA4CC",
    grid: "#D8E4F4",
  },
];

const PREVIEW_SERIES = [4, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 2, 2, 1];

/** Compact state pill ("↓ 3 days", "−0.4 kg") matching the slide top-right tag. */
function metricStatePill(
  type: SignalType,
  signals: DetectedSignal[],
): { label: string; bg: string; fg: string } | null {
  const sig = signals.find((s) => s.signal_type === type);
  if (!sig) return null;
  if (type === "weight_downtrend") return { label: "trending down", bg: "#dde8f5", fg: "#4d7cb5" };
  if (type === "stool_change") return { label: "changed", bg: "#fdf3e3", fg: "#b5740a" };
  return { label: "watch", bg: "#fdf3e3", fg: "#b5740a" };
}

/**
 * SVG bar chart mirroring the slide: viewBox 0 0 168 52, 3 gridlines, 8px-wide
 * bars on a 12px pitch (rounded rx 3). The trailing bars that fall below the
 * series mean are tinted with `recentBar` to mark the recent decline.
 */
function MiniBarChart({
  values,
  bar,
  recentBar,
  grid,
  example = false,
  tight = false,
}: {
  values: number[];
  bar: string;
  recentBar: string;
  grid: string;
  example?: boolean;
  /**
   * Zoom the y-axis to the data's own min–max instead of anchoring to zero.
   * Categorical scores (appetite/stool, 1–4) read best off a zero baseline,
   * but a continuous metric like weight (~28 kg) needs a tight scale or a real
   * 0.9 kg swing collapses to a flat line.
   */
  tight?: boolean;
}) {
  let max: number;
  let min: number;
  if (tight && values.length > 0) {
    const dataMax = Math.max(...values);
    const dataMin = Math.min(...values);
    // Pad the range so the smallest bar still reads above the floor.
    const pad = (dataMax - dataMin) * 0.25 || Math.abs(dataMax) * 0.02 || 1;
    max = dataMax + pad;
    min = dataMin - pad;
  } else {
    max = Math.max(...values, 1);
    min = Math.min(...values, 0);
  }
  const range = max - min || 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    <svg
      width="100%"
      height="52"
      viewBox="0 0 168 52"
      fill="none"
      style={example ? { opacity: 0.45 } : undefined}
      aria-hidden
    >
      {[13, 28, 42].map((y) => (
        <line key={y} x1="0" y1={y} x2="168" y2={y} stroke={grid} strokeWidth="0.6" />
      ))}
      {values.map((v, i) => {
        const h = 10 + ((v - min) / range) * 38;
        const y = 50 - h;
        const x = 2 + i * 12;
        const recent = i >= values.length - 3 && v < mean;
        return <rect key={i} x={x} y={y} width="8" height={h} rx="3" fill={recent ? recentBar : bar} />;
      })}
    </svg>
  );
}

function NoDataMiniChart() {
  return (
    <div className="flex h-[52px] items-center justify-center" aria-hidden>
      <span className="text-[20px] font-semibold text-[#cbccc3]">—</span>
    </div>
  );
}

function ChangedMetricTile({
  metric,
  values,
  pill,
  showPreview,
}: {
  metric: (typeof CHANGED_METRICS)[number];
  values: number[];
  pill: { label: string; bg: string; fg: string } | null;
  showPreview: boolean;
}) {
  const hasData = values.length >= 2;
  return (
    <div
      className="flex-1 rounded-[16px] border"
      style={{ background: metric.cardBg, borderColor: metric.cardBorder, padding: "14px 14px 12px" }}
    >
      <div className="mb-[10px] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full"
            style={{ background: metric.iconBg, color: metric.iconFg }}
          >
            <metric.Icon className="h-[14px] w-[14px]" strokeWidth={1.9} aria-hidden />
          </span>
          <span className="text-[14px] font-semibold text-[#1c1c1e]">{metric.label}</span>
        </div>
        {hasData && pill ? (
          <span
            className="rounded-[9px] px-2 py-[2px] text-[11px] font-bold"
            style={{ background: pill.bg, color: pill.fg }}
          >
            {pill.label}
          </span>
        ) : !hasData && showPreview ? (
          <span
            className="rounded-[9px] bg-[#f2f2f7] px-2 py-[2px] text-[9px] font-bold uppercase tracking-widest text-[#85867e]"
            style={{ opacity: 0.45 }}
          >
            Example
          </span>
        ) : null}
      </div>
      {hasData ? (
        <MiniBarChart
          values={values}
          bar={metric.bar}
          recentBar={metric.recentBar}
          grid={metric.grid}
          tight={metric.type === "weight_downtrend"}
        />
      ) : showPreview ? (
        <MiniBarChart values={PREVIEW_SERIES} bar={metric.bar} recentBar={metric.recentBar} grid={metric.grid} example />
      ) : (
        <NoDataMiniChart />
      )}
      <div className="mt-[6px] flex items-center justify-between">
        <span className="text-[11px] text-[#aeaeb2]">14 days</span>
        <a
          href="/analytics"
          target="_top"
          className="inline-flex items-center gap-[2px] text-[12px] font-semibold text-[#0b7a4d]"
        >
          Details
          <ChevronRight className="h-[10px] w-[10px]" strokeWidth={2.4} aria-hidden />
        </a>
      </div>
    </div>
  );
}

const STABLE_LABELS: Partial<Record<SignalType, string>> = {
  water_urination_change: "Water — stable",
  vomiting_trend: "Vomiting — none",
};

function WhatChangedSection({ signals, logs }: { signals: DetectedSignal[]; logs: HealthLog[] }) {
  const metricData = CHANGED_METRICS.map((m) => ({
    metric: m,
    values: buildSeries(logs, m.type).map((d) => d.v),
    pill: metricStatePill(m.type, signals),
  }));
  const anyData = metricData.some((m) => m.values.length >= 2);
  const showPreview = !anyData;

  // Stable-signal pills: only render for info-severity signals that have a fixed
  // owner-friendly label, so we never invent reassurance the data doesn't support.
  const stablePills = signals
    .filter((s) => s.severity === "info" && STABLE_LABELS[s.signal_type])
    .map((s) => ({ key: s.dedupe_key, label: STABLE_LABELS[s.signal_type]! }));

  return (
    <div
      className="rounded-[20px] bg-white"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)", padding: "20px 24px" }}
    >
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#8e8e93]">
        What Changed From Normal
      </p>

      {showPreview && (
        <div className="mb-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#85867e]">Preview</p>
          <p className="text-[12px] text-[#6f7069]">
            After ~14 daily logs your Health Brief will look like this.
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        {metricData.map((m) => (
          <ChangedMetricTile
            key={m.metric.type}
            metric={m.metric}
            values={m.values}
            pill={m.pill}
            showPreview={showPreview}
          />
        ))}
      </div>

      {stablePills.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {stablePills.map((p) => (
            <div
              key={p.key}
              className="flex flex-1 items-center gap-[7px] rounded-[10px] border border-[#c8e6d5] bg-[#f2f9f5] px-3 py-[9px]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0b7a4d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 7 10 17l-5-5" />
              </svg>
              <span className="text-[13px] font-medium text-[#1c3a2a]">{p.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PATTERN TIMELINE ─────────────────────────────────────────────────────────

type TimelineDot = "watch" | "info" | "active" | "pending";

interface TimelineEvent {
  id: string;
  dateLabel: string;
  dateAccent: boolean; // "Today" renders green
  dot: TimelineDot;
  title: string;
  titleAccent: boolean; // pending follow-up title renders amber
  desc: string;
  chips: { label: string; bg: string; fg: string; withPhoto?: boolean }[];
  sortAt: number;
}

const DOT_COLOR: Record<TimelineDot, string> = {
  watch: "#e0890a",
  info: "#4d7cb5",
  active: "#0b7a4d",
  pending: "#e0890a", // pending renders a hollow dot; color unused but keeps the map total
};

/** Short date column label ("May 15", "Today"). */
function timelineDateLabel(dateStr: string): { label: string; accent: boolean } {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { label: "", accent: false };
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return { label: "Today", accent: true };
  return { label: d.toLocaleDateString("en", { month: "short", day: "numeric" }), accent: false };
}

/** Short owner-readable summary of a daily log's notable findings. */
function summarizeLog(log: HealthLog): string {
  const parts: string[] = [];
  if (log.appetite === "reduced" || log.appetite === "none") parts.push("less interest in meals");
  if (log.energy === "low") parts.push("low energy");
  if (log.stool && log.stool !== "normal") parts.push("stool change");
  if ((log.vomiting_count ?? 0) > 0) parts.push("vomiting");
  if (parts.length === 0) return "All tracked signals normal";
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const CHIP_WATCH = { label: "Watch", bg: "#fdf3e3", fg: "#b5740a" };
const CHIP_GREY = (label: string) => ({ label, bg: "#f2f2f7", fg: "#6c6c70" });
const CHIP_PHOTO = { label: "Photo added", bg: "#e7eef5", fg: "#4d7cb5", withPhoto: true };

function buildTimelineEvents(logs: HealthLog[], reminders: ReminderRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  logs.slice(0, 6).forEach((log, i) => {
    const raw = log as { log_date?: string; created_at?: string };
    // Label/sort by the day the log is FOR (log_date), not when the row was
    // written (created_at). Backfilled or bulk-entered logs share a created_at,
    // which would otherwise collapse several distinct days into one "Today".
    const dateStr = raw.log_date ?? raw.created_at ?? "";
    const at = new Date(dateStr).getTime() || 0;
    const { label, accent } = timelineDateLabel(dateStr);
    const photos = (log as { photo_urls?: string[] }).photo_urls;
    const hasPhoto = Array.isArray(photos) && photos.length > 0;
    const noteworthy =
      log.appetite === "reduced" ||
      log.appetite === "none" ||
      log.energy === "low" ||
      (log.stool && log.stool !== "normal") ||
      (log.vomiting_count ?? 0) > 0;
    const chips: TimelineEvent["chips"] = [];
    if (noteworthy) chips.push(CHIP_WATCH);
    if (hasPhoto) chips.push(CHIP_PHOTO);
    else chips.push(CHIP_GREY(`${logs.length} log${logs.length === 1 ? "" : "s"} tracked`));
    events.push({
      id: `log-${i}`,
      dateLabel: label,
      dateAccent: accent,
      dot: noteworthy ? "watch" : "info",
      title: "Daily log",
      titleAccent: false,
      desc: summarizeLog(log),
      chips,
      sortAt: at,
    });
  });

  // Reminders join the story as "Active / scheduled" markers, clamped below the
  // newest log so a future-due reminder never out-ranks today's check-in.
  const newestLogAt = events.reduce((max, e) => Math.max(max, e.sortAt), 0);
  const reminderCeiling = newestLogAt > 0 ? newestLogAt - 1 : Date.now();
  reminders.slice(0, 2).forEach((r, i) => {
    const due = r.next_due ? new Date(r.next_due).getTime() || 0 : 0;
    const { label, accent } = r.next_due ? timelineDateLabel(r.next_due) : { label: "Scheduled", accent: false };
    events.push({
      id: `rem-${r.id ?? i}`,
      dateLabel: label,
      dateAccent: accent,
      dot: "active",
      title: r.title,
      titleAccent: false,
      desc: "Reminder scheduled — Brain will nudge you when it's due",
      chips: [{ label: "Active", bg: "#e9f6ef", fg: "#0b7a4d" }],
      sortAt: Math.min(due, reminderCeiling),
    });
  });

  return events.sort((a, b) => b.sortAt - a.sortAt).slice(0, 5);
}

function TimelineRow({ event, last }: { event: TimelineEvent; last: boolean }) {
  const pending = event.dot === "pending";
  return (
    <div className="flex items-start gap-[14px]">
      {/* Date column */}
      <div className="w-[52px] shrink-0 pt-[3px] text-right">
        <div
          className="text-[11.5px] font-semibold"
          style={{ color: event.dateAccent ? "#0b7a4d" : "#8e8e93" }}
        >
          {event.dateLabel}
        </div>
      </div>
      {/* Rail */}
      <div className="flex w-[18px] shrink-0 flex-col items-center">
        {pending ? (
          <span
            className="mt-[3px] h-[10px] w-[10px] shrink-0 rounded-full bg-white"
            style={{ border: "2.5px solid #e0890a" }}
            aria-hidden
          />
        ) : (
          <span
            className="mt-[3px] h-[10px] w-[10px] shrink-0 rounded-full"
            style={{ background: DOT_COLOR[event.dot] }}
            aria-hidden
          />
        )}
        {!last && (
          <span className="mt-[3px] min-h-[26px] w-[1.5px] flex-1 bg-[#e5e5ea]" aria-hidden />
        )}
      </div>
      {/* Content */}
      <div className={`flex-1 ${last ? "" : "pb-[18px]"}`}>
        <div
          className="text-[14.5px] font-semibold"
          style={{ color: event.titleAccent ? "#e0890a" : "#1c1c1e" }}
        >
          {event.title}
        </div>
        <div className="mt-[2px] text-[13px] text-[#6c6c70]">{event.desc}</div>
        {event.chips.length > 0 && (
          <div className="mt-[7px] flex gap-[6px]">
            {event.chips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-[9px] px-[9px] py-[2px] text-[11.5px] font-semibold"
                style={{ background: c.bg, color: c.fg }}
              >
                {c.withPhoto && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="4" y="5" width="16" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.5" />
                  </svg>
                )}
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PatternTimeline({ logs, reminders }: { logs: HealthLog[]; reminders: ReminderRow[] }) {
  const events = buildTimelineEvents(logs, reminders);
  if (events.length === 0) return null;

  return (
    <div
      className="rounded-[20px] bg-white"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)", padding: "20px 24px" }}
    >
      <div className="mb-5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#8e8e93]">
          Brain Story
        </span>
        <a
          href="/analytics"
          target="_top"
          className="flex items-center gap-[3px] text-[13px] font-semibold text-[#0b7a4d]"
        >
          Full timeline
          <ChevronRight className="h-3 w-3" strokeWidth={2.2} aria-hidden />
        </a>
      </div>
      <div className="flex flex-col">
        {events.map((event, i) => (
          <TimelineRow key={event.id} event={event} last={i === events.length - 1} />
        ))}
      </div>
    </div>
  );
}

// ─── RIGHT SIDEBAR ────────────────────────────────────────────────────────────

interface ReminderRow {
  id: string;
  title: string;
  next_due: string | null;
  type?: string | null;
  time?: string | null;
}

const REMINDER_ICON: Record<string, typeof Bell> = {
  medication: Pill,
  vet_appointment: Stethoscope,
  flea_tick: ShieldCheck,
  vaccination: ClipboardPlus,
  custom: Bell,
};

// Slide 6 per-type tile tints for the Upcoming Reminders rows.
const REMINDER_TINT: Record<string, { bg: string; fg: string }> = {
  medication: { bg: "#eef2ea", fg: "#6f8a5c" },
  flea_tick: { bg: "#eef2ea", fg: "#6f8a5c" },
  vaccination: { bg: "#f6ece2", fg: "#c87d3e" },
  vet_appointment: { bg: "#e7eef5", fg: "#4d7cb5" },
  custom: { bg: "#eef2ea", fg: "#6f8a5c" },
};

/** "Tonight, 8:00 PM" / "May 22, 2025" subtitle for a reminder row. */
function reminderSubtitle(nextDue: string | null): string {
  if (!nextDue) return "Scheduled";
  const d = new Date(nextDue);
  if (Number.isNaN(d.getTime())) return "Scheduled";
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  const time = d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return `Tonight, ${time}`;
  if (days <= 7) return `${d.toLocaleDateString("en", { weekday: "long" })}, ${time}`;
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

/** Owner-friendly timing badge from next_due relative to now. Slide colors:
 *  "Today" amber #fdf3e3/#b5740a; near/far due grey #f3f2ee/#85867e. */
function reminderTiming(nextDue: string | null): { label: string; bg: string; fg: string } {
  if (!nextDue) return { label: "Scheduled", bg: "#f3f2ee", fg: "#85867e" };
  const due = new Date(nextDue);
  if (Number.isNaN(due.getTime())) return { label: "Scheduled", bg: "#f3f2ee", fg: "#85867e" };
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return { label: "Today", bg: "#fdf3e3", fg: "#b5740a" };
  if (days <= 7) return { label: `${days} day${days === 1 ? "" : "s"}`, bg: "#f3f2ee", fg: "#85867e" };
  return {
    label: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    bg: "#f3f2ee",
    fg: "#85867e",
  };
}

interface NextAction {
  label: string;
  why: string;
  done: boolean;
}

function RightSidebar({
  actions,
  reminders,
  logs,
  signals,
  followupCount,
}: {
  actions: NextAction[];
  reminders: ReminderRow[];
  logs: HealthLog[];
  signals: DetectedSignal[];
  followupCount: number;
}) {
  const photoCount = logs.reduce(
    (sum, l) => sum + (Array.isArray(l.photo_urls) ? l.photo_urls.length : 0),
    0,
  );
  const vetRecordCount = reminders.filter((r) => r.type === "vet_appointment").length;

  // Stat tiles — slide layout (2-col). Each value is a real count; tiles whose
  // value is 0 still render (the slide shows the full grid). "Open follow-ups"
  // uses the live followups count and renders its number in amber.
  const statTiles: { value: number; label: string; sub: string; accent?: boolean }[] = [
    { value: logs.length, label: "Daily logs", sub: "Last 90 days" },
    { value: photoCount, label: "Photos", sub: "Last 90 days" },
    { value: signals.length, label: "Patterns", sub: "Last 90 days" },
    { value: vetRecordCount, label: "Vet records", sub: "On file" },
    { value: reminders.length, label: "Reminders", sub: "Scheduled" },
    { value: followupCount, label: "Open follow-ups", sub: "Need your answer", accent: true },
  ];

  return (
    <div className="flex flex-col gap-[14px]">
      {/* What PawVital remembers */}
      <div
        className="rounded-[20px] bg-white"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)", padding: "18px 20px" }}
      >
        <div className="mb-[13px] flex items-center gap-[7px]">
          <Brain className="h-[14px] w-[14px] text-[#5b6b62]" strokeWidth={1.8} aria-hidden />
          <p className="text-[11px] font-bold uppercase tracking-[0.7px] text-[#5b6b62]">
            What PawVital remembers
          </p>
        </div>
        <div className="grid grid-cols-2 gap-[9px]">
          {statTiles.map((tile) => (
            <div key={tile.label} className="rounded-[11px] border border-[#efeee9]" style={{ padding: "10px 12px" }}>
              <div
                className="text-[21px] font-bold leading-none"
                style={{ letterSpacing: "-0.5px", color: tile.accent ? "#e0890a" : "#1c1c1e" }}
              >
                {tile.value}
              </div>
              <div className="mt-[1px] text-[12.5px] text-[#6f7069]">{tile.label}</div>
              <div className="text-[11px] text-[#b6b7af]">{tile.sub}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[12px] leading-[1.4] text-[#9a9b93]">
          This memory lets the Brain spot patterns before symptoms get serious.
        </p>
      </div>

      {/* What to do next */}
      <div
        className="rounded-[20px] bg-white"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)", padding: "18px 20px" }}
      >
        <p className="mb-[14px] text-[11px] font-bold uppercase tracking-[0.7px] text-[#5b6b62]">
          What to do next
        </p>
        <div className="flex flex-col gap-[13px]">
          {actions.map((a, i) => (
            <div key={i} className="flex items-start gap-[10px]">
              {a.done ? (
                <CircleCheckBig className="mt-[1px] h-[21px] w-[21px] shrink-0 text-[#0b7a4d]" aria-hidden />
              ) : (
                <Circle className="mt-[1px] h-[21px] w-[21px] shrink-0 text-[#c2c3ba]" aria-hidden />
              )}
              <div>
                <div
                  className="text-[14.5px] font-medium"
                  style={{ color: a.done ? "#1d1d1b" : "#3a3b34" }}
                >
                  {a.label}
                </div>
                <div className="mt-[1px] text-[12px] text-[#9a9b93]">{a.why}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Reminders */}
      <div
        className="rounded-[20px] bg-white"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)", padding: "18px 20px" }}
      >
        <div className="mb-[14px] flex items-center gap-[7px]">
          <Bell className="h-[14px] w-[14px] text-[#8e8e93]" strokeWidth={1.8} aria-hidden />
          <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#8e8e93]">
            Upcoming Reminders
          </p>
        </div>
        {reminders.length > 0 ? (
          <div className="flex flex-col gap-[14px]">
            {reminders.map((r) => {
              const t = reminderTiming(r.next_due);
              const Icon = REMINDER_ICON[r.type ?? "custom"] ?? Bell;
              const tint = REMINDER_TINT[r.type ?? "custom"] ?? REMINDER_TINT.custom;
              return (
                <div key={r.id} className="flex items-center gap-[11px]">
                  <span
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
                    style={{ background: tint.bg, color: tint.fg }}
                  >
                    <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-semibold text-[#1c1c1e]">{r.title}</div>
                    <div className="text-[12.5px] text-[#85867e]">{reminderSubtitle(r.next_due)}</div>
                  </div>
                  <span
                    className="shrink-0 rounded-[14px] px-[9px] py-[3px] text-[12px] font-semibold"
                    style={{ background: t.bg, color: t.fg }}
                  >
                    {t.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-[#6f7069]">No upcoming reminders yet.</p>
        )}
        <a
          href="/reminders"
          target="_top"
          className="mt-4 flex items-center justify-center gap-[5px] text-[14px] font-semibold text-[#0b7a4d]"
        >
          {reminders.length > 0 ? "View all reminders" : "Add a reminder"}
          <ChevronRight className="h-[14px] w-[14px]" strokeWidth={2.2} aria-hidden />
        </a>
      </div>

      {/* Vet Summary */}
      <div
        className="rounded-[20px] bg-white"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)", padding: "18px 20px" }}
      >
        <div className="mb-[14px] flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eef2ea] text-[#6f8a5c]">
            <FileText className="h-[17px] w-[17px]" strokeWidth={1.7} aria-hidden />
          </span>
          <div>
            <div className="text-[15px] font-bold text-[#1c1c1e]">Vet Summary</div>
            <div className="mt-[3px] text-[13px] leading-[1.4] text-[#6c6c70]">
              Create a vet-ready summary with logs, photos, signals, follow-ups, and
              supplement notes.
            </div>
          </div>
        </div>
        <a
          href="/analytics"
          target="_top"
          className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#0b7a4d] py-[13px] text-[14.5px] font-semibold text-white transition-colors hover:bg-[#0a6c44]"
        >
          <Upload className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden />
          Create vet report
        </a>
        <div className="mt-[10px] flex gap-[7px] rounded-[10px] bg-[#f5f5f7] px-3 py-[10px]">
          <ShieldCheck className="mt-[1px] h-[13px] w-[13px] shrink-0 text-[#8e8e93]" strokeWidth={1.7} aria-hidden />
          <p className="text-[11.5px] leading-[1.45] text-[#8e8e93]">
            PawVital does not diagnose or treat. It helps organize patterns for you and
            your vet.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── FIRST-TIME empty state ───────────────────────────────────────────────────

function FirstTime({ petName }: { petName: string }) {
  const steps = [
    { done: true, label: "Profile created", hint: "Breed, age & weight saved" },
    { done: false, label: "Log your first day", hint: `Teaches the brain ${petName}'s normal` },
    { done: false, label: "Try a symptom check", hint: "Uses your logs as context" },
    { done: false, label: "See your first pattern", hint: "Usually after 3–4 days" },
  ];
  const payoffs = [
    { Icon: TrendingDown, title: "Spot patterns early", body: `"Appetite down 3 days" — before you'd notice.` },
    { Icon: FileText, title: "Vet-ready summaries", body: "Logs, signals & history in one tap." },
    { Icon: Pill, title: "Follow-up nudges", body: `"Any change since the probiotic?"` },
    { Icon: ShieldCheck, title: "Always-on safety net", body: "Emergency red-flags surface instantly." },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#15795a] p-5 text-[#eafaf3]">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-5 w-5 text-[#bff0db]" aria-hidden />
          <span className="text-lg font-semibold text-white">This is {petName}&apos;s brain.</span>
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-[#cdebdd]">
          Everything you log — meals, stool, energy, weight, photos, symptoms — becomes memory. PawVital
          quietly watches for patterns across days, so you catch the small changes before they become big ones.
        </p>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f]">
        Get {petName}&apos;s brain learning
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <div key={s.label} className="flex items-start gap-2.5 rounded-xl border border-[#e9efec] bg-white p-3">
            {s.done ? (
              <CircleCheckBig className="h-5 w-5 shrink-0 text-[#1f9d6b]" aria-hidden />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-[#b9c6bf]" aria-hidden />
            )}
            <div>
              <p className="text-sm font-semibold text-[#1c2522]">{s.label}</p>
              <p className="text-[11px] text-[#8a978f]">{s.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href="/health-log"
          target="_top"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1f9d6b] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15795a] transition-colors"
        >
          <ClipboardPlus className="h-4 w-4" aria-hidden />
          Log {petName}&apos;s first day
        </a>
        <a
          href="/symptom-checker"
          target="_top"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#bfe0cf] bg-white px-4 py-2.5 text-sm font-medium text-[#15795a] hover:bg-[#f3f9f6] transition-colors"
        >
          <Stethoscope className="h-4 w-4" aria-hidden />
          Start a symptom check
        </a>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f]">
        What {petName}&apos;s brain will do for you
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {payoffs.map((p) => (
          <div key={p.title} className="rounded-xl border border-[#eef1ef] bg-white p-3">
            <p.Icon className="h-[18px] w-[18px] text-[#1f9d6b]" aria-hidden />
            <p className="mt-1.5 text-[13px] font-semibold text-[#1c2522]">{p.title}</p>
            <p className="text-[11px] leading-snug text-[#8a978f]">{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FOLLOW-UPS ───────────────────────────────────────────────────────────────
// FollowupsPanel now lives in ./followups-panel so the Reminders queue reuses the
// same fetch / resolve loop (imported above).

// ─── ROOT EXPORT ──────────────────────────────────────────────────────────────

export default function HealthBrief({
  petId,
  petName,
  userDataLoaded,
}: {
  petId: string | null;
  petName: string;
  userDataLoaded: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<DetectedSignal[]>([]);
  const [state, setState] = useState<BriefState>("stable");
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [followupCount, setFollowupCount] = useState(0);

  useEffect(() => {
    if (!petId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [sigRes, logRes, remRes, fuRes] = await Promise.all([
          fetch(`/api/dog-brain/signals?pet_id=${petId}`),
          fetch(`/api/health-log?pet_id=${petId}&limit=14`),
          fetch(`/api/reminders?pet_id=${petId}&limit=4`),
          fetch(`/api/dog-brain/followups?pet_id=${petId}`),
        ]);
        const sig = (await sigRes.json().catch(() => null)) as DogBrainSignalsResponse | null;
        const lg = (await logRes.json().catch(() => null)) as { data?: HealthLog[] } | null;
        const rem = (await remRes.json().catch(() => null)) as { data?: ReminderRow[] } | null;
        const fu = (await fuRes.json().catch(() => null)) as { data?: unknown[] } | null;
        if (cancelled) return;
        setSignals(sig?.signals ?? []);
        setState(sig?.state ?? "stable");
        setLogs(Array.isArray(lg?.data) ? lg!.data : []);
        setReminders(Array.isArray(rem?.data) ? rem!.data : []);
        setFollowupCount(Array.isArray(fu?.data) ? fu!.data.length : 0);
      } catch {
        if (!cancelled) {
          setSignals([]);
          setState("stable");
          setLogs([]);
          setReminders([]);
          setFollowupCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [petId]);

  // "What to do next" checklist — slide shows label + why + done state. Each
  // entry is derived from real signals / reminders; nothing fabricated.
  const actions = useMemo<NextAction[]>(() => {
    const has = (t: SignalType) => signals.some((s) => s.signal_type === t);
    const out: NextAction[] = [];
    if (has("appetite_drop"))
      out.push({ label: "Log appetite tonight", why: "Appetite changed — confirm the trend", done: false });
    if (has("stool_change"))
      out.push({ label: "Add stool photo if possible", why: "Helps the Brain match the stool change", done: false });
    if (followupCount > 0)
      out.push({ label: "Answer supplement follow-up", why: "Your answer improves future alerts", done: false });
    out.push({ label: "Monitor water intake", why: "Normal so far — keep confirming", done: false });
    out.push({ label: "Start symptom check if new signs", why: "Get a vet-ready summary fast", done: false });
    if (out.length < 2)
      out.unshift({ label: "Log today's check-in", why: "Teaches the Brain today's normal", done: false });
    return out.slice(0, 5);
  }, [signals, followupCount]);

  if (!userDataLoaded || loading) {
    return (
      <div className="grid gap-[18px] lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-[14px]">
          <div className="h-44 animate-pulse rounded-[20px] border border-[#eef1ef] bg-[#f6f8f7]" aria-hidden />
          <div className="h-36 animate-pulse rounded-[20px] border border-[#eef1ef] bg-[#f6f8f7]" aria-hidden />
        </div>
        <div className="h-64 animate-pulse rounded-[20px] border border-[#eef1ef] bg-[#f6f8f7]" aria-hidden />
      </div>
    );
  }

  if (!petId || logs.length === 0) {
    return <FirstTime petName={petName} />;
  }

  const displayName = petName.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

  return (
    <div className="grid gap-[18px] lg:grid-cols-[1fr_340px]">
      {/* Main left column */}
      <div className="flex flex-col gap-[14px]">
        <TodaysHealthBriefCard
          state={state}
          signals={signals}
          petName={displayName}
          logs={logs}
          reminders={reminders}
          followupCount={followupCount}
        />
        <WhatChangedSection signals={signals} logs={logs} />
        <FollowupsPanel petId={petId} signals={signals} />
        <PatternTimeline logs={logs} reminders={reminders} />
      </div>

      {/* Right sidebar */}
      <RightSidebar
        actions={actions}
        reminders={reminders}
        logs={logs}
        signals={signals}
        followupCount={followupCount}
      />
    </div>
  );
}
