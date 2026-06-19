"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import Card from "@/components/ui/card";
import Button, { buttonClassName } from "@/components/ui/button";
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

/** Emoji face selector row — replaces boring Select dropdowns for the core metrics. */
function EmojiMetricRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; emoji: string; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-3">
      <span className="w-24 shrink-0 text-sm font-medium text-[#4a463f]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              // key flips when selection changes so the chosen chip remounts and
              // replays the pop animation — the little dopamine hit on every tap.
              key={`${opt.value}-${selected}`}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`paw-press flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition-all duration-150 hover:-translate-y-0.5 ${
                selected ? "paw-pop" : ""
              }`}
              style={{
                background: selected ? "#e7f4ee" : "#f7f4ef",
                border: `2px solid ${selected ? "#1f9d6b" : "transparent"}`,
                boxShadow: selected ? "0 4px 12px rgba(31,157,107,0.25)" : "none",
              }}
              aria-pressed={selected}
            >
              <span className="text-xl leading-none">{opt.emoji}</span>
              <span
                className="text-[10px] font-medium"
                style={{ color: selected ? "#15795a" : "#8a7f74" }}
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
      {items.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-2 text-sm text-[#4a463f]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={Boolean(values?.[key])}
            onChange={(e) => onChange(key, e.target.checked)}
          />
          {label}
        </label>
      ))}
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

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <DailyLogAnimations />
      <Celebration trigger={celebrate} streak={streak} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#1c2522]">
            {(activePet?.name ?? "your dog").replace(/\b\p{L}/gu, (c) => c.toUpperCase())} Daily check-in
          </h1>
          <p className="mt-1 text-[15px] text-[#8a978f]">
            Teach the Brain what normal looks like.
          </p>
        </div>
        {streak > 0 && (
          <div className="paw-streak flex items-center gap-2 rounded-full border border-[#ffe0b2] bg-[#fff6e9] px-4 py-2">
            <span className="text-lg leading-none">🔥</span>
            <div className="leading-tight">
              <div className="text-base font-bold text-[#c1852a]">{streak}-day streak</div>
              <div className="text-[11px] text-[#a8895a]">Keep it going!</div>
            </div>
          </div>
        )}
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
        <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
          <h2 className="text-base font-semibold text-[#2c2a26]">{readout.headline}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#6b665d]">{readout.detail}</p>
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
      <form onSubmit={(e) => void submit(e)}>
        <Card className="p-5 sm:p-6 space-y-0 divide-y divide-[#f0ede8]">
          {/* Date + pet header */}
          <div className="pb-4 flex flex-wrap items-end gap-4">
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
            value={form.stool}
            options={[
              { value: "diarrhea" as const, emoji: "😣", label: "Loose" },
              { value: "soft" as const, emoji: "😕", label: "Soft" },
              { value: "normal" as const, emoji: "✅", label: "Normal" },
              { value: "none" as const, emoji: "❌", label: "None" },
            ]}
            onChange={(v) => setField("stool", v)}
          />

          {/* Vomiting counter */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-[#4a463f]">Vomiting</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setField("vomiting_count", Math.max(0, form.vomiting_count - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e2d8] text-[#4a463f] hover:bg-[#f7f4ef] transition-colors text-lg font-medium"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold text-[#1c1814]">{form.vomiting_count}</span>
              <button
                type="button"
                onClick={() => setField("vomiting_count", Math.min(100, form.vomiting_count + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e2d8] text-[#4a463f] hover:bg-[#f7f4ef] transition-colors text-lg font-medium"
              >
                +
              </button>
            </div>
          </div>

          {/* Weight */}
          <div className="py-3">
            <Input
              label="Weight (kg, optional)"
              type="number"
              min={0}
              step="0.1"
              value={form.weight_kg != null ? String(form.weight_kg) : ""}
              onChange={(e) =>
                setField("weight_kg", e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>

          {/* Meds */}
          <label className="flex items-center gap-2 py-3 text-sm text-[#4a463f] cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={form.meds_given}
              onChange={(e) => setField("meds_given", e.target.checked)}
            />
            Gave medication / fluids today
          </label>

          {/* Specific observations — collapsible pack inputs */}
          <details className="group rounded-xl border border-[#e8e2d8]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[#4a463f]">
              <span>Specific observations <span className="ml-1 text-xs font-normal text-[#8a857a]">(optional)</span></span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[#8a857a] transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-4 border-t border-[#e8e2d8] px-4 py-4">
              <p className="text-xs text-[#8a857a]">
                Tap the signs you noticed today. These go to your vet history — they&apos;re owner observations, not a diagnosis.
              </p>

              {/* GI */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6b665d]">Digestion &amp; stomach</legend>
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
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6b665d]">Drinking &amp; urination</legend>
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
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6b665d]">Movement &amp; pain</legend>
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
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6b665d]">Skin &amp; ears</legend>
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
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6b665d]">Breathing &amp; heart</legend>
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
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6b665d]">Seizure or episode</legend>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-[#4a463f]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={form.context_signals?.seizure?.occurred ?? false}
                      onChange={(e) => setSignals({ seizure: { ...(form.context_signals?.seizure ?? { occurred: false }), occurred: e.target.checked } })}
                    />
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
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-[#6b665d]">Medication history</legend>
                <p className="mb-2 text-xs text-[#8a857a]">Record what was given — for your vet history only, not dosing advice.</p>
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
                    <label className="flex items-end gap-2 pb-2.5 text-sm text-[#4a463f]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={form.context_signals?.medication?.missed_late ?? false}
                        onChange={(e) => setSignals({ medication: { ...(form.context_signals?.medication ?? {}), missed_late: e.target.checked || undefined } })}
                      />
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

          <Textarea
            label="Notes (optional)"
            value={form.notes ?? ""}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="Anything else you noticed today?"
            rows={3}
          />

          {/* Photo upload — real file upload to owner-scoped Supabase Storage */}
          <div>
            <label className="block text-sm font-medium text-[#4a463f]">
              Photos <span className="text-xs font-normal text-[#8a857a]">(optional)</span>
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <label
                className={`${buttonClassName({ variant: "outline", size: "sm" })} cursor-pointer ${
                  photoUploading || !isSupabaseConfigured ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {photoUploading ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                    Uploading…
                  </>
                ) : (
                  "Add photos"
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  disabled={photoUploading || !isSupabaseConfigured}
                  onChange={(e) => void onPhotoFiles(e)}
                />
              </label>
              {photoCount > 0 ? (
                <span className="text-sm text-[#4a463f]">
                  {photoCount} photo{photoCount === 1 ? "" : "s"} attached
                  <button
                    type="button"
                    className="ml-2 text-xs font-medium text-[#b23636] hover:underline"
                    onClick={() => {
                      setField("photo_urls", null);
                      setPhotoPreviews([]);
                    }}
                  >
                    Clear
                  </button>
                </span>
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
                      className="h-16 w-16 rounded-lg border border-[#e8e2d8] object-cover"
                    />
                  ) : null,
                )}
              </div>
            ) : null}
            <p className="mt-1 text-xs text-[#8a857a]">
              JPG, PNG, or WebP up to 5MB each (max 6). Stored privately for your vet records.
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
              <div className="flex items-center gap-2 rounded-xl bg-[#e7f4ee] px-4 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1f9d6b]" aria-hidden />
                <p className="text-sm font-medium text-[#15795a]">
                  Check-in saved!{" "}
                  <span className="font-normal">{savedAt}</span>
                </p>
              </div>
              {signalsLoading ? (
                <p className="text-xs text-[#6b665d]">Checking patterns…</p>
              ) : afterSaveSignals.length > 0 ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f] mb-2">
                    What the brain noticed
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {afterSaveSignals.slice(0, 3).map((s, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                        style={{ background: "#fbf0db", color: "#c1852a", border: "1px solid #f5d8a0" }}
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
              className="w-full rounded-xl bg-[#1f9d6b] py-3.5 text-base font-semibold text-white hover:bg-[#15795a] disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save check-in"}
            </button>
          </div>
        </Card>
      </form>

      {/* Recent logs */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[#6b665d]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading your check-ins…
        </div>
      ) : logs.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
            Recent check-ins
          </p>
          <div className="space-y-2">
            {logs.slice(0, 7).map((log) => {
              const off = buildHealthLogReadout([log]).offSigns;
              return (
                <Card key={log.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#2c2a26]">{log.log_date}</p>
                    <p className="truncate text-xs text-[#8a857a]">
                      {off.length === 0
                        ? "All normal"
                        : off.map((s) => `${s.label}: ${s.valueLabel}`).join(" · ")}
                    </p>
                  </div>
                  {log.meds_given ? (
                    <span className="shrink-0 rounded-full bg-[#f7f4ef] px-2.5 py-1 text-xs text-[#6b665d]">
                      Meds ✓
                    </span>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <p className="px-2 pb-4 pt-1 text-center text-xs leading-relaxed text-[#8a857a]">
        Daily logs help you and your vet spot changes — they&apos;re not a diagnosis.
        If you&apos;re worried or things get worse, contact your vet.
      </p>
    </div>
  );
}
