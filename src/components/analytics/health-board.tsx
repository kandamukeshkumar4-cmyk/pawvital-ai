"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  Check,
  ClipboardList,
  Copy,
  FileText,
  HeartPulse,
  ListChecks,
  Minus,
  NotebookPen,
  Pill,
  ShieldCheck,
  Stethoscope,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import type { OwnerVerdict, OwnerVerdictState } from "@/lib/analytics/owner-readout";
import type {
  ChangedSignal,
  ChangeDirection,
  EvidenceCounts,
  HealthBoardModel,
  LogNextItem,
  NextBestLog,
  SignalGridModel,
  SignalTone,
  TimelineEvent,
  TimelineSource,
  TrendCard,
  VetPacketModel,
} from "@/lib/analytics/health-board";

/* ------------------------------------------------------------------ tokens */

const TONE_DOT: Record<SignalTone, string> = {
  good: "#00a878",
  watch: "#e0a458",
  alert: "#e25c5c",
  info: "#4d8bd4",
  muted: "#d6cfc4",
};
const TONE_TEXT: Record<SignalTone, string> = {
  good: "#0a7d5b",
  watch: "#9a6b1f",
  alert: "#b23636",
  info: "#2f6aa8",
  muted: "#8a857a",
};
const TONE_SOFT_BG: Record<SignalTone, string> = {
  good: "rgba(0,168,120,0.10)",
  watch: "rgba(224,164,88,0.16)",
  alert: "rgba(226,92,92,0.12)",
  info: "rgba(77,139,212,0.12)",
  muted: "rgba(0,0,0,0.04)",
};

