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
  Image as ImageIcon,
  FileText,
  Clock,
  Info,
  ShieldCheck,
  Utensils,
  Waves,
  Droplets,
  Footprints,
  Wind,
  Bug,
  BatteryLow,
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
  breathing_cough_change: "Breathing & cough",
  skin_ear_change: "Skin & ear",
  energy_behavior_change: "Energy & behavior",
  possible_med_side_effect: "Medication note",
};

const SIGNAL_ICON: Record<SignalType, typeof Utensils> = {
  appetite_drop: Utensils,
  stool_change: Waves,
  vomiting_trend: AlertCircle,
  weight_downtrend: Scale,
  water_urination_change: Droplets,
  mobility_pain_change: Footprints,
  breathing_cough_change: Wind,
  skin_ear_change: Bug,
  energy_behavior_change: BatteryLow,
  possible_med_side_effect: Pill,
};

const SEV_META: Record<SignalSeverity, { line: string; bg: string; fg: string }> = {
  info: { line: "#4f7fb8", bg: "#f0f5fb", fg: "#4f7fb8" },
  watch: { line: "#e8a23c", bg: "#fdf8ef", fg: "#c1852a" },
  alert: { line: "#e2675b", bg: "#fdf1ef", fg: "#b8473c" },
};

export function SymptomContextStrip({ petId, petName }: { petId: string | null; petName: string }) {
  const [counts, setCounts] = useState({
    logs: 0,
    photos: 0,
    vetRecords: 0,
    symptomChecks: 0,
    openFollowUps: 0,
  });
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
          fetch(`/api/health-log?pet_id=${petId}&limit=90`),
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
          vetRecords: Array.isArray(rem?.data) ? rem!.data.length : 0,
          symptomChecks: Array.isArray(sig?.signals) ? sig!.signals.length : 0,
          openFollowUps: Array.isArray(sig?.signals)
            ? sig!.signals.filter((s) => s.severity !== "info").length
            : 0,
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

  const val = (v: number) => (loaded ? v : "·");

  const tiles: {
    Icon: typeof Utensils;
    color: string;
    value: number;
    valueColor?: string;
    label: string;
    sub: string;
  }[] = [
    { Icon: Clock, color: "#6f8a5c", value: counts.logs, label: "Daily logs", sub: "Last 90 days" },
    { Icon: ImageIcon, color: "#7d6ab5", value: counts.photos, label: "Photos", sub: "Last 90 days" },
    { Icon: FileText, color: "#4d7cb5", value: counts.vetRecords, label: "Vet records", sub: "On file" },
    { Icon: ClipboardList, color: "#b5740a", value: counts.symptomChecks, label: "Symptom checks", sub: "Last 90 days" },
    {
      Icon: Clock,
      color: "#e0890a",
      value: counts.openFollowUps,
      valueColor: "#e0890a",
      label: "Open follow-ups",
      sub: "Need answers",
    },
  ];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ebeae5",
        borderRadius: "14px",
        padding: "16px 22px",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <div className="flex items-center gap-[7px] text-[14px] font-bold" style={{ color: "#1d1d1b" }}>
            90-day Brain context for {petName}
            <Info className="h-[14px] w-[14px]" style={{ color: "#b6b7af" }} aria-hidden />
          </div>
          {tiles.map((t) => (
            <div key={t.label} className="flex items-center gap-2.5">
              <t.Icon className="h-[18px] w-[18px] flex-shrink-0" style={{ color: t.color }} aria-hidden />
              <div className="min-w-0">
                <div
                  className="text-[16px] font-bold leading-none"
                  style={{ color: t.valueColor ?? "#1d1d1b" }}
                >
                  {val(t.value)}
                </div>
                <div className="text-[12px]" style={{ color: "#6f7069" }}>
                  {t.label}
                </div>
                <div className="text-[11px]" style={{ color: "#9a9b93" }}>
                  {t.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
        <a
          href="/dog-brain"
          target="_top"
          className="flex-shrink-0 cursor-pointer text-[13.5px] font-semibold"
          style={{
            background: "#fff",
            border: "1px solid #bfe2cf",
            color: "#0b7a4d",
            borderRadius: "10px",
            padding: "9px 15px",
          }}
        >
          View all context
        </a>
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
    <aside className="flex flex-col gap-4">
      <div style={{ background: "#fff", border: "1px solid #ebeae5", borderRadius: "16px", padding: "18px 20px" }}>
        <div
          className="mb-[13px] flex items-center gap-[7px] text-[15px] font-bold"
          style={{ color: "#1d1d1b" }}
        >
          What PawVital remembers
          <Info className="h-[14px] w-[14px]" style={{ color: "#b6b7af" }} aria-hidden />
        </div>
        {signals.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {signals.map((s) => {
              const m = SEV_META[s.severity];
              const Icon = SIGNAL_ICON[s.signal_type];
              const isChange = s.severity !== "info";
              return (
                <div
                  key={s.dedupe_key}
                  className="flex gap-[11px]"
                  style={{
                    borderLeft: `3px solid ${isChange ? "#e0890a" : "#4d7cb5"}`,
                    background: isChange ? "#fdfaf3" : "#f9fbfd",
                    borderRadius: "0 10px 10px 0",
                    padding: "11px 12px",
                  }}
                >
                  <span
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center"
                    style={{
                      borderRadius: "8px",
                      background: isChange ? "#f6ece2" : "#e7eef5",
                      color: isChange ? "#c87d3e" : "#4d7cb5",
                    }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="text-[14px] font-semibold" style={{ color: "#1d1d1b" }}>
                        {SIGNAL_TITLE[s.signal_type]}
                      </span>
                      <span
                        className="flex-shrink-0 whitespace-nowrap text-[10.5px] font-semibold"
                        style={{
                          background: isChange ? "#fdf3e3" : "#dde7f1",
                          color: isChange ? "#b5740a" : "#4d7cb5",
                          padding: "2px 7px",
                          borderRadius: "11px",
                        }}
                      >
                        {isChange ? "Recent change" : "Noted"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "#6f7069" }}>
                      {s.owner_message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "#8a978f" }}>
            {loaded
              ? "No patterns noted yet — your daily logs build this memory over time."
              : "Loading…"}
          </p>
        )}

        <div
          className="mt-[13px] flex gap-[9px]"
          style={{ background: "#eef4fb", borderRadius: "11px", padding: "12px 13px" }}
        >
          <ShieldCheck className="mt-px h-[17px] w-[17px] flex-shrink-0" style={{ color: "#4d7cb5" }} aria-hidden />
          <div>
            <div className="text-[13px] font-semibold" style={{ color: "#3a5a82" }}>
              This is not a diagnosis.
            </div>
            <div className="mt-0.5 text-[12.5px]" style={{ color: "#5a7290", lineHeight: 1.45 }}>
              PawVital provides general guidance based on the information you share. Always consult your veterinarian
              for diagnosis and treatment.
            </div>
          </div>
        </div>
      </div>

      <a
        href="/analytics"
        target="_top"
        className="flex items-center justify-center gap-[7px] text-[14px] font-semibold transition-colors hover:bg-[#f3f9f6]"
        style={{
          background: "#fff",
          border: "1px solid #bfe2cf",
          color: "#0b7a4d",
          borderRadius: "12px",
          padding: "11px",
        }}
      >
        View full history &amp; signals
      </a>
    </aside>
  );
}
