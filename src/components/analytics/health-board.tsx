"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bone,
  Camera,
  ChevronRight,
  Circle,
  ClipboardList,
  Droplet,
  Frown,
  Info,
  Meh,
  NotebookPen,
  Pill,
  Smile,
  Stethoscope,
  Utensils,
  Weight,
  Zap,
} from "lucide-react";
import type { OwnerVerdict } from "@/lib/analytics/owner-readout";
import type {
  ChangedSignal,
  HealthBoardModel,
  LogNextItem,
  SignalCell,
  SignalGridModel,
  SignalTone,
  TimelineEvent,
  TimelineSource,
  TrendCard,
  VetPacketModel,
} from "@/lib/analytics/health-board";

/* ------------------------------------------------------------------ tokens
 * Exact hex values from the design slide (PawVital AI - Standalone.html,
 * Health Signals screen). Good / Watch / Alert / No-data state colors.
 */
const STATE = {
  good: "#15a06a",
  watch: "#e0890a",
  alert: "#d64545",
  noData: "#c8c9c0",
} as const;

/* ----------------------------------------------------------- copy control */

/** Two-line outline "Copy vet summary" button matching the slide. */
function CopyVetSummaryButton({ text }: { text: string }) {
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
      className="flex w-full flex-col items-center"
      style={{
        marginTop: 13,
        background: "#fff",
        border: "1px solid #bfe2cf",
        color: "#0b7a4d",
        borderRadius: 11,
        padding: 9,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>{copied ? "Copied" : "Copy vet summary"}</span>
      <span style={{ fontSize: 12, color: "#6f8f7c", marginTop: 1 }}>
        Includes logs, signals &amp; recommendations
      </span>
    </button>
  );
}

/* --------------------------------------------------------- 1. decision card
 * The slide does not carry a separate decision banner — the verdict is
 * represented by the OVERALL STATUS STRIP (rendered in page.tsx). This card is
 * kept only for the emergency safety call-out path so urgent guidance is never
 * lost; for non-emergency states it renders nothing.
 */
export function DecisionCard({
  verdict,
  petName,
}: {
  verdict: OwnerVerdict;
  petName: string;
  lastCheckedLabel: string | null;
  vetCopyText: string;
}) {
  if (!verdict.emergency) return null;
  return (
    <section
      className="flex items-start gap-2.5 rounded-[14px] px-4 py-3.5 text-sm"
      style={{ background: "rgba(214,69,69,0.10)", color: "#b23636", border: "1px solid #f0c9c9" }}
      role="alert"
      aria-label="Emergency guidance"
    >
      <Stethoscope className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <span style={{ lineHeight: 1.55 }}>
        If {petName} is struggling to breathe, collapsed, bleeding heavily, or having repeated
        seizures, contact an emergency vet right away.
      </span>
    </section>
  );
}

/* ------------------------------------------------------------ 2. insight tiles
 * The slide folds these into the left column and right rail; InsightTiles is
 * no longer rendered as a standalone row. Kept as a no-op so existing imports
 * stay valid.
 */
export function InsightTiles(_: { board: HealthBoardModel }) {
  return null;
}

/* --------------------------------------------------------------- 3. signal grid
 * "14-DAY SIGNAL GRID" card. 96px label gutter + 15 evenly-flexed day columns.
 * Cell glyphs from the slide: good = smile #1aa06a, watch = meh #e0890a,
 * weight-down = down arrow / weight-flat = right arrow #e0890a, no data = "—".
 */

const GRID_COLS = [
  "14d ago", "13d ago", "12d ago", "11d ago", "10d ago", "9d ago", "8d ago",
  "7d ago", "6d ago", "5d ago", "4d ago", "3d ago", "2d ago", "1d ago", "Today",
];

const GRID_LEGEND: { label: string; color: string }[] = [
  { label: "Good", color: STATE.good },
  { label: "Watch", color: STATE.watch },
  { label: "Alert", color: STATE.alert },
  { label: "No data", color: STATE.noData },
];

const GRID_ROW_ICON: Record<string, typeof Utensils> = {
  appetite: Utensils,
  water: Droplet,
  stool: Bone,
  urination: Droplet,
  vomiting: Meh,
  energy: Zap,
  weight: Weight,
  medication: Pill,
};

function GridCellGlyph({ cell, signalKey }: { cell: SignalCell; signalKey: string }) {
  if (!cell.logged) {
    return <span style={{ color: STATE.noData, fontSize: 13 }}>—</span>;
  }
  // Weight is shown as a directional arrow rather than a face.
  if (signalKey === "weight") {
    const color = cell.tone === "good" ? STATE.good : STATE.watch;
    if (cell.tone === "good") {
      return <ArrowRight className="h-[15px] w-[15px]" style={{ color }} strokeWidth={2.2} aria-hidden />;
    }
    return <ArrowDownRight className="h-[15px] w-[15px]" style={{ color }} strokeWidth={2.2} aria-hidden />;
  }
  if (cell.tone === "good") {
    return <Smile className="h-[17px] w-[17px]" style={{ color: "#1aa06a" }} strokeWidth={1.8} aria-hidden />;
  }
  if (cell.tone === "watch") {
    return <Meh className="h-[17px] w-[17px]" style={{ color: STATE.watch }} strokeWidth={1.8} aria-hidden />;
  }
  if (cell.tone === "alert") {
    return <Frown className="h-[17px] w-[17px]" style={{ color: STATE.alert }} strokeWidth={1.8} aria-hidden />;
  }
  // info / muted (e.g. medication) — neutral dash so we never invent a face.
  return <span style={{ color: STATE.noData, fontSize: 13 }}>—</span>;
}

const PREVIEW_ROWS: { key: string; label: string; tones: SignalTone[] }[] = [
  { key: "appetite", label: "Appetite", tones: ["good", "good", "watch", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good"] },
  { key: "water", label: "Water", tones: Array<SignalTone>(15).fill("good") },
  { key: "stool", label: "Stool", tones: ["good", "watch", "alert", "watch", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good"] },
  { key: "energy", label: "Energy", tones: ["good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "good", "watch", "good"] },
];

function GridShell({
  rows,
  preview = false,
}: {
  rows: { key: string; label: string; cells: SignalCell[] }[];
  preview?: boolean;
}) {
  return (
    <div style={{ borderRadius: 16, border: "1px solid #ebeae5", background: "#fff", padding: "20px 22px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.6px",
            color: "#0b7a4d",
            textTransform: "uppercase",
          }}
        >
          14-day signal grid
        </span>
        {preview ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.6px",
              textTransform: "uppercase",
              color: "#0b7a4d",
              background: "rgba(11,122,77,0.10)",
              borderRadius: 999,
              padding: "3px 9px",
            }}
          >
            Preview — example
          </span>
        ) : (
          <div className="flex items-center" style={{ gap: 14, fontSize: 12, color: "#6f7069" }}>
            {GRID_LEGEND.map((l) => (
              <span key={l.label} className="flex items-center" style={{ gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {preview ? (
        <p style={{ fontSize: 13, color: "#85867e", marginBottom: 14 }}>
          PREVIEW — log ~14 days and your grid fills in with real check-ins.
        </p>
      ) : null}

      {/* Column header: 96px gutter + 15 evenly-flexed day labels. */}
      <div className="flex" style={{ marginBottom: 4 }}>
        <div style={{ width: 96, flex: "none" }} />
        <div className="flex" style={{ flex: 1 }}>
          {GRID_COLS.map((c) => (
            <div key={c} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#9a9b93" }}>
              {c}
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden={preview} style={preview ? { opacity: 0.55 } : undefined}>
        {rows.map((row) => {
          const Icon = GRID_ROW_ICON[row.key] ?? Utensils;
          return (
            <div key={row.key} className="flex items-center" style={{ borderTop: "1px solid #f3f2ed" }}>
              <div
                className="flex items-center"
                style={{ width: 96, flex: "none", gap: 7, color: "#5b5c54", fontSize: 13, fontWeight: 500 }}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden />
                {row.label}
              </div>
              <div className="flex" style={{ flex: 1 }}>
                {row.cells.map((cell, i) => (
                  <div
                    key={`${row.key}-${cell.date}-${i}`}
                    className="flex items-center justify-center"
                    style={{ flex: 1, height: 32 }}
                    title={cell.logged ? cell.label : "No data"}
                  >
                    <GridCellGlyph cell={cell} signalKey={row.key} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SignalGrid({ grid }: { grid: SignalGridModel }) {
  if (!grid.hasData) {
    // Sparse/new user: real grid is all em-dash, so show a clearly-labeled
    // preview built from example tones (never persisted as real data).
    const previewCells = (tones: SignalTone[]): SignalCell[] =>
      tones.map((t, i) => ({ date: `preview-${i}`, label: "Example", tone: t, logged: true }));
    const rows = PREVIEW_ROWS.map((r) => ({ key: r.key, label: r.label, cells: previewCells(r.tones) }));
    return (
      <div className="flex flex-col" style={{ gap: 12 }}>
        <GridShell rows={rows} preview />
        <Link
          href="/health-log"
          className="inline-flex w-fit items-center"
          style={{ gap: 5, color: "#0b7a4d", fontSize: 14, fontWeight: 600 }}
        >
          Log today&apos;s check-in
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
        </Link>
      </div>
    );
  }

  const rows = grid.rows.map((r) => ({ key: r.key, label: r.label, cells: r.cells }));
  return <GridShell rows={rows} />;
}

/* ------------------------------------------------------------ 4. pattern timeline
 * "PATTERN TIMELINE" card. Each row: 36px tinted icon tile (per source) +
 * 100px date/source column + 64px time column + flex description +
 * right-aligned category chips.
 */

const SOURCE_META: Record<
  TimelineSource,
  { label: string; icon: typeof ClipboardList; bg: string; color: string }
> = {
  daily_log: { label: "Daily log", icon: ClipboardList, bg: "#f6f3ee", color: "#8a6a3c" },
  symptom_check: { label: "Symptom check", icon: Stethoscope, bg: "#eaf3ee", color: "#0b7a4d" },
  journal: { label: "Journal", icon: NotebookPen, bg: "#f3f2ee", color: "#6f7069" },
  medication: { label: "Supplement", icon: Pill, bg: "#e7eef5", color: "#4d7cb5" },
  photo: { label: "Photo", icon: Camera, bg: "#eef2ea", color: "#6f8a5c" },
};

// Category chip palette (slide-exact tints).
const CATEGORY_CHIP: Record<string, { bg: string; color: string }> = {
  Appetite: { bg: "#f6ddd0", color: "#b06a3a" },
  Stool: { bg: "#ece2cf", color: "#8a6a3c" },
  Energy: { bg: "#f6ecd2", color: "#9a7a1c" },
  Water: { bg: "#dde7f1", color: "#4d7cb5" },
  Urination: { bg: "#dde7f1", color: "#4d7cb5" },
  Vomiting: { bg: "#f6ddd0", color: "#b06a3a" },
  Photo: { bg: "#dde7f1", color: "#4d7cb5" },
  Supplement: { bg: "#dde7f1", color: "#4d7cb5" },
  Medication: { bg: "#dde7f1", color: "#4d7cb5" },
  Note: { bg: "#e6e4de", color: "#6f7069" },
  Check: { bg: "#eaf3ee", color: "#0b7a4d" },
};

/** Derive small category chips for a timeline event from its source/tone. */
function chipsFor(ev: TimelineEvent): string[] {
  switch (ev.source) {
    case "photo":
      return ["Photo"];
    case "medication":
      return ["Supplement"];
    case "journal":
      return ["Note"];
    case "symptom_check":
      return ["Check"];
    case "daily_log":
    default: {
      // Pull category words straight from the headline the model built.
      const d = ev.detail.toLowerCase();
      const cats: string[] = [];
      if (d.includes("appetite")) cats.push("Appetite");
      if (d.includes("stool")) cats.push("Stool");
      if (d.includes("energy")) cats.push("Energy");
      if (d.includes("vomit")) cats.push("Vomiting");
      if (d.includes("water") || d.includes("drink")) cats.push("Water");
      if (d.includes("urin")) cats.push("Urination");
      return cats;
    }
  }
}

/** "8:15 AM" from an ISO timestamp, or "" when only a date is known. */
function timeOf(dateStr: string): string {
  if (dateStr.length <= 10) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

export function PatternTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div style={{ borderRadius: 16, border: "1px solid #ebeae5", background: "#fff", padding: "20px 22px" }}>
      <div style={{ marginBottom: 16 }}>
        <div className="flex flex-wrap items-center justify-between" style={{ gap: 10 }}>
          <div>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.6px",
                color: "#0b7a4d",
                textTransform: "uppercase",
              }}
            >
              Pattern timeline
            </span>
            <span style={{ fontSize: 13, color: "#9a9b93", marginLeft: 10 }}>
              Chronological story of what&apos;s been logged.
            </span>
          </div>
          <div className="flex" style={{ gap: 10 }}>
            <span
              className="flex items-center"
              style={{
                gap: 7,
                background: "#fff",
                border: "1px solid #e3e2dd",
                borderRadius: 9,
                padding: "7px 12px",
                fontSize: 13,
                color: "#3a3b34",
              }}
            >
              All sources ▾
            </span>
            <span
              className="flex items-center"
              style={{
                gap: 7,
                background: "#fff",
                border: "1px solid #e3e2dd",
                borderRadius: 9,
                padding: "7px 12px",
                fontSize: 13,
                color: "#3a3b34",
              }}
            >
              Last 90 days ▾
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        {events.map((ev, i) => {
          const meta = SOURCE_META[ev.source];
          const Icon = meta.icon;
          const time = timeOf(ev.date);
          const chips = chipsFor(ev);
          const isPhoto = ev.source === "photo";
          return (
            <div
              key={`${ev.date}-${ev.source}-${i}`}
              className="flex items-center"
              style={{ gap: 14, padding: "11px 0", borderTop: "1px solid #f3f2ed" }}
            >
              <span
                className="flex items-center justify-center"
                style={{ width: 36, height: 36, borderRadius: 9, background: meta.bg, color: meta.color, flex: "none" }}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden />
              </span>
              <div style={{ width: 100, flex: "none" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1c2522" }}>{ev.monthDay}</div>
                <div style={{ fontSize: 12, color: "#9a9b93" }}>{meta.label}</div>
              </div>
              <div style={{ width: 64, flex: "none", fontSize: 12.5, color: "#85867e" }}>{time}</div>
              {isPhoto ? (
                <div className="flex flex-1 items-center" style={{ gap: 12 }}>
                  <div
                    style={{
                      width: 46,
                      height: 34,
                      borderRadius: 7,
                      flex: "none",
                      background:
                        "repeating-linear-gradient(45deg,#cdd6bd,#cdd6bd 5px,#c2cbb0 5px,#c2cbb0 10px)",
                    }}
                    aria-hidden
                  />
                  <span style={{ fontSize: 14, color: "#3a3b34" }}>{ev.detail}</span>
                </div>
              ) : (
                <div style={{ flex: 1, fontSize: 14, color: "#3a3b34" }}>
                  {ev.title}
                  {ev.detail ? <span style={{ color: "#6f7069" }}>{" — "}{ev.detail}</span> : null}
                </div>
              )}
              {chips.length > 0 ? (
                <div className="flex" style={{ gap: 6, flex: "none" }}>
                  {chips.map((c) => {
                    const chip = CATEGORY_CHIP[c] ?? CATEGORY_CHIP.Note;
                    return (
                      <span
                        key={c}
                        style={{
                          background: chip.bg,
                          color: chip.color,
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: "3px 9px",
                          borderRadius: 13,
                        }}
                      >
                        {c}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Link
        href="/history"
        className="flex items-center justify-center"
        style={{ gap: 5, color: "#0b7a4d", fontSize: 14, fontWeight: 600, marginTop: 14 }}
      >
        View full timeline
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </Link>
    </div>
  );
}

/* --------------------------------------------------------------- 5. trend cards
 * The slide folds trends into the "What changed from normal" rail; the
 * standalone trend row is not shown. Kept as a no-op for import stability.
 */
export function TrendCards(_: { cards: TrendCard[] }) {
  return null;
}

/* -------------------------------------------------- right rail: changed-from-normal
 * "What changed from normal" card. Each item = left-accent strip with a tinted
 * icon tile, title, "Watch" pill, description, and meta line.
 */

const RAIL_CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ebeae5",
  borderRadius: 16,
  padding: "18px 20px",
};

const RAIL_EYEBROW: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.6px",
  textTransform: "uppercase",
};

const CHANGE_ICON: Record<string, typeof Utensils> = {
  Appetite: Utensils,
  Energy: Zap,
  Stool: Bone,
  Urination: Droplet,
  Water: Droplet,
  Vomiting: Meh,
};

function ChangedItem({ item }: { item: ChangedSignal }) {
  const isInfo = item.tone === "info";
  const accent = isInfo ? "#4d7cb5" : STATE.watch;
  const stripBg = isInfo ? "#f9fbfd" : "#fdfaf3";
  const tileBg = isInfo ? "#e7eef5" : "#f6ece2";
  const tileColor = isInfo ? "#4d7cb5" : "#c87d3e";
  const Icon = CHANGE_ICON[item.label] ?? Info;
  const Arrow =
    item.arrow === "down" ? ArrowDownRight : item.arrow === "up" ? ArrowUpRight : null;

  return (
    <div
      className="flex"
      style={{
        gap: 12,
        borderLeft: `3px solid ${accent}`,
        background: stripBg,
        borderRadius: "0 10px 10px 0",
        padding: "11px 13px",
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ width: 34, height: 34, borderRadius: 9, background: tileBg, color: tileColor, flex: "none" }}
      >
        <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden />
      </span>
      <div style={{ flex: 1 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 14.5, fontWeight: 600, color: "#1c2522" }}>{item.label}</span>
          <span
            style={{
              background: "#fdf3e3",
              color: "#b5740a",
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 12,
            }}
          >
            Watch
          </span>
        </div>
        <div className="flex items-center" style={{ fontSize: 13, color: "#6f7069", marginTop: 2, gap: 4 }}>
          {Arrow ? <Arrow className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden /> : null}
          {item.value}
        </div>
      </div>
    </div>
  );
}

export function ChangedFromNormalRail({ items }: { items: ChangedSignal[] }) {
  return (
    <div style={RAIL_CARD}>
      <div className="flex items-center" style={{ ...RAIL_EYEBROW, color: "#5b6b62", gap: 7, marginBottom: 14 }}>
        What changed from normal
        <Info className="h-[13px] w-[13px]" style={{ color: "#b6b7af" }} strokeWidth={1.8} aria-hidden />
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "#6f7069", lineHeight: 1.55 }}>
          Nothing off normal in the latest log. Keep checking in to stay ahead of changes.
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: 11 }}>
          {items.slice(0, 4).map((item) => (
            <ChangedItem key={item.label} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- 6. vet packet
 * "What to tell your vet" card: green eyebrow, body paragraph, two stacked
 * full-width buttons (outline "Copy vet summary" + gradient "Create vet report").
 */
export function VetPacketPanel({
  packet,
}: {
  packet: VetPacketModel;
  petName: string;
}) {
  // Body paragraph = the model's bullets joined into one vet-ready sentence.
  const body = packet.bullets.join(" ");
  return (
    <div style={RAIL_CARD}>
      <div style={{ ...RAIL_EYEBROW, color: "#0b7a4d", marginBottom: 10 }}>What to tell your vet</div>
      <div style={{ fontSize: 13.5, color: "#44453f", lineHeight: 1.55 }}>{body}</div>
      <CopyVetSummaryButton text={packet.copyText} />
      <CreateVetReportButton />
    </div>
  );
}

/* ----------------------------------------------------------- 7. log-next list
 * "What to log next" checklist: circle/check icon + label per item.
 */
export function LogNextChecklist({ items }: { items: LogNextItem[] }) {
  if (items.length === 0) return null;
  return (
    <div style={RAIL_CARD}>
      <div style={{ ...RAIL_EYEBROW, color: "#5b6b62", marginBottom: 12 }}>What to log next</div>
      <div className="flex flex-col" style={{ gap: 12 }}>
        {items.map((item) => (
          <Link key={item.label} href="/health-log" className="flex items-center" style={{ gap: 11 }}>
            <Circle className="h-[19px] w-[19px] shrink-0" style={{ color: "#c2c3ba" }} strokeWidth={1.8} aria-hidden />
            <span style={{ fontSize: 14, color: "#3a3b34" }}>{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------- right rail: vet-report button
 * "Create vet report" — gradient two-line CTA. Renders a Link to keep the
 * existing share/report navigation; styled per the slide.
 */
export function CreateVetReportButton() {
  return (
    <Link
      href="/history"
      className="flex w-full flex-col items-center"
      style={{
        marginTop: 9,
        background: "linear-gradient(180deg,#17a06d,#0a7048)",
        color: "#fff",
        border: "none",
        borderRadius: 11,
        padding: 9,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>Create vet report</span>
      <span style={{ fontSize: 12, color: "#cdeadc", marginTop: 1 }}>Generate a shareable report</span>
    </Link>
  );
}