const CARD = "rounded-2xl border border-[#e8e2d8] bg-white";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-[#8a857a]";

/* ----------------------------------------------------------- copy control */

function CopyButton({
  text,
  idleLabel,
  doneLabel = "Copied",
  className,
}: {
  text: string;
  idleLabel: string;
  doneLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-live="polite"
      className={
        className ??
        `${buttonClassName({ variant: "warmOutline", size: "sm" })} border-[#cfe6dd] bg-white text-[#0a7d5b] hover:bg-[#f2faf7]`
      }
    >
      {copied ? (
        <Check className="mr-2 h-4 w-4" aria-hidden />
      ) : (
        <Copy className="mr-2 h-4 w-4" aria-hidden />
      )}
      {copied ? doneLabel : idleLabel}
    </button>
  );
}

/* --------------------------------------------------------- 1. decision card */

const STATE_ICON: Record<OwnerVerdictState, typeof HeartPulse> = {
  watch: ShieldCheck,
  schedule: HeartPulse,
  urgent: AlertCircle,
  emergency: AlertTriangle,
};

const STATE_BADGE: Record<OwnerVerdictState, { label: string; tone: SignalTone }> = {
  watch: { label: "Stable", tone: "good" },
  schedule: { label: "Keep watch", tone: "watch" },
  urgent: { label: "Serious", tone: "alert" },
  emergency: { label: "Urgent", tone: "alert" },
};

export function DecisionCard({
  verdict,
  petName,
  lastCheckedLabel,
  vetCopyText,
}: {
  verdict: OwnerVerdict;
  petName: string;
  lastCheckedLabel: string | null;
  vetCopyText: string;
}) {
  const badge = STATE_BADGE[verdict.state];
  const Icon = STATE_ICON[verdict.state];
  const accent = TONE_DOT[badge.tone];

  return (
    <section
      className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"
      style={{ borderColor: TONE_DOT[badge.tone], background: TONE_SOFT_BG[badge.tone] }}
      aria-label="Current recommendation"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "rgba(255,255,255,0.7)", color: accent }}
          >
            <Icon className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.8)", color: TONE_TEXT[badge.tone] }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
              {badge.label}
            </span>
            <h2 className="mt-2 text-2xl font-bold text-[#2c2a26] sm:text-[26px]">
              {verdict.headline}
            </h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-[#6b665d]">
              {verdict.subline}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:items-end">
          {lastCheckedLabel ? (
            <div className="sm:text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#8a857a]">
                Last checked
              </p>
              <p className="text-sm text-[#4a463f]">{lastCheckedLabel}</p>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/symptom-checker"
              className={buttonClassName({ size: "sm" })}
              style={
                verdict.emergency
                  ? { background: "#e25c5c", borderColor: "#e25c5c" }
                  : { background: "#0a7d5b", borderColor: "#0a7d5b" }
              }
            >
              <Stethoscope className="mr-2 h-4 w-4" aria-hidden />
              {verdict.state === "watch" ? "Start a check" : "Start follow-up check"}
            </Link>
            <CopyButton text={vetCopyText} idleLabel="Copy vet summary" doneLabel="Copied" />
          </div>
        </div>
      </div>

      {verdict.emergency ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm"
          style={{ background: "rgba(226,92,92,0.12)", color: "#b23636" }}
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>
            If {petName} is struggling to breathe, collapsed, bleeding heavily, or having
            repeated seizures, contact an emergency vet right away.
          </span>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------ 2. insight tiles */

function ChangeArrow({ arrow, tone }: { arrow: ChangedSignal["arrow"]; tone: SignalTone }) {
  const color = TONE_TEXT[tone];
  if (arrow === "down") return <ArrowDownRight className="h-3.5 w-3.5" style={{ color }} aria-hidden />;
  if (arrow === "up") return <ArrowUpRight className="h-3.5 w-3.5" style={{ color }} aria-hidden />;
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: TONE_DOT[tone] }} aria-hidden />;
}

function ChangedFromNormalTile({ items }: { items: ChangedSignal[] }) {
  return (
    <div className={`${CARD} flex flex-col p-4`}>
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-[#0a7d5b]" aria-hidden />
        <p className={LABEL}>Changed from normal</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-[#6b665d]">
          Nothing off normal in the latest log. Keep checking in to stay ahead of changes.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 4).map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-2">
              <span className="text-sm text-[#4a463f]">{item.label}</span>
              <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: TONE_TEXT[item.tone] }}>
                <ChangeArrow arrow={item.arrow} tone={item.tone} />
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/health-log" className="mt-auto pt-3 text-sm font-medium text-[#0a7d5b] hover:underline">
        See full details →
      </Link>
    </div>
  );
}

function EvidenceTile({ evidence }: { evidence: EvidenceCounts }) {
  const rows: { label: string; count: number }[] = [
    { label: "Symptom checks", count: evidence.symptomChecks },
    { label: "Daily logs", count: evidence.dailyLogs },
    { label: "Photos", count: evidence.photos },
  ];
  return (
    <div className={`${CARD} flex flex-col p-4`}>
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#7c4dc4]" aria-hidden />
        <p className={LABEL}>Vet-ready evidence</p>
      </div>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
              style={{
                background: r.count > 0 ? "rgba(0,168,120,0.12)" : "rgba(0,0,0,0.04)",
                color: r.count > 0 ? "#0a7d5b" : "#a8a097",
              }}
            >
              {r.count}
            </span>
            <span className="text-sm text-[#4a463f]">{r.label}</span>
          </li>
        ))}
      </ul>
      <Link href="/history" className="mt-auto pt-3 text-sm font-medium text-[#0a7d5b] hover:underline">
        View timeline →
      </Link>
    </div>
  );
}

function NextBestLogTile({ next }: { next: NextBestLog }) {
  return (
    <div className={`${CARD} flex flex-col p-4`}>
      <div className="flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-[#0a7d5b]" aria-hidden />
        <p className={LABEL}>Next best log</p>
      </div>
      <p className="mt-3 text-base font-semibold leading-snug text-[#2c2a26]">
        {next.title} {next.when}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[#6b665d]">{next.detail}</p>
      <Link
        href="/health-log"
        className={`${buttonClassName({ variant: "outline", size: "sm" })} mt-auto inline-flex w-fit border-[#cfe6dd] text-[#0a7d5b]`}
        style={{ marginTop: "0.75rem" }}
      >
        Log now
      </Link>
    </div>
  );
}

export function InsightTiles({ board }: { board: HealthBoardModel }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <ChangedFromNormalTile items={board.changedFromNormal} />
      <EvidenceTile evidence={board.evidence} />
      <NextBestLogTile next={board.nextBestLog} />
    </div>
  );
}

