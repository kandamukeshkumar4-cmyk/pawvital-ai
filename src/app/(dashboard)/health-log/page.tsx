"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  ChevronDown,
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
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Select from "@/components/ui/select";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
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

const TONE_TEXT: Record<"good" | "watch" | "alert", string> = {
  good: "#0a7d5b",
  watch: "#9a6b1f",
  alert: "#b23636",
};
const TONE_BG: Record<"good" | "watch" | "alert", string> = {
  good: "rgba(0,168,120,0.1)",
  watch: "rgba(224,164,88,0.16)",
  alert: "rgba(226,92,92,0.12)",
};

/** Emoji face selector row — restyled to the redesign's 3-segment face selector. */
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
  options: { value: T; emoji: string; label: string }[];
  onChange: (v: T) => void;
  icon?: React.ReactNode;
  tone?: "good" | "watch";
}) {
  const selBg = tone === "watch" ? "#fdf3e3" : "#e8f6ee";
  const selBorder = tone === "watch" ? "#f0cd8e" : "#bfe6d0";
  const selIcon = tone === "watch" ? "#dd8a0c" : "#15a06a";
  return (
    <div
      className="flex items-center justify-between gap-3 py-3.5"
      style={{ borderTop: "1px solid #f3f2ed" }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <span className="shrink-0" style={{ color: "#7a7b73" }} aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="text-[14.5px] font-medium text-[#1d1d1b]">{label}</span>
      </span>
      <div className="flex flex-wrap justify-end gap-1.5">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              // key flips when selection changes so the chosen chip remounts and
              // replays the pop animation — the little dopamine hit on every tap.
              key={`${opt.value}-${selected}`}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`paw-press flex h-[38px] items-center gap-1.5 px-2.5 transition-all duration-150 ${
                selected ? "paw-pop" : ""
              }`}
              style={{
                borderRadius: 9,
                background: selected ? selBg : "transparent",
                border: `1px solid ${selected ? selBorder : "transparent"}`,
              }}
              aria-pressed={selected}
            >
              <span
                className="text-base leading-none"
                style={{ color: selected ? selIcon : "#c8c9c0" }}
              >
                {opt.emoji}
              </span>
              <span
                className="text-[11px] font-medium"
                style={{ color: selected ? selIcon : "#c8c9c0" }}
              >
                {opt.label}
              </span>
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

/** Shared checkbox list for simple boolean context_signals packs. */
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
    <>
      {items.map(({ key, label }) => {
        const checked = Boolean(values?.[key]);
        return (
          <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1d1d1b]">
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
    </>
  );
}

export default function HealthLogPage() {
  const { activePet, pets } = useAppStore();
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [afterSaveSignals, setAfterSaveSignals] = useState<DetectedSignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  // Display-only signed URLs (parallel to form.photo_urls paths) for thumbnails.
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  // Presentation-only: which observation pack tab is visible.
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

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <DailyLogAnimations />
      <Celebration trigger={celebrate} streak={streak} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[29px] font-bold leading-tight text-[#1d1d1b]">
            {(activePet?.name ?? "your dog").replace(/\b\p{L}/gu, (c) => c.toUpperCase())} Daily check-in
          </h1>
          <p className="mt-1 text-[15px] text-[#6f7069]">
            Teach the Brain what normal looks like.
          </p>
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
          <button
            type="submit"
            form="daily-checkin-form"
            disabled={!form.pet_id || saving}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50"
            style={{ background: "linear-gradient(180deg,#17a06d,#0a7048)" }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {saving ? "Saving…" : "Save check-in"}
          </button>
        </div>
      </div>

      {!isSupabaseConfigured ? (
        <Card className="p-4 text-sm" style={{ background: "rgba(224,164,88,0.12)", borderColor: "rgba(224,164,88,0.4)" }}>
          <p className="text-[#8a4f15]">
            You&apos;re viewing demo mode. Sign in with a saved profile to store daily
            logs and build a history.
          </p>
        </Card>
      ) : null}

      {/* Readout — what the logs show so far */}
      {readout.hasToday ? (
        <section
          className="bg-white p-5"
          style={{ borderRadius: 16, border: "1px solid #ebeae5" }}
        >
          <h2 className="text-base font-semibold text-[#1d1d1b]">{readout.headline}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#6f7069]">{readout.detail}</p>
          {readout.offSigns.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {readout.offSigns.map((s) => (
                <span
                  key={s.field}
                  className="rounded-full border px-3 py-1.5 text-sm font-medium"
                  style={{
                    background: TONE_BG[s.tone],
                    borderColor: TONE_TEXT[s.tone] + "55",
                    color: TONE_TEXT[s.tone],
                  }}
                >
                  {s.label}: {s.valueLabel}
                </span>
              ))}
            </div>
          ) : null}
          {readout.changes.length > 0 ? (
            <div className="mt-4 border-t border-[#e8e2d8] pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
                Since your last log
              </p>
              <ul className="mt-2 space-y-1.5">
                {readout.changes.map((c) => (
                  <li key={c.field} className="flex items-start gap-2 text-sm text-[#4a463f]">
                    <span
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background:
                          c.direction === "improved"
                            ? "#00a878"
                            : c.direction === "worse"
                              ? "#d98b3a"
                              : "#a8a097",
                      }}
                      aria-hidden
                    />
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Log form */}
      <form id="daily-checkin-form" onSubmit={(e) => void submit(e)}>
        <Card
          className="p-5 sm:p-6 space-y-0"
          style={{ borderRadius: 16, borderColor: "#ebeae5" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#85867e]">
            Today&apos;s baseline
          </p>
          {/* Date + pet header */}
          <div className="pb-4 pt-3 flex flex-wrap items-end gap-4">
            {pets.length > 1 && (
              <Select
                label="Dog"
                value={form.pet_id}
                onChange={(e) => setField("pet_id", e.target.value)}
                options={petOptions}
                required
              />
            )}
            <Input
              label="Date"
              type="date"
              value={form.log_date ?? todayIso()}
              max={todayIso()}
              onChange={(e) => setField("log_date", e.target.value)}
            />
          </div>

          {/* Emoji metric selectors */}
          <EmojiMetricRow
            label="Appetite"
            icon={<Utensils size={18} aria-hidden />}
            value={form.appetite}
            options={[
              { value: "none" as const, emoji: "😔", label: "None" },
              { value: "reduced" as const, emoji: "😐", label: "Reduced" },
              { value: "normal" as const, emoji: "😊", label: "Normal" },
              { value: "increased" as const, emoji: "😋", label: "More" },
            ]}
            onChange={(v) => setField("appetite", v)}
          />
          <EmojiMetricRow
            label="Energy"
            icon={<Zap size={18} aria-hidden />}
            value={form.energy}
            options={[
              { value: "low" as const, emoji: "😴", label: "Low" },
              { value: "normal" as const, emoji: "😊", label: "Normal" },
              { value: "high" as const, emoji: "⚡", label: "High" },
            ]}
            onChange={(v) => setField("energy", v)}
          />
          <EmojiMetricRow
            label="Water"
            icon={<Droplets size={18} aria-hidden />}
            value={form.water}
            options={[
              { value: "less" as const, emoji: "💧", label: "Less" },
              { value: "normal" as const, emoji: "😊", label: "Normal" },
              { value: "more" as const, emoji: "🫗", label: "More" },
            ]}
            onChange={(v) => setField("water", v)}
          />
          <EmojiMetricRow
            label="Stool"
            icon={<Activity size={18} aria-hidden />}
            value={form.stool}
            options={[
              { value: "diarrhea" as const, emoji: "😣", label: "Loose" },
              { value: "soft" as const, emoji: "😕", label: "Soft" },
              { value: "normal" as const, emoji: "✅", label: "Normal" },
              { value: "none" as const, emoji: "❌", label: "None" },
            ]}
            onChange={(v) => setField("stool", v)}
          />
          <EmojiMetricRow
            label="Urination"
            icon={<Waves size={18} aria-hidden />}
            value={form.urination}
            options={[
              { value: "straining" as const, emoji: "😣", label: "Straining" },
              { value: "less" as const, emoji: "🔅", label: "Less" },
              { value: "normal" as const, emoji: "✅", label: "Normal" },
              { value: "more" as const, emoji: "💦", label: "More" },
            ]}
            onChange={(v) => setField("urination", v)}
          />
          <EmojiMetricRow
            label="Breathing"
            icon={<Wind size={18} aria-hidden />}
            tone="watch"
            value={breathingValue}
            options={[
              { value: "labored" as const, emoji: "😮‍💨", label: "Labored" },
              { value: "coughing" as const, emoji: "😷", label: "Cough" },
              { value: "normal" as const, emoji: "✅", label: "Normal" },
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
              { value: "limping" as const, emoji: "🦴", label: "Limping" },
              { value: "stiff" as const, emoji: "😬", label: "Stiff" },
              { value: "normal" as const, emoji: "✅", label: "Normal" },
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

          {/* Vomiting counter */}
          <div
            className="flex items-center justify-between gap-3 py-3.5"
            style={{ borderTop: "1px solid #f3f2ed" }}
          >
            <span className="flex items-center gap-2.5">
              <span className="shrink-0" style={{ color: "#7a7b73" }} aria-hidden>
                <Activity size={18} />
              </span>
              <span className="text-[14.5px] font-medium text-[#1d1d1b]">Vomiting</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setField("vomiting_count", Math.max(0, form.vomiting_count - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border text-[#1d1d1b] transition-colors hover:bg-[#f5f4f0] text-lg font-medium"
                style={{ borderColor: "#e6e5e0" }}
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold text-[#1d1d1b]">{form.vomiting_count}</span>
              <button
                type="button"
                onClick={() => setField("vomiting_count", Math.min(100, form.vomiting_count + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border text-[#1d1d1b] transition-colors hover:bg-[#f5f4f0] text-lg font-medium"
                style={{ borderColor: "#e6e5e0" }}
              >
                +
              </button>
            </div>
          </div>

          {/* Weight */}
          <div
            className="flex items-center justify-between gap-3 py-3.5"
            style={{ borderTop: "1px solid #f3f2ed" }}
          >
            <span className="flex items-center gap-2.5">
              <span className="shrink-0" style={{ color: "#7a7b73" }} aria-hidden>
                <Scale size={18} />
              </span>
              <span className="text-[14.5px] font-medium text-[#1d1d1b]">Weight</span>
            </span>
            <div className="flex items-center gap-2">
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
                className="w-24 px-3 py-2 text-sm text-[#1d1d1b] placeholder-[#c8c9c0] focus:outline-none"
                style={{ background: "#f5f4f0", border: "1px solid #e6e5e0", borderRadius: 8 }}
              />
              <span className="text-sm text-[#6f7069]">kg</span>
            </div>
          </div>

          {/* Meds */}
          <label
            className="flex items-center gap-2.5 py-3.5 text-[14.5px] text-[#1d1d1b] cursor-pointer"
            style={{ borderTop: "1px solid #f3f2ed" }}
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

          {/* Specific observations — collapsible pack inputs */}
          <details
            className="group mt-3"
            style={{ borderTop: "1px solid #f3f2ed" }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-3.5 text-[14.5px] font-medium text-[#1d1d1b]">
              <span>Specific observations <span className="ml-1 text-xs font-normal text-[#85867e]">(optional)</span></span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[#85867e] transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-4 pb-2">
              <p className="text-xs text-[#85867e]">
                Tap the signs you noticed today. These go to your vet history — they&apos;re owner observations, not a diagnosis.
              </p>

              {/* Underline tabs */}
              <div
                className="flex flex-wrap gap-x-4 gap-y-1 overflow-x-auto"
                style={{ borderBottom: "1px solid #f3f2ed" }}
                role="tablist"
              >
                {([
                  { id: "gi", label: "GI" },
                  { id: "urinary", label: "Urinary" },
                  { id: "mobility", label: "Mobility" },
                  { id: "skin_ear", label: "Skin & ear" },
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
                      className="whitespace-nowrap pb-2 text-sm transition-colors"
                      style={{
                        color: active ? "#0b7a4d" : "#85867e",
                        fontWeight: active ? 600 : 500,
                        borderBottom: active ? "2px solid #0b7a4d" : "2px solid transparent",
                        marginBottom: -1,
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* GI */}
              <fieldset hidden={obsTab !== "gi"}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6f7069]">Digestion &amp; stomach</legend>
                <div className="mt-2 space-y-2">
                  <PackCheckboxes
                    items={[
                      { key: "blood_in_stool", label: "Blood in stool" },
                      { key: "straining", label: "Straining to go" },
                    ]}
                    values={form.context_signals?.gi}
                    onChange={(key, checked) => setSignals({ gi: { ...(form.context_signals?.gi ?? {}), [key]: checked } })}
                  />
                  <Input
                    label="GI note (optional)"
                    value={form.context_signals?.gi?.change_note ?? ""}
                    onChange={(e) => setSignals({ gi: { ...(form.context_signals?.gi ?? {}), change_note: e.target.value || undefined } })}
                    placeholder="e.g. loose stool for 2 days"
                  />
                </div>
              </fieldset>

              {/* Urinary */}
              <fieldset hidden={obsTab !== "urinary"}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6f7069]">Drinking &amp; urination</legend>
                <div className="mt-2 space-y-2">
                  <PackCheckboxes
                    items={[
                      { key: "increased_thirst", label: "Drinking more than usual" },
                      { key: "accidents", label: "Accidents indoors" },
                      { key: "color_change", label: "Urine looks different (color/smell)" },
                    ]}
                    values={form.context_signals?.urinary}
                    onChange={(key, checked) => setSignals({ urinary: { ...(form.context_signals?.urinary ?? {}), [key]: checked } })}
                  />
                </div>
              </fieldset>

              {/* Mobility */}
              <fieldset hidden={obsTab !== "mobility"}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6f7069]">Movement &amp; pain</legend>
                <div className="mt-2 space-y-2">
                  <PackCheckboxes
                    items={[
                      { key: "limping", label: "Limping" },
                      { key: "reluctance_to_move", label: "Reluctant to get up or move" },
                    ]}
                    values={form.context_signals?.mobility}
                    onChange={(key, checked) => setSignals({ mobility: { ...(form.context_signals?.mobility ?? {}), [key]: checked } })}
                  />
                  {form.context_signals?.mobility?.limping && (
                    <Input
                      label="Which leg? (optional)"
                      value={form.context_signals?.mobility?.limb ?? ""}
                      onChange={(e) => setSignals({ mobility: { ...(form.context_signals?.mobility ?? {}), limping: true, limb: e.target.value || undefined } })}
                      placeholder="e.g. front left"
                    />
                  )}
                </div>
              </fieldset>

              {/* Skin/Ear */}
              <fieldset hidden={obsTab !== "skin_ear"}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6f7069]">Skin &amp; ears</legend>
                <div className="mt-2 space-y-2">
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
                </div>
              </fieldset>

              {/* Breathing */}
              <fieldset hidden={obsTab !== "breathing"}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6f7069]">Breathing &amp; heart</legend>
                <div className="mt-2 space-y-2">
                  <PackCheckboxes
                    items={[
                      { key: "coughing", label: "Coughing" },
                      { key: "labored", label: "Labored or fast breathing" },
                      { key: "exercise_intolerance", label: "Tires quickly on walks" },
                    ]}
                    values={form.context_signals?.breathing}
                    onChange={(key, checked) => setSignals({ breathing: { ...(form.context_signals?.breathing ?? {}), [key]: checked } })}
                  />
                </div>
              </fieldset>

              {/* Seizure/episode */}
              <fieldset hidden={obsTab !== "seizure"}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6f7069]">Seizure or episode</legend>
                <div className="mt-2 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1d1d1b]">
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
                    <>
                      <Input
                        label="Duration (seconds, optional)"
                        type="number"
                        min={0}
                        max={7200}
                        value={form.context_signals?.seizure?.duration_sec != null ? String(form.context_signals.seizure.duration_sec) : ""}
                        onChange={(e) => setSignals({ seizure: { ...(form.context_signals?.seizure ?? { occurred: true }), duration_sec: e.target.value ? Number(e.target.value) : undefined } })}
                      />
                      <Textarea
                        label="Recovery notes (optional)"
                        value={form.context_signals?.seizure?.recovery_note ?? ""}
                        onChange={(e) => setSignals({ seizure: { ...(form.context_signals?.seizure ?? { occurred: true }), recovery_note: e.target.value || undefined } })}
                        placeholder="How long to recover? Any confusion?"
                        rows={2}
                      />
                    </>
                  )}
                </div>
              </fieldset>

              {/* Medication event */}
              <fieldset hidden={obsTab !== "medication"}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6f7069]">Medication history</legend>
                <p className="mb-2 text-xs text-[#85867e]">Record what was given — for your vet history only, not dosing advice.</p>
                <div className="space-y-2">
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
                    <label className="flex cursor-pointer items-end gap-2.5 pb-2.5 text-sm text-[#1d1d1b]">
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
                  <Textarea
                    label="Side effects noted (optional)"
                    value={form.context_signals?.medication?.side_effect_notes ?? ""}
                    onChange={(e) => setSignals({ medication: { ...(form.context_signals?.medication ?? {}), side_effect_notes: e.target.value || undefined } })}
                    placeholder="Owner observations only — contact your vet for any concerns"
                    rows={2}
                  />
                </div>
              </fieldset>
            </div>
          </details>

          <div className="pt-3.5" style={{ borderTop: "1px solid #f3f2ed" }}>
            <Textarea
              label="Notes (optional)"
              value={form.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Anything else you noticed today?"
              rows={3}
            />
            <p className="mt-1 text-right text-[11px] text-[#85867e]">
              {(form.notes ?? "").length} characters
            </p>
          </div>

          {/* Photo upload — real file upload to owner-scoped Supabase Storage */}
          <div className="pt-3.5" style={{ borderTop: "1px solid #f3f2ed" }}>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-[#1d1d1b]">
                Photos <span className="text-xs font-normal text-[#85867e]">(optional)</span>
              </label>
              {photoCount > 0 ? (
                <button
                  type="button"
                  className="text-xs font-medium text-[#cf4338] hover:underline"
                  onClick={() => {
                    setField("photo_urls", null);
                    setPhotoPreviews([]);
                  }}
                >
                  Clear ({photoCount})
                </button>
              ) : null}
            </div>

            {photoPreviews.some(Boolean) ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {photoPreviews.map((url, i) =>
                  url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt="Attached health-log photo"
                      className="h-16 w-16 rounded-lg border object-cover"
                      style={{
                        borderColor: "#ebeae5",
                        backgroundImage:
                          "repeating-linear-gradient(45deg,#f5f4f0,#f5f4f0 6px,#ebeae5 6px,#ebeae5 12px)",
                      }}
                    />
                  ) : null,
                )}
              </div>
            ) : null}

            <label
              className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1.5 px-4 py-6 text-center transition-colors hover:bg-[#faf9f6] ${
                photoUploading || !isSupabaseConfigured ? "pointer-events-none opacity-50" : ""
              }`}
              style={{ border: "1.5px dashed #d4d3cc", borderRadius: 10 }}
            >
              {photoUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-[#7a7b73]" aria-hidden />
              ) : (
                <UploadCloud className="h-5 w-5 text-[#7a7b73]" aria-hidden />
              )}
              <span className="text-sm font-medium text-[#1d1d1b]">
                {photoUploading ? "Uploading…" : "Upload photo"}
              </span>
              <span className="text-xs text-[#85867e]">JPG, PNG, or WebP up to 5MB each (max 6)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                disabled={photoUploading || !isSupabaseConfigured}
                onChange={(e) => void onPhotoFiles(e)}
              />
            </label>
            <p className="mt-1 text-xs text-[#85867e]">
              Stored privately for your vet records.
            </p>
          </div>

          {error ? (
            <p className="pt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          {/* After-save confirmation + signal chips */}
          {savedAt ? (
            <div className="space-y-3 pt-3">
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-3"
                style={{ background: "#e8f6ee", border: "1px solid #bfe6d0" }}
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#15a06a]" aria-hidden />
                <p className="text-sm font-medium text-[#0b7a4d]">
                  Check-in saved!{" "}
                  <span className="font-normal">{savedAt}</span>
                </p>
              </div>
              {signalsLoading ? (
                <p className="text-xs text-[#6f7069]">Checking patterns…</p>
              ) : afterSaveSignals.length > 0 ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#85867e] mb-2">
                    What the brain noticed
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {afterSaveSignals.slice(0, 3).map((s, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                        style={{ background: "#fdf3e3", color: "#b5740a", border: "1px solid #f0cd8e" }}
                      >
                        {s.owner_message}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Full-width save button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={!form.pet_id || saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
              style={{ background: "linear-gradient(180deg,#17a06d,#0a7048)" }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {saving ? "Saving…" : "Save check-in"}
            </button>
          </div>
        </Card>
      </form>

      {/* Recent logs */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[#6f7069]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading your check-ins…
        </div>
      ) : logs.length > 0 ? (
        <section>
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

      <p className="px-2 pb-4 pt-1 text-center text-xs leading-relaxed text-[#85867e]">
        Daily logs help you and your vet spot changes — they&apos;re not a diagnosis.
        If you&apos;re worried or things get worse, contact your vet.
      </p>
    </div>
  );
}
