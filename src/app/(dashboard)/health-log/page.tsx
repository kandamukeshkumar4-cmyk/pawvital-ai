"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Save,
  UploadCloud,
  Utensils,
  Zap,
  Droplets,
  Activity,
  Waves,
  Wind,
  Footprints,
  Pill,
  Scale,
  Info,
  ChevronRight,
  ClipboardList,
  Camera,
  Check,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import Card from "@/components/ui/card";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  DEFAULT_LOG_INPUT,
  SELECT_FIELDS,
  type ContextSignals,
  type HealthLog,
  type HealthLogInput,
} from "@/lib/health-log/types";
import { buildHealthLogReadout } from "@/lib/health-log/readout";
import type { DetectedSignal } from "@/lib/dog-brain/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The three face glyphs the slide's segment selector uses (sad / meh / smile),
 *  drawn as 22px inline SVG so the icon color can be driven per selection
 *  state. Each metric option maps to one of these by sentiment. */
type FaceKind = "sad" | "meh" | "smile";

function FaceIcon({ kind, color }: { kind: FaceKind; color: string }) {
  const mouth =
    kind === "smile"
      ? "M8.5 14a3.5 3.5 0 0 0 7 0"
      : kind === "sad"
        ? "M8.5 15.5a3.5 3.5 0 0 1 7 0"
        : "M8.5 14.5h7";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d={mouth} />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}

/**
 * Slide-7 baseline metric row: label on the left, a fixed 165px-wide
 * three-segment face selector on the right. Sentiment maps each real option
 * value to a face (`sad`/`meh`/`smile`). The amber palette is used for the
 * "watch" metrics (breathing/mobility) exactly as in the slide.
 *
 * All real option values are preserved — `onChange` still receives the exact
 * enum value chosen, so the deterministic data flow is unchanged.
 */