/* ---------------------------------------------------------- emoji face helpers */

const TONE_EMOJI: Record<SignalTone, string> = {
  good: "😊",
  watch: "😐",
  alert: "😣",
  info: "💧",
  muted: "—",
};

/* --------------------------------------------------------------- 3. signal grid */

function ChangeBadge({ change }: { change: ChangeDirection }) {
  if (change === "worse") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: TONE_TEXT.alert }}>
        <TrendingDown className="h-3.5 w-3.5" aria-hidden /> Worse
      </span>
    );
  }
  if (change === "better") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: TONE_TEXT.good }}>
        <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Better
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#a8a097]">
      <Minus className="h-3.5 w-3.5" aria-hidden /> No change
    </span>
  );
}

export function SignalGrid({ grid }: { grid: SignalGridModel }) {
  if (!grid.hasData) {
    return (
      <section className={`${CARD} p-5`}>
        <p className={LABEL}>7-day signal grid</p>
        <p className="mt-3 text-sm leading-relaxed text-[#6b665d]">
          No daily logs yet this week. A 30-second daily log fills this grid so you can see
          whether each signal is steady or changing.
        </p>
        <Link href="/health-log" className="mt-3 inline-block text-sm font-medium text-[#0a7d5b] hover:underline">
          Log today&apos;s check-in →
        </Link>
      </section>
    );
  }

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="border-b border-[#f0ebe2] px-5 py-4">
        <p className={LABEL}>7-day signal grid</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-[#8a857a]">
              <th className="px-4 py-2 text-left text-xs font-semibold">Signal</th>
              {grid.days.map((d) => (
                <th key={d.date} className="px-2 py-2 text-center text-xs font-medium">
                  <div>{d.weekday}</div>
                  <div className={d.isToday ? "font-semibold text-[#2c2a26]" : "text-[#a8a097]"}>
                    {d.isToday ? "Today" : d.monthDay}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.key} className="border-t border-[#f4efe7]">
                <td className="px-4 py-2.5 text-left font-medium text-[#4a463f]">{row.label}</td>
                {row.cells.map((cell) => (
                  <td key={cell.date} className="px-2 py-2.5 text-center">
                    {cell.logged ? (
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <span className="text-base leading-none" title={cell.label}>
                          {TONE_EMOJI[cell.tone]}
                        </span>
                        <span
                          className="text-[10px] leading-none font-medium"
                          style={{ color: TONE_TEXT[cell.tone] }}
                        >
                          {cell.label}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[#d6cfc4] text-base">—</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right">
                  <ChangeBadge change={row.change} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ 4. pattern timeline */

const SOURCE_META: Record<
  TimelineSource,
  { label: string; icon: typeof Activity; tone: SignalTone }
> = {
  symptom_check: { label: "Symptom Check", icon: Stethoscope, tone: "alert" },
  daily_log: { label: "Daily Log", icon: ClipboardList, tone: "good" },
  journal: { label: "Journal", icon: NotebookPen, tone: "muted" },
  medication: { label: "Meds", icon: Pill, tone: "info" },
  photo: { label: "Photo", icon: Camera, tone: "muted" },
};

export function PatternTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;
  // Oldest → newest reads left-to-right like a story.
  const ordered = [...events].reverse();

  return (
    <section className={`${CARD} p-5`}>
      <p className={LABEL}>Pattern timeline</p>
      <div className="mt-4 overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-3">
          {ordered.map((ev, i) => {
            const meta = SOURCE_META[ev.source];
            const Icon = meta.icon;
            return (
              <div key={`${ev.date}-${ev.source}-${i}`} className="flex w-40 shrink-0 flex-col items-center text-center">
                <span className="text-[11px] font-medium text-[#a8a097]">{ev.monthDay}</span>
                <div className="mt-1.5 flex w-full items-center">
                  <span className="h-px flex-1" style={{ background: i === 0 ? "transparent" : "#e8e2d8" }} />
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full border"
                    style={{ background: TONE_SOFT_BG[ev.tone], borderColor: TONE_DOT[ev.tone], color: TONE_TEXT[ev.tone] }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="h-px flex-1" style={{ background: i === ordered.length - 1 ? "transparent" : "#e8e2d8" }} />
                </div>
                <p className="mt-2 text-sm font-semibold text-[#2c2a26]">{ev.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-[#6b665d]">{ev.detail}</p>
                <span
                  className="mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: TONE_SOFT_BG[meta.tone], color: TONE_TEXT[meta.tone] }}
                >
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- 5. trend cards */

function Sparkline({ card }: { card: TrendCard }) {
  return (
    <div className="mt-3 flex h-16 items-end gap-1">
      {card.points.map((p) => (
        <span
          key={p.date}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.max(6, Math.round(p.magnitude * 100))}%`,
            background: p.empty ? "#efeae1" : TONE_DOT[p.tone],
            minWidth: 3,
          }}
          title={`${p.date}: ${p.label}`}
          aria-hidden
        />
      ))}
    </div>
  );
}

function WeightLine({ card }: { card: TrendCard }) {
  const pts = card.points;
  const width = 100;
  const height = 40;
  const usable = pts.filter((p) => !p.empty);
  const coords = pts.map((p, i) => {
    const x = pts.length > 1 ? (i / (pts.length - 1)) * width : 0;
    const y = height - p.magnitude * height;
    return { x, y, empty: p.empty };
  });
  const line = coords
    .filter((c) => !c.empty)
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="mt-3 h-16">
      {usable.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-[#a8a097]">
          No weight logged
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <path d={line} fill="none" stroke="#00a878" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {coords
            .filter((c) => !c.empty)
            .map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={1.8} fill="#00a878" />
            ))}
        </svg>
      )}
    </div>
  );
}

function TrendCardView({ card }: { card: TrendCard }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#2c2a26]">{card.label}</p>
        <span
          className="text-xs font-medium"
          style={{
            color:
              card.change === "worse"
                ? TONE_TEXT.alert
                : card.change === "better"
                  ? TONE_TEXT.good
                  : "#a8a097",
          }}
        >
          {card.changeLabel}
        </span>
      </div>
      {card.isMeasure ? <WeightLine card={card} /> : <Sparkline card={card} />}
      <p className="mt-2 text-xs text-[#6b665d]">{card.caption}</p>
    </div>
  );
}

export function TrendCards({ cards }: { cards: TrendCard[] }) {
  const hasAny = cards.some((c) => c.points.some((p) => !p.empty));
  if (!hasAny) return null;
  return (
    <section>
      <p className={`${LABEL} mb-2 px-1`}>Trends this week</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <TrendCardView key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- 6. vet packet */

export function VetPacketPanel({
  packet,
  petName,
}: {
  packet: VetPacketModel;
  petName: string;
}) {
  return (
    <section className={`${CARD} bg-[#faf8f5] p-5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#7c4dc4]" aria-hidden />
          <p className={LABEL}>What to tell the vet</p>
        </div>
        <CopyButton text={packet.copyText} idleLabel="Copy" doneLabel="Copied" />
      </div>
      <ul className="mt-3 space-y-2">
        {packet.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#0a7d5b]" aria-hidden />
            <span className="text-sm leading-relaxed text-[#4a463f]">{b}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs italic text-[#8a857a]">{packet.basedOn}</p>
      <span className="sr-only">Summary for {petName}</span>
    </section>
  );
}

/* ----------------------------------------------------------- 7. log-next list */

export function LogNextChecklist({ items }: { items: LogNextItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className={`${CARD} p-5`}>
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[#0a7d5b]" aria-hidden />
        <p className={LABEL}>What to log next</p>
      </div>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.label} className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[#cfc8bb]"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-[#2c2a26]">{item.label}</p>
                <p className="text-xs text-[#8a857a]">{item.why}</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-[rgba(224,164,88,0.16)] px-2 py-0.5 text-[11px] font-medium text-[#9a6b1f]">
              {item.when}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
