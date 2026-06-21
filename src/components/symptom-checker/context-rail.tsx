"use client";

/**
 * Symptom Checker context UI (mockup #2) — additive layout around the existing
 * triage chat. Purely presentational over REAL owner data; never touches the
 * deterministic triage logic.
 *
 *  - SymptomContextStrip  → "Dog Brain context" counts (logs/photos/signals/reminders)
 *  - SymptomRemembersPanel → "What PawVital remembers" (active Dog Brain signals)
 */

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Camera,
  Activity,
  Bell,
  Info,
  ShieldCheck,
  Utensils,
  Waves,
  Droplets,
  Footprints,
  Scale,
  AlertCircle,
  Pill,
} from "lucide-react";
import type { HealthLog } from "@/lib/health-log/types";
import type { DetectedSignal, SignalSeverity, SignalType } from "@/lib/dog-brain/types";

const SIGNAL_TITLE: Record<SignalType, string> = {
  appetite_drop: "Appetite change",
  stool_change: "Stool change",
  vomiting_trend: "Vomiting",
  weight_downtrend: "Weight downtrend",
  water_urination_change: "Thirst & urination",
  mobility_pain_change: "Mobility & pain",
  possible_med_side_effect: "Medication note",
};

const SIGNAL_ICON: Record<SignalType, typeof Utensils> = {
  appetite_drop: Utensils,
  stool_change: Waves,
  vomiting_trend: AlertCircle,
  weight_downtrend: Scale,
  water_urination_change: Droplets,
  mobility_pain_change: Footprints,
  possible_med_side_effect: Pill,
};

const SEV_META: Record<SignalSeverity, { line: string; bg: string; fg: string }> = {
  info: { line: "#4f7fb8", bg: "#f0f5fb", fg: "#4f7fb8" },
  watch: { line: "#e8a23c", bg: "#fdf8ef", fg: "#c1852a" },
  alert: { line: "#e2675b", bg: "#fdf1ef", fg: "#b8473c" },
};

export function SymptomContextStrip({ petId, petName }: { petId: string | null; petName: string }) {
  const [counts, setCounts] = useState({ logs: 0, photos: 0, signals: 0, reminders: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!petId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [lgRes, remRes, sigRes] = await Promise.all([
          fetch(`/api/health-log?pet_id=${petId}&limit=14`),
          fetch(`/api/reminders?pet_id=${petId}&limit=50`),
          fetch(`/api/dog-brain/signals?pet_id=${petId}`),
        ]);
        const lg = (await lgRes.json().catch(() => null)) as { data?: HealthLog[] } | null;
        const rem = (await remRes.json().catch(() => null)) as { data?: unknown[] } | null;
        const sig = (await sigRes.json().catch(() => null)) as { signals?: DetectedSignal[] } | null;
        if (cancelled) return;
        const logs = Array.isArray(lg?.data) ? lg!.data : [];
        setCounts({
          logs: logs.length,
          photos: logs.reduce((n, l) => n + (Array.isArray(l.photo_urls) ? l.photo_urls.length : 0), 0),
          signals: Array.isArray(sig?.signals) ? sig!.signals.length : 0,
          reminders: Array.isArray(rem?.data) ? rem!.data.length : 0,
        });
      } catch {
        /* leave at zero */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [petId]);

  const tiles = [
    { Icon: ClipboardList, value: counts.logs, label: "Daily logs", sub: "Last 14 days" },
    { Icon: Camera, value: counts.photos, label: "Photos", sub: "Last 14 days" },
    { Icon: Activity, value: counts.signals, label: "Health signals", sub: "Active patterns" },
    { Icon: Bell, value: counts.reminders, label: "Reminders", sub: "Active" },
  ];

  return (
    <div className="rounded-xl border border-[#d8ebe1] bg-[#f3f9f6] px-4 py-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Info className="h-4 w-4 text-[#15795a]" aria-hidden />
        <span className="text-[13px] font-semibold text-[#15795a]">Dog Brain context for {petName}</span>
        <span className="text-[11px] text-[#6f8579]">— what PawVital already knows (supportive context only)</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex items-center gap-2.5">
            <t.Icon className="h-[18px] w-[18px] flex-shrink-0 text-[#1f9d6b]" aria-hidden />
            <div className="min-w-0">
              <div className="text-base font-semibold leading-none text-[#1c2522]">{loaded ? t.value : "·"}</div>
              <div className="mt-0.5 text-[11px] text-[#7d8e86]">{t.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SymptomRemembersPanel({ petId }: { petId: string | null }) {
  const [signals, setSignals] = useState<DetectedSignal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!petId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dog-brain/signals?pet_id=${petId}`);
        const j = (await res.json().catch(() => null)) as { signals?: DetectedSignal[] } | null;
        if (!cancelled) setSignals(Array.isArray(j?.signals) ? j!.signals : []);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [petId]);

  return (
    <aside className="space-y-3">
      <div className="rounded-2xl border border-[#eef1ef] bg-white p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#8a978f]">
          What PawVital remembers
        </p>
        {signals.length > 0 ? (
          <ul className="space-y-2.5">
            {signals.map((s) => {
              const m = SEV_META[s.severity];
              const Icon = SIGNAL_ICON[s.signal_type];
              return (
                <li
                  key={s.dedupe_key}
                  className="flex gap-2.5 rounded-r-lg border-l-[3px] py-2 pl-2.5 pr-2"
                  style={{ borderColor: m.line, background: m.bg }}
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "#ffffff", color: m.fg }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-[#1c2522]">{SIGNAL_TITLE[s.signal_type]}</span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                        style={{ background: "#ffffff", color: m.fg }}
                      >
                        {s.severity === "info" ? "Noted" : "Recent change"}
                      </span>
                    </div>
                    <div className="text-[11px] leading-snug text-[#8a978f]">{s.owner_message}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-[#8a978f]">
            {loaded
              ? "No patterns noted yet — your daily logs build this memory over time."
              : "Loading…"}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[#d6e4f2] bg-[#f0f5fb] p-4">
        <div className="flex gap-2">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-[#4f7fb8]" aria-hidden />
          <p className="text-[11px] leading-relaxed text-[#5a6f86]">
            <span className="font-medium">This is not a diagnosis.</span> PawVital gives general guidance from what
            you share. Always consult your vet for diagnosis and treatment.
          </p>
        </div>
      </div>

      <a
        href="/analytics"
        target="_top"
        className="block rounded-lg border border-[#bfe0cf] bg-white py-2 text-center text-xs font-medium text-[#15795a] hover:bg-[#f3f9f6] transition-colors"
      >
        View full history &amp; signals
      </a>
    </aside>
  );
}