function EmojiMetricRow<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  tone = "good",
}: {
  label: string;
  value: T;
  options: { value: T; face: FaceKind }[];
  onChange: (v: T) => void;
  icon?: React.ReactNode;
  tone?: "good" | "watch";
}) {
  const selBg = tone === "watch" ? "#fdf3e3" : "#e8f6ee";
  const selBorder = tone === "watch" ? "#f0cd8e" : "#bfe6d0";
  const selIcon = tone === "watch" ? "#dd8a0c" : "#15a06a";
  return (
    <div
      className="flex items-center gap-3"
      style={{ padding: "7px 0", borderTop: "1px solid #f3f2ed" }}
    >
      {icon ? (
        <span className="flex shrink-0" style={{ color: "#7a7b73" }} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="flex-1 text-[14.5px] font-medium text-[#1d1d1b]">{label}</span>
      <div className="flex shrink-0" style={{ gap: 7, width: 165 }}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              // key flips on selection so the chosen segment remounts and
              // replays the tap-pop animation.
              key={`${opt.value}-${selected}`}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`paw-press flex flex-1 items-center justify-center transition-all duration-150 ${
                selected ? "paw-pop" : ""
              }`}
              style={{
                height: 38,
                borderRadius: 9,
                background: selected ? selBg : "transparent",
                border: selected
                  ? `1.5px solid ${selBorder}`
                  : "1.5px solid transparent",
              }}
              aria-pressed={selected}
              aria-label={opt.value}
            >
              <FaceIcon kind={opt.face} color={selected ? selIcon : "#c8c9c0"} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Consecutive logged days ending at today (or yesterday if today isn't logged
 *  yet). Real streak from real logs — no fabrication. */
function computeStreak(logs: { log_date?: string }[]): number {
  const days = new Set(
    logs.map((l) => (l.log_date ?? "").slice(0, 10)).filter(Boolean),
  );
  if (days.size === 0) return 0;
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  const cursor = new Date();
  if (!days.has(fmt(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(fmt(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(fmt(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const CONFETTI_COLORS = ["#1f9d6b", "#e8a23c", "#4f7fb8", "#e2675b", "#15795a", "#bff0db"];

/** Casino-grade reward on a successful check-in: confetti burst + streak badge.
 *  Re-fires whenever `trigger` increments. Pure CSS, no library. */
function Celebration({ trigger, streak }: { trigger: number; streak: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (trigger === 0) return;
    const raf = requestAnimationFrame(() => setShow(true));
    const t = setTimeout(() => setShow(false), 2200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [trigger]);
  if (!show) return null;
  const pieces = Array.from({ length: 30 });
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute left-1/2 top-1/2">
        {pieces.map((_, i) => {
          const angle = (i / pieces.length) * 360;
          const dist = 110 + (i % 5) * 34;
          const x = Math.cos((angle * Math.PI) / 180) * dist;
          const y = Math.sin((angle * Math.PI) / 180) * dist;
          return (
            <span
              key={i}
              className="paw-confetti absolute block h-2.5 w-2.5 rounded-[2px]"
              style={{
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                ["--tx" as string]: `${x}px`,
                ["--ty" as string]: `${y}px`,
                animationDelay: `${(i % 6) * 25}ms`,
              }}
            />
          );
        })}
      </div>
      <div className="paw-streak rounded-2xl border border-[#e7f4ee] bg-white/95 px-7 py-5 text-center shadow-2xl">
        <div className="text-4xl">🎉</div>
        <div className="mt-1.5 text-lg font-bold text-[#15795a]">Check-in saved!</div>
        {streak > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#fff3e0] px-3.5 py-1.5 text-sm font-bold text-[#c1852a]">
            🔥 {streak}-day streak
          </div>
        )}
      </div>
    </div>
  );
}

/** Keyframes for the gamified Daily Log (tap-pop, confetti, streak pop-in). */
function DailyLogAnimations() {
  return (
    <style>{`
      @keyframes pawPop { 0%{transform:scale(1)} 45%{transform:scale(1.22)} 100%{transform:scale(1)} }
      .paw-pop { animation: pawPop .32s ease; }
      .paw-press { transition: transform .12s ease; }
      .paw-press:active { transform: scale(.9); }
      @keyframes pawConfettiBurst {
        0% { transform: translate(0,0) scale(1); opacity: 1; }
        100% { transform: translate(var(--tx), var(--ty)) scale(.3); opacity: 0; }
      }
      .paw-confetti { animation: pawConfettiBurst 1.6s cubic-bezier(.15,.7,.3,1) forwards; }
      @keyframes pawStreakIn {
        0% { transform: scale(.6); opacity: 0; }
        45% { transform: scale(1.08); opacity: 1; }
        70% { transform: scale(.97); }
        100% { transform: scale(1); opacity: 1; }
      }
      .paw-streak { animation: pawStreakIn .5s cubic-bezier(.2,1.2,.3,1) forwards; }
      @media (prefers-reduced-motion: reduce) {
        .paw-pop, .paw-confetti, .paw-streak, .paw-press { animation: none !important; transition: none !important; }
      }
    `}</style>
  );
}

/** Visual checkbox box matching the redesign spec. */
function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center transition-colors"
      style={{
        borderRadius: 5,
        background: checked ? "#15a06a" : "#fff",
        border: checked ? "1.5px solid #15a06a" : "1.5px solid #cfd0c8",
      }}
      aria-hidden
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path
            d="M2.5 6.2 5 8.5 9.5 3.5"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

/** Adaptive-pack checkbox list — label 14.5 #3a3b34, slide spacing (gap 13). */
function PackCheckboxes({
  items,
  values,
  onChange,
}: {
  items: { key: string; label: string }[];
  values: Record<string, boolean | string | undefined> | undefined;
  onChange: (key: string, checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 13 }}>
      {items.map(({ key, label }) => {
        const checked = Boolean(values?.[key]);
        return (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-[11px] text-[14.5px] text-[#3a3b34]"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={(e) => onChange(key, e.target.checked)}
            />
            <CheckBox checked={checked} />
            {label}
          </label>
        );
      })}
    </div>
  );
}

const WHITE_CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ebeae5",
  borderRadius: 16,
  padding: "20px 22px",
};

const SAVE_GRADIENT = "linear-gradient(180deg,#17a06d,#0a7048)";

interface DogBrainSaveSummary {
  state?: string;
  signal_count?: number;
  created_followups?: number;
  deduped_followups?: number;
}

export default function HealthLogPage() {
  const { activePet, pets } = useAppStore();
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lastBrainSummary, setLastBrainSummary] = useState<DogBrainSaveSummary | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [afterSaveSignals, setAfterSaveSignals] = useState<DetectedSignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  // Display-only signed URLs (parallel to form.photo_urls paths) for thumbnails.
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  // Presentation-only: which adaptive pack tab is visible.
  const [obsTab, setObsTab] = useState<
    "gi" | "urinary" | "mobility" | "skin_ear" | "breathing" | "seizure" | "medication"
  >("gi");

  const [form, setForm] = useState<HealthLogInput>({
    pet_id: activePet?.id ?? pets[0]?.id ?? "",
    log_date: todayIso(),
    ...DEFAULT_LOG_INPUT,
  });

  // Merge a partial update into context_signals without losing other packs.
  const setSignals = (patch: Partial<ContextSignals>) =>
    setForm((f) => ({ ...f, context_signals: { ...(f.context_signals ?? {}), ...patch } }));

  // Keep the selected pet in sync with the active pet once it loads.
  useEffect(() => {
    if (!form.pet_id && (activePet?.id || pets[0]?.id)) {
      setForm((f) => ({ ...f, pet_id: activePet?.id ?? pets[0]?.id ?? "" }));
    }
  }, [activePet?.id, pets, form.pet_id]);

  const fetchLogs = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const petId = activePet?.id;
      const q = petId ? `?pet_id=${encodeURIComponent(petId)}` : "";
      const res = await fetch(`/api/health-log${q}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not load your logs.");
        setLogs([]);
        return;
      }
      setLogs(Array.isArray(json.data) ? json.data : []);
    } catch {
      setError("Network error loading logs.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [activePet?.id]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const readout = useMemo(() => buildHealthLogReadout(logs), [logs]);

  const petOptions = useMemo(
    () => pets.map((p) => ({ value: p.id, label: p.name })),
    [pets],
  );

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.pet_id) return;
    if (!isSupabaseConfigured) {
      setError("Sign in with a saved profile to store daily logs.");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/health-log", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          notes: form.notes?.trim() || null,
          weight_kg: form.weight_kg || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json.code === "TABLE_MISSING"
            ? "Daily logs aren't switched on for this account yet."
            : json.error || "Could not save your log.",
        );
        return;
      }
      const saved = json.data as HealthLog;
      setLogs((prev) => {
        const withoutSameDay = prev.filter((l) => l.id !== saved.id);
        return [saved, ...withoutSameDay];
      });
      setSavedAt(saved.log_date);
      setCelebrate((c) => c + 1); // fire the reward animation
      // Show backend dog_brain summary (state + counts) when present
      if (json.dog_brain) {
        setLastBrainSummary(json.dog_brain);
      }
      // Trigger after-save brain signals refresh using the live detector
      void loadAfterSaveSignals(saved.pet_id);
    } catch {
      setError("Network error saving your log.");
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof HealthLogInput>(
    key: K,
    value: HealthLogInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  // Fetch fresh signals after a save (closes save -> see brain result loop)
  const loadAfterSaveSignals = useCallback(async (petId: string) => {
    if (!petId) return;
    setSignalsLoading(true);
    try {
      const res = await fetch(`/api/dog-brain/signals?pet_id=${encodeURIComponent(petId)}`);
      const json = await res.json().catch(() => null);
      if (json && Array.isArray(json.signals)) {
        setAfterSaveSignals(json.signals as DetectedSignal[]);
      } else {
        setAfterSaveSignals([]);
      }
    } catch {
      setAfterSaveSignals([]);
    } finally {
      setSignalsLoading(false);
    }
  }, []);

  // Real file upload (mirrors the journal convention): each file POSTs to
  // /api/health-log/upload, which stores it in owner-scoped Supabase Storage and
  // returns a path we persist in photo_urls. Up to 6 photos per log.
  const onPhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    if (!isSupabaseConfigured) {
      setError("Sign in with a saved profile to attach photos.");
      e.target.value = "";
      return;
    }
    setPhotoUploading(true);
    setError(null);
    const uploaded: string[] = [];
    const previews: string[] = [];
    try {
      for (let i = 0; i < files.length && uploaded.length < 6; i++) {
        const fd = new FormData();
        fd.append("file", files[i]);
        const res = await fetch("/api/health-log/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error || "Photo upload failed.");
          break;
        }
        if (typeof json.path === "string") {
          uploaded.push(json.path);
          previews.push(typeof json.signedUrl === "string" ? json.signedUrl : "");
        }
      }
      if (uploaded.length > 0) {
        setForm((f) => ({
          ...f,
          photo_urls: [...(f.photo_urls ?? []), ...uploaded].slice(0, 6),
        }));
        setPhotoPreviews((prev) => [...prev, ...previews].slice(0, 6));
      }
    } catch {
      setError("Photo upload failed.");
    } finally {
      setPhotoUploading(false);
      e.target.value = ""; // allow re-selecting the same file
    }
  };

  const photoCount = form.photo_urls?.length ?? 0;
  const streak = useMemo(() => computeStreak(logs), [logs]);

  // Core quick-status derived from context_signals packs (the detailed packs
  // stay adaptive). Breathing + mobility are high-signal vet warning signs that
  // shouldn't hide inside notes.
  const breathingValue: "normal" | "coughing" | "labored" = form.context_signals
    ?.breathing?.labored
    ? "labored"
    : form.context_signals?.breathing?.coughing
      ? "coughing"
      : "normal";
  const mobilityValue: "normal" | "stiff" | "limping" = form.context_signals
    ?.mobility?.limping
    ? "limping"
    : form.context_signals?.mobility?.reluctance_to_move
      ? "stiff"
      : "normal";

  const petName = (activePet?.name ?? "your dog").replace(/\b\p{L}/gu, (c) =>
    c.toUpperCase(),
  );

  // Active baseline as off-signs for the preview ("Appetite watch, stool watch").
  // Reflects the CURRENT form state, not a fabricated value.
  const baselineOff = useMemo(() => {
    const o: string[] = [];
    for (const f of SELECT_FIELDS) {
      const v = (form as unknown as Record<string, string>)[f.key];
      const opt = f.options.find((x) => x.value === v);
      if (opt && opt.tone !== "good") o.push(`${f.label.toLowerCase()} watch`);
    }
    if (form.vomiting_count > 0) o.push("vomiting");
    return o;
  }, [form]);

  // Real GI note captured this session (drives the preview "GI note" step).
  const giNote = form.context_signals?.gi?.change_note?.trim() || "";
  const giChecked =
    Boolean(form.context_signals?.gi?.blood_in_stool) ||
    Boolean(form.context_signals?.gi?.straining);
  const hasGiStep = Boolean(giNote) || giChecked;
  const hasPhotoStep = photoCount > 0;

  // The four preview nodes are derived from REAL captured state. Steps that
  // haven't happened yet render in a muted/pending palette — no fabricated
  // times or values.
  const previewSteps = [
    {
      key: "baseline",
      label: "Baseline",
      done: true,
      time: savedAt ? "Saved" : "Now",
      descriptor:
        baselineOff.length > 0 ? baselineOff.slice(0, 2).join(", ") : "All normal",
      icon: <ClipboardList size={20} aria-hidden />,
      bg: "#eaf3ee",
      fg: "#0b7a4d",
    },
    {
      key: "gi",
      label: "GI note",
      done: hasGiStep,
      time: hasGiStep ? "Captured" : "—",
      descriptor: hasGiStep ? giNote || "Observations noted" : "Not added",
      icon: <Utensils size={20} aria-hidden />,
      bg: hasGiStep ? "#f0ead9" : "#f3f2ed",
      fg: hasGiStep ? "#8a6a3c" : "#b6b7af",
    },
    {
      key: "photo",
      label: "Photo added",
      done: hasPhotoStep,
      time: hasPhotoStep ? "Captured" : "—",
      descriptor: hasPhotoStep
        ? `${photoCount} photo${photoCount === 1 ? "" : "s"}`
        : "Not added",
      icon: <Camera size={20} aria-hidden />,
      bg: hasPhotoStep ? "#e7eef5" : "#f3f2ed",
      fg: hasPhotoStep ? "#4d7cb5" : "#b6b7af",
    },
    {
      key: "saved",
      label: "Saved",
      done: Boolean(savedAt),
      time: savedAt ? "Just now" : "—",
      descriptor: savedAt ? "Check-in recorded" : "Not saved yet",
      icon: <Check size={20} aria-hidden />,
    },
  ];

  // "What the Brain will remember" — real detected signals from the live
  // detector (loaded after a save). Empty until there's real history.
  const rememberSignals = afterSaveSignals.slice(0, 3);
  const notesCount = (form.notes ?? "").length;

  const saveButton = (
    <button
      type="submit"
      form="daily-checkin-form"
      disabled={!form.pet_id || saving}
      className="paw-press inline-flex items-center gap-2 text-white transition-opacity hover:opacity-95 disabled:opacity-50"
      style={{
        background: SAVE_GRADIENT,
        border: "none",
        borderRadius: 11,
        padding: "11px 19px",
        fontSize: 14.5,
        fontWeight: 600,
        boxShadow: "0 1px 2px rgba(10,90,60,.25)",
      }}
    >
      {saving ? (
        <Loader2 className="h-[17px] w-[17px] animate-spin" aria-hidden />
      ) : (
        <Save className="h-[17px] w-[17px]" aria-hidden />
      )}
      {saving ? "Saving…" : "Save check-in"}
    </button>
  );

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1380 }}>
      <DailyLogAnimations />
      <Celebration trigger={celebrate} streak={streak} />

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-[#1d1d1b]"
            style={{ margin: 0, fontSize: 29, fontWeight: 700, letterSpacing: "-0.6px" }}
          >
            {petName} Daily check-in
          </h1>
          <div className="mt-[5px] text-[14.5px] text-[#6f7069]">
            Teach the Brain what normal looks like.
          </div>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="paw-streak flex items-center gap-2 rounded-full border border-[#bfe6d0] bg-[#e8f6ee] px-4 py-2">
              <span className="text-lg leading-none">🔥</span>
              <div className="leading-tight">
                <div className="text-base font-bold text-[#0b7a4d]">{streak}-day streak</div>
                <div className="text-[11px] text-[#15a06a]">Keep it going!</div>
              </div>
            </div>
          )}
          {saveButton}
        </div>
      </div>

      {!isSupabaseConfigured ? (
        <Card
          className="mb-5 p-4 text-sm"
          style={{ background: "rgba(224,164,88,0.12)", borderColor: "rgba(224,164,88,0.4)" }}
        >
          <p className="text-[#8a4f15]">
            You&apos;re viewing demo mode. Sign in with a saved profile to store daily
            logs and build a history.
          </p>
        </Card>
      ) : null}

      {/* Readout — what the logs show so far */}
      {readout.hasToday ? (
        <section className="mb-5" style={WHITE_CARD}>
          <h2 className="text-base font-semibold text-[#1d1d1b]">{readout.headline}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#6f7069]">{readout.detail}</p>
          {readout.offSigns.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {readout.offSigns.map((s) => {
                const text =
                  s.tone === "alert" ? "#b23636" : s.tone === "watch" ? "#9a6b1f" : "#0a7d5b";
                const bg =
                  s.tone === "alert"
                    ? "rgba(226,92,92,0.12)"
                    : s.tone === "watch"
                      ? "rgba(224,164,88,0.16)"
                      : "rgba(0,168,120,0.1)";
                return (
                  <span
                    key={s.field}
                    className="rounded-full border px-3 py-1.5 text-sm font-medium"
                    style={{ background: bg, borderColor: text + "55", color: text }}
                  >
                    {s.label}: {s.valueLabel}
                  </span>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <form id="daily-checkin-form" onSubmit={(e) => void submit(e)}>
        {/* 3 columns */}
        <div className="flex flex-col items-stretch gap-5 lg:flex-row lg:items-start">
          {/* COLUMN 1 — Today's baseline */}
          <div className="flex-1" style={WHITE_CARD}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Today&apos;s baseline</div>
            <div className="text-[#85867e]" style={{ fontSize: 13.5, marginTop: 3, marginBottom: 14 }}>
              Quick check of the essentials.
            </div>

            {/* Optional pet picker when multiple dogs exist (real field) */}
            {pets.length > 1 && (
              <div className="mb-3">
                <Select
                  label="Dog"
                  value={form.pet_id}
                  onChange={(e) => setField("pet_id", e.target.value)}
                  options={petOptions}
                  required
                />
              </div>
            )}

            <div className="flex flex-col">
              <EmojiMetricRow
                label="Appetite"
                icon={<Utensils size={18} aria-hidden />}
                value={form.appetite}
                options={[
                  { value: "none" as const, face: "sad" },
                  { value: "reduced" as const, face: "meh" },
                  { value: "normal" as const, face: "smile" },
                  { value: "increased" as const, face: "smile" },
                ]}
                onChange={(v) => setField("appetite", v)}
              />
              <EmojiMetricRow
                label="Water"
                icon={<Droplets size={18} aria-hidden />}
                value={form.water}
                options={[
                  { value: "less" as const, face: "sad" },
                  { value: "normal" as const, face: "smile" },
                  { value: "more" as const, face: "meh" },
                ]}
                onChange={(v) => setField("water", v)}
              />
              <EmojiMetricRow
                label="Stool"
                icon={<Activity size={18} aria-hidden />}
                value={form.stool}
                options={[
                  { value: "diarrhea" as const, face: "sad" },
                  { value: "soft" as const, face: "meh" },
                  { value: "normal" as const, face: "smile" },
                  { value: "none" as const, face: "sad" },
                ]}
                onChange={(v) => setField("stool", v)}
              />
              <EmojiMetricRow
                label="Urination"
                icon={<Waves size={18} aria-hidden />}
                value={form.urination}
                options={[
                  { value: "straining" as const, face: "sad" },
                  { value: "less" as const, face: "meh" },
                  { value: "normal" as const, face: "smile" },
                  { value: "more" as const, face: "meh" },
                ]}
                onChange={(v) => setField("urination", v)}
              />

              {/* Vomiting — stepper (real vomiting_count) */}
              <div
                className="flex items-center gap-3"
                style={{ padding: "7px 0", borderTop: "1px solid #f3f2ed" }}
              >
                <span className="flex shrink-0" style={{ color: "#7a7b73" }} aria-hidden>
                  <Activity size={18} />
                </span>
                <span className="flex-1 text-[14.5px] font-medium text-[#1d1d1b]">Vomiting</span>
                <div className="flex shrink-0 items-center justify-end gap-2.5" style={{ width: 165 }}>
                  <button
                    type="button"
                    onClick={() => setField("vomiting_count", Math.max(0, form.vomiting_count - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg font-medium text-[#1d1d1b] transition-colors hover:bg-[#f5f4f0]"
                    style={{ borderColor: "#e6e5e0" }}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-[#1d1d1b]">{form.vomiting_count}</span>
                  <button
                    type="button"
                    onClick={() => setField("vomiting_count", Math.min(100, form.vomiting_count + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg font-medium text-[#1d1d1b] transition-colors hover:bg-[#f5f4f0]"
                    style={{ borderColor: "#e6e5e0" }}
                  >
                    +
                  </button>
                </div>
              </div>

              <EmojiMetricRow
                label="Energy"
                icon={<Zap size={18} aria-hidden />}
                value={form.energy}
                options={[
                  { value: "low" as const, face: "sad" },
                  { value: "normal" as const, face: "smile" },
                  { value: "high" as const, face: "meh" },
                ]}
                onChange={(v) => setField("energy", v)}
              />
              <EmojiMetricRow
                label="Breathing"
                icon={<Wind size={18} aria-hidden />}
                tone="watch"
                value={breathingValue}
                options={[
                  { value: "labored" as const, face: "sad" },
                  { value: "coughing" as const, face: "meh" },
                  { value: "normal" as const, face: "smile" },
                ]}
                onChange={(v) =>
                  setSignals({
                    breathing: {
                      ...(form.context_signals?.breathing ?? {}),
                      coughing: v === "coughing",
                      labored: v === "labored",
                    },
                  })
                }
              />
              <EmojiMetricRow
                label="Mobility"
                icon={<Footprints size={18} aria-hidden />}
                tone="watch"
                value={mobilityValue}
                options={[
                  { value: "limping" as const, face: "sad" },
                  { value: "stiff" as const, face: "meh" },
                  { value: "normal" as const, face: "smile" },
                ]}
                onChange={(v) =>
                  setSignals({
                    mobility: {
                      ...(form.context_signals?.mobility ?? {}),
                      limping: v === "limping",
                      reluctance_to_move: v === "stiff",
                    },
                  })
                }
              />

              {/* Weight — input pill + sparkline + delta */}
              <div
                className="flex items-center gap-3"
                style={{ padding: "7px 0", borderTop: "1px solid #f3f2ed" }}
              >
                <span className="flex shrink-0" style={{ color: "#7a7b73" }} aria-hidden>
                  <Scale size={18} />
                </span>
                <span className="flex-1 text-[14.5px] font-medium text-[#1d1d1b]">Weight</span>
                <div className="flex items-center gap-[9px]">
                  <span
                    className="flex items-center"
                    style={{ background: "#f5f4f0", border: "1px solid #e6e5e0", borderRadius: 8, padding: "5px 9px" }}
                  >
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      placeholder="—"
                      aria-label="Weight (kg, optional)"
                      value={form.weight_kg != null ? String(form.weight_kg) : ""}
                      onChange={(e) =>
                        setField("weight_kg", e.target.value ? Number(e.target.value) : null)
                      }
                      style={{
                        width: 38,
                        border: "none",
                        background: "none",
                        fontSize: 14,
                        fontWeight: 600,
                        outline: "none",
                        color: "#1d1d1b",
                      }}
                    />
                    <span style={{ fontSize: 12.5, color: "#9a9b93", marginLeft: 3 }}>kg</span>
                  </span>
                  {readout.changes.some((c) => c.field === "weight") ? (
                    <>
                      <svg width="30" height="16" viewBox="0 0 30 16" fill="none" aria-hidden>
                        <polyline
                          points="2,9 9,6 16,10 23,7 28,8"
                          stroke="#15a06a"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {(() => {
                        const wc = readout.changes.find((c) => c.field === "weight");
                        return wc ? (
                          <span
                            className="flex items-center gap-[2px] font-semibold"
                            style={{ fontSize: 13, color: "#e0890a" }}
                          >
                            {wc.text.replace(/^Weight\s+/i, "").replace(/\s+since last log$/i, "")}
                          </span>
                        ) : null;
                      })()}
                    </>
                  ) : null}
                </div>
              </div>

              {/* Meds — real meds_given checkbox */}
              <label
                className="flex cursor-pointer items-center gap-[11px] text-[14.5px] text-[#1d1d1b]"
                style={{ padding: "7px 0", borderTop: "1px solid #f3f2ed" }}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form.meds_given}
                  onChange={(e) => setField("meds_given", e.target.checked)}
                />
                <CheckBox checked={form.meds_given} />
                <span className="flex items-center gap-2">
                  <span style={{ color: "#7a7b73" }} aria-hidden>
                    <Pill size={18} />
                  </span>
                  Gave medication / fluids today
                </span>
              </label>
            </div>

            {/* Specific observations block */}
            <div
              style={{ border: "1px solid #efeee9", borderRadius: 12, padding: "13px 14px", marginTop: 16 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Specific observations</span>{" "}
                  <span style={{ fontSize: 12.5, color: "#9a9b93" }}>(optional)</span>
                </div>
              </div>
              <div className="text-[#9a9b93]" style={{ fontSize: 12.5, marginTop: 3 }}>
                Add anything important you noticed today.
              </div>
              <div className="relative" style={{ marginTop: 11 }}>
                <textarea
                  value={form.notes ?? ""}
                  maxLength={300}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="e.g., picky at dinner, more sleepy this morning..."
                  style={{
                    width: "100%",
                    height: 74,
                    resize: "none",
                    border: "1px solid #e6e5e0",
                    borderRadius: 9,
                    padding: 10,
                    fontSize: 13.5,
                    color: "#1d1d1b",
                    outline: "none",
                  }}
                />
                <span
                  className="absolute"
                  style={{ right: 10, bottom: 9, fontSize: 11.5, color: "#b6b7af" }}
                >
                  {notesCount}/300
                </span>
              </div>
            </div>
          </div>

          {/* COLUMN 2 — Adaptive packs */}
          <div className="flex-1" style={WHITE_CARD}>
            <div className="flex items-center justify-between">
              <div style={{ fontSize: 17, fontWeight: 700 }}>Adaptive packs</div>
            </div>
            <div
              className="flex items-center gap-[6px] text-[#85867e]"
              style={{ fontSize: 13.5, marginTop: 3 }}
            >
              Add detail where it matters most today.
              <Info size={13} className="text-[#b6b7af]" aria-hidden />
            </div>

            {/* Underline tabs */}
            <div
              className="flex overflow-x-auto"
              style={{ borderBottom: "1px solid #efeee9", marginTop: 14 }}
              role="tablist"
            >
              {([
                { id: "gi", label: "GI" },
                { id: "urinary", label: "Urinary" },
                { id: "mobility", label: "Mobility" },
                { id: "skin_ear", label: "Skin & Ear" },
                { id: "breathing", label: "Breathing" },
                { id: "seizure", label: "Episode" },
                { id: "medication", label: "Medication" },
              ] as const).map((t) => {
                const active = obsTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setObsTab(t.id)}
                    className="whitespace-nowrap transition-colors"
                    style={{
                      padding: "0 12px 9px",
                      fontSize: 13.5,
                      color: active ? "#0b7a4d" : "#85867e",
                      fontWeight: active ? 600 : 500,
                      borderBottom: active ? "2px solid #0b7a4d" : "2px solid transparent",
                      marginBottom: -1,
                      background: "none",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* GI */}
            {obsTab === "gi" && (
              <fieldset className="border-0 p-0">
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>GI observations</div>
                <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2, marginBottom: 13 }}>
                  Tell us more about {petName}&apos;s digestive health today.
                </div>
                <PackCheckboxes
                  items={[
                    { key: "blood_in_stool", label: "Blood in stool" },
                    { key: "straining", label: "Straining to go" },
                  ]}
                  values={form.context_signals?.gi}
                  onChange={(key, checked) => setSignals({ gi: { ...(form.context_signals?.gi ?? {}), [key]: checked } })}
                />
              </fieldset>
            )}

            {/* Urinary */}
            {obsTab === "urinary" && (
              <fieldset className="border-0 p-0">
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>Urinary observations</div>
                <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2, marginBottom: 13 }}>
                  Tell us more about {petName}&apos;s drinking and urination today.
                </div>
                <PackCheckboxes
                  items={[
                    { key: "increased_thirst", label: "Drinking more than usual" },
                    { key: "accidents", label: "Accidents indoors" },
                    { key: "color_change", label: "Urine looks different (color/smell)" },
                  ]}
                  values={form.context_signals?.urinary}
                  onChange={(key, checked) => setSignals({ urinary: { ...(form.context_signals?.urinary ?? {}), [key]: checked } })}
                />
              </fieldset>
            )}

            {/* Mobility */}
            {obsTab === "mobility" && (
              <fieldset className="border-0 p-0">
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>Mobility observations</div>
                <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2, marginBottom: 13 }}>
                  Tell us more about {petName}&apos;s movement and comfort today.
                </div>
                <PackCheckboxes
                  items={[
                    { key: "limping", label: "Limping" },
                    { key: "reluctance_to_move", label: "Reluctant to get up or move" },
                  ]}
                  values={form.context_signals?.mobility}
                  onChange={(key, checked) => setSignals({ mobility: { ...(form.context_signals?.mobility ?? {}), [key]: checked } })}
                />
                {form.context_signals?.mobility?.limping && (
                  <div className="mt-3">
                    <Input
                      label="Which leg? (optional)"
                      value={form.context_signals?.mobility?.limb ?? ""}
                      onChange={(e) => setSignals({ mobility: { ...(form.context_signals?.mobility ?? {}), limping: true, limb: e.target.value || undefined } })}
                      placeholder="e.g. front left"
                    />
                  </div>
                )}
              </fieldset>
            )}

            {/* Skin & Ear */}
            {obsTab === "skin_ear" && (
              <fieldset className="border-0 p-0">
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>Skin &amp; ear observations</div>
                <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2, marginBottom: 13 }}>
                  Tell us more about {petName}&apos;s skin and ears today.
                </div>
                <PackCheckboxes
                  items={[
                    { key: "scratching", label: "Scratching / licking excessively" },
                    { key: "head_shaking", label: "Shaking head" },
                    { key: "hot_spot", label: "Hot spot or sore patch" },
                    { key: "odor", label: "Unusual odor (ears, skin)" },
                  ]}
                  values={form.context_signals?.skin_ear}
                  onChange={(key, checked) => setSignals({ skin_ear: { ...(form.context_signals?.skin_ear ?? {}), [key]: checked } })}
                />
              </fieldset>
            )}

            {/* Breathing */}
            {obsTab === "breathing" && (
              <fieldset className="border-0 p-0">
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>Breathing observations</div>
                <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2, marginBottom: 13 }}>
                  Tell us more about {petName}&apos;s breathing today.
                </div>
                <PackCheckboxes
                  items={[
                    { key: "coughing", label: "Coughing" },
                    { key: "labored", label: "Labored or fast breathing" },
                    { key: "exercise_intolerance", label: "Tires quickly on walks" },
                  ]}
                  values={form.context_signals?.breathing}
                  onChange={(key, checked) => setSignals({ breathing: { ...(form.context_signals?.breathing ?? {}), [key]: checked } })}
                />
              </fieldset>
            )}

            {/* Episode / seizure */}
            {obsTab === "seizure" && (
              <fieldset className="border-0 p-0">
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>Episode observations</div>
                <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2, marginBottom: 13 }}>
                  Record a seizure or episode for your vet history.
                </div>
                <label className="flex cursor-pointer items-center gap-[11px] text-[14.5px] text-[#3a3b34]">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.context_signals?.seizure?.occurred ?? false}
                    onChange={(e) => setSignals({ seizure: { ...(form.context_signals?.seizure ?? { occurred: false }), occurred: e.target.checked } })}
                  />
                  <CheckBox checked={form.context_signals?.seizure?.occurred ?? false} />
                  Seizure or episode occurred today
                </label>
                {form.context_signals?.seizure?.occurred && (
                  <div className="mt-3 space-y-3">
                    <Input
                      label="Duration (seconds, optional)"
                      type="number"
                      min={0}
                      max={7200}
                      value={form.context_signals?.seizure?.duration_sec != null ? String(form.context_signals.seizure.duration_sec) : ""}
                      onChange={(e) => setSignals({ seizure: { ...(form.context_signals?.seizure ?? { occurred: true }), duration_sec: e.target.value ? Number(e.target.value) : undefined } })}
                    />
                    <div className="relative">
                      <textarea
                        value={form.context_signals?.seizure?.recovery_note ?? ""}
                        maxLength={300}
                        onChange={(e) => setSignals({ seizure: { ...(form.context_signals?.seizure ?? { occurred: true }), recovery_note: e.target.value || undefined } })}
                        placeholder="How long to recover? Any confusion?"
                        style={{ width: "100%", height: 78, resize: "none", border: "1px solid #e6e5e0", borderRadius: 9, padding: 11, fontSize: 13.5, color: "#1d1d1b", outline: "none", lineHeight: 1.45 }}
                      />
                    </div>
                  </div>
                )}
              </fieldset>
            )}

            {/* Medication */}
            {obsTab === "medication" && (
              <fieldset className="border-0 p-0">
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>Medication history</div>
                <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2, marginBottom: 13 }}>
                  Record what was given — for your vet history only, not dosing advice.
                </div>
                <div className="space-y-3">
                  <Input
                    label="Medication name (optional)"
                    value={form.context_signals?.medication?.name ?? ""}
                    onChange={(e) => setSignals({ medication: { ...(form.context_signals?.medication ?? {}), name: e.target.value || undefined } })}
                    placeholder="e.g. Apoquel 16mg"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Time given (optional)"
                      type="time"
                      value={form.context_signals?.medication?.time_given ?? ""}
                      onChange={(e) => setSignals({ medication: { ...(form.context_signals?.medication ?? {}), time_given: e.target.value || undefined } })}
                    />
                    <label className="flex cursor-pointer items-end gap-[11px] pb-2.5 text-[14.5px] text-[#3a3b34]">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={form.context_signals?.medication?.missed_late ?? false}
                        onChange={(e) => setSignals({ medication: { ...(form.context_signals?.medication ?? {}), missed_late: e.target.checked || undefined } })}
                      />
                      <CheckBox checked={form.context_signals?.medication?.missed_late ?? false} />
                      Missed or late dose
                    </label>
                  </div>
                </div>
              </fieldset>
            )}

            {/* Notes (per-pack context) */}
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>Notes</div>
            <div className="text-[#85867e]" style={{ fontSize: 12.5, marginTop: 2, marginBottom: 11 }}>
              Add context (amount, timing, patterns, triggers).
            </div>
            <div className="relative">
              <textarea
                value={form.context_signals?.gi?.change_note ?? ""}
                maxLength={300}
                onChange={(e) => setSignals({ gi: { ...(form.context_signals?.gi ?? {}), change_note: e.target.value || undefined } })}
                placeholder="e.g. loose stool for 2 days"
                style={{
                  width: "100%",
                  height: 78,
                  resize: "none",
                  border: "1px solid #e6e5e0",
                  borderRadius: 9,
                  padding: 11,
                  fontSize: 13.5,
                  color: "#1d1d1b",
                  outline: "none",
                  lineHeight: 1.45,
                }}
              />
              <span
                className="absolute"
                style={{ right: 10, bottom: 9, fontSize: 11.5, color: "#b6b7af" }}
              >
                {(form.context_signals?.gi?.change_note ?? "").length}/300
              </span>
            </div>

            {/* Add photo */}
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 18 }}>
              Add photo{" "}
              <span style={{ fontSize: 12.5, color: "#9a9b93", fontWeight: 400 }}>(optional)</span>
            </div>
            <div className="text-[#85867e]" style={{ fontSize: 12.5, marginTop: 2, marginBottom: 11 }}>
              A stool photo helps the Brain learn patterns.
            </div>
            {photoPreviews.some(Boolean) ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {photoPreviews.map((url, i) =>
                  url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt="Attached health-log photo"
                      className="object-cover"
                      style={{ width: 78, height: 62, borderRadius: 10, border: "1px solid #ebeae5" }}
                    />
                  ) : null,
                )}
              </div>
            ) : null}
            <div className="flex gap-3">
              <div
                style={{
                  width: 78,
                  height: 62,
                  borderRadius: 10,
                  flex: "none",
                  background:
                    "repeating-linear-gradient(45deg,#cdd6bd,#cdd6bd 6px,#c2cbb0 6px,#c2cbb0 12px)",
                }}
                aria-hidden
              />
              <label
                className={`flex flex-1 cursor-pointer flex-col items-center justify-center text-center transition-colors hover:bg-[#faf9f6] ${
                  photoUploading || !isSupabaseConfigured ? "pointer-events-none opacity-50" : ""
                }`}
                style={{ border: "1.5px dashed #d4d3cc", borderRadius: 10, color: "#6f7069", minHeight: 62, padding: "10px 12px" }}
              >
                {photoUploading ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin text-[#6f7069]" aria-hidden />
                ) : (
                  <UploadCloud className="h-[18px] w-[18px] text-[#6f7069]" aria-hidden />
                )}
                <span style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
                  {photoUploading ? "Uploading…" : "Upload photo"}
                </span>
                <span style={{ fontSize: 11.5, color: "#9a9b93" }}>
                  JPG, PNG, or WebP up to 5MB each (max 6)
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  disabled={photoUploading || !isSupabaseConfigured}
                  onChange={(e) => void onPhotoFiles(e)}
                />
              </label>
            </div>
            {photoCount > 0 ? (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-[#cf4338] hover:underline"
                onClick={() => {
                  setField("photo_urls", null);
                  setPhotoPreviews([]);
                }}
              >
                Clear ({photoCount})
              </button>
            ) : null}
          </div>

          {/* COLUMN 3 — What the Brain will remember */}
          <div className="w-full lg:w-[300px] lg:flex-none" style={WHITE_CARD}>
            <div className="flex items-center gap-[7px]" style={{ fontSize: 17, fontWeight: 700 }}>
              What the Brain will remember
              <Info size={14} className="text-[#b6b7af]" aria-hidden />
            </div>
            <div className="text-[#85867e]" style={{ fontSize: 13.5, marginTop: 3, marginBottom: 14 }}>
              Live context from {petName}&apos;s history.
            </div>

            <div className="flex flex-col" style={{ gap: 11 }}>
              {signalsLoading ? (
                <p className="text-xs text-[#6f7069]">Checking patterns…</p>
              ) : rememberSignals.length > 0 ? (
                rememberSignals.map((s, i) => {
                  const watch = s.severity !== "info";
                  const accent = watch ? "#e0890a" : "#15a06a";
                  const bg = watch ? "#fdfaf3" : "#f6fbf8";
                  const pillBg = watch ? "#fdf3e3" : "#e9f6ef";
                  const pillFg = watch ? "#b5740a" : "#0b7a4d";
                  const pillText = watch ? "Recent" : "Active";
                  return (
                    <div
                      key={i}
                      className="flex gap-3"
                      style={{ borderLeft: `3px solid ${accent}`, background: bg, borderRadius: "0 10px 10px 0", padding: "12px 13px" }}
                    >
                      <span
                        className="flex flex-none items-center justify-center"
                        style={{ width: 36, height: 36, borderRadius: 9, background: watch ? "#f0ead9" : "#eaf3ee", color: watch ? "#8a6a3c" : "#0b7a4d" }}
                        aria-hidden
                      >
                        {watch ? <Activity size={18} /> : <Pill size={18} />}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{s.owner_message}</span>
                          <span
                            style={{ background: pillBg, color: pillFg, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12 }}
                          >
                            {pillText}
                          </span>
                        </div>
                        {s.next_action ? (
                          <div className="text-[#6f7069]" style={{ fontSize: 13, marginTop: 2 }}>
                            {s.next_action}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{ border: "1px dashed #e6e5e0", borderRadius: 10, padding: "14px 13px" }}
                >
                  <div className="text-[#6f7069]" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    Nothing remembered yet. Save a few check-ins and the Brain will surface
                    patterns from {petName}&apos;s history here.
                  </div>
                </div>
              )}
            </div>

            {/* Next best action */}
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 18 }}>Next best action</div>
            <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2, marginBottom: 13 }}>
              Small steps. Big impact.
            </div>
            <div className="flex flex-col" style={{ gap: 13 }}>
              {[
                { label: "Save today's check-in", done: Boolean(savedAt) },
                { label: "Add stool photo if possible", done: hasPhotoStep },
                { label: "Note medication given", done: form.meds_given },
                { label: "Add specific observations", done: notesCount > 0 },
              ].map((a, i) => (
                <div key={i} className="flex items-center gap-[11px]">
                  <span
                    className="flex flex-none items-center justify-center"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: a.done ? "#15a06a" : "#fff",
                      border: a.done ? "1.5px solid #15a06a" : "1.5px solid #cfd0c8",
                    }}
                    aria-hidden
                  >
                    {a.done ? (
                      <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none">
                        <path d="M3 7.2 5.8 10 11 4.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span style={{ fontSize: 14, color: "#3a3b34" }}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <p className="pt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        {/* After-save confirmation chip */}
        {savedAt ? (
          <div
            className="mt-5 flex items-center gap-2 rounded-xl px-4 py-3"
            style={{ background: "#e8f6ee", border: "1px solid #bfe6d0" }}
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#15a06a]" aria-hidden />
            <p className="text-sm font-medium text-[#0b7a4d]">
              Check-in saved! <span className="font-normal">{savedAt}</span>
            </p>
            {lastBrainSummary ? (
              <p className="ml-auto text-[11px] text-[#6f7069]">
                Dog Brain: {lastBrainSummary.state || "updated"} · signals{" "}
                {lastBrainSummary.signal_count ?? 0} · follow-ups created{" "}
                {lastBrainSummary.created_followups ?? 0}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Preview + Vet-safe row */}
        <div className="mt-5 flex flex-col items-stretch gap-5 lg:flex-row">
          {/* Today's check-in preview */}
          <div className="flex-1" style={WHITE_CARD}>
            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Today&apos;s check-in preview</div>
                <div className="text-[#85867e]" style={{ fontSize: 13, marginTop: 2 }}>
                  This is what will be saved to {petName}&apos;s timeline.
                </div>
              </div>
              <a
                href="/history"
                className="flex items-center gap-1"
                style={{ color: "#0b7a4d", fontSize: 13.5, fontWeight: 600 }}
              >
                View timeline
                <ChevronRight size={13} aria-hidden />
              </a>
            </div>

            <div className="mt-4 flex items-center overflow-x-auto">
              {previewSteps.map((step, idx) => (
                <div key={step.key} className="flex items-center">
                  <div className="flex flex-col items-center text-center" style={{ width: 110 }}>
                    <span
                      className="flex items-center justify-center"
                      style={
                        step.key === "saved"
                          ? {
                              width: 42,
                              height: 42,
                              borderRadius: "50%",
                              background: step.done ? "#15a06a" : "#e8e7e2",
                              color: "#fff",
                            }
                          : {
                              width: 42,
                              height: 42,
                              borderRadius: 11,
                              background: step.bg,
                              color: step.fg,
                            }
                      }
                      aria-hidden
                    >
                      {step.icon}
                    </span>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 7 }}>{step.label}</div>
                    <div className="text-[#9a9b93]" style={{ fontSize: 12 }}>{step.time}</div>
                    <div className="text-[#9a9b93]" style={{ fontSize: 11.5, marginTop: 1 }}>
                      {step.descriptor}
                    </div>
                  </div>
                  {idx < previewSteps.length - 1 ? (
                    <svg
                      style={{ flex: 1, minWidth: 36 }}
                      height="16"
                      viewBox="0 0 60 16"
                      fill="none"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      <path
                        d="M2 8h52M48 4l6 4-6 4"
                        stroke="#cbccc3"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Vet-safe by design */}
          <div
            className="w-full lg:w-[300px] lg:flex-none"
            style={{ ...WHITE_CARD, display: "flex", gap: 12, alignItems: "flex-start" }}
          >
            <span
              className="flex flex-none items-center justify-center"
              style={{ width: 38, height: 38, borderRadius: 10, background: "#eaf3ee", color: "#0b7a4d" }}
              aria-hidden
            >
              <ShieldCheck size={20} />
            </span>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>Vet-safe by design</div>
              <div className="text-[#6f7069]" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                Your notes, photos, and logs are secure and easy to share with your vet.
              </div>
              <div className="text-[#6f7069] flex items-center gap-1.5" style={{ fontSize: 13, marginTop: 8 }}>
                <Stethoscope size={14} aria-hidden />
                We don&apos;t diagnose or treat.
              </div>
            </div>
          </div>
        </div>

        {/* Footer disclaimer */}
        <div
          className="text-center text-[#a8a99f]"
          style={{ fontSize: 12.5, marginTop: 18, marginBottom: 16 }}
        >
          PawVital AI provides general guidance based on the information you share. Always
          consult your veterinarian for diagnosis and treatment.
        </div>
      </form>

      {/* Recent logs (real data) */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[#6f7069]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading your check-ins…
        </div>
      ) : logs.length > 0 ? (
        <section className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#85867e]">
            Recent check-ins
          </p>
          <div className="space-y-2">
            {logs.slice(0, 7).map((log) => {
              const off = buildHealthLogReadout([log]).offSigns;
              return (
                <Card
                  key={log.id}
                  className="flex items-center justify-between gap-3 p-4"
                  style={{ borderRadius: 16, borderColor: "#ebeae5" }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1d1d1b]">{log.log_date}</p>
                    <p className="truncate text-xs text-[#85867e]">
                      {off.length === 0
                        ? "All normal"
                        : off.map((s) => `${s.label}: ${s.valueLabel}`).join(" · ")}
                    </p>
                  </div>
                  {log.meds_given ? (
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs text-[#0b7a4d]"
                      style={{ background: "#e8f6ee" }}
                    >
                      Meds ✓
                    </span>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
