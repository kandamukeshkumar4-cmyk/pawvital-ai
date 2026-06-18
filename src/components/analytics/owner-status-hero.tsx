"use client";

import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  HeartPulse,
  Phone,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import type { OwnerVerdict, OwnerVerdictState } from "@/lib/analytics/owner-readout";

const STATE_ICON: Record<OwnerVerdictState, typeof HeartPulse> = {
  watch: ShieldCheck,
  schedule: HeartPulse,
  urgent: AlertCircle,
  emergency: AlertTriangle,
};

type StateStyle = {
  ring: string;
  pillBg: string;
  pillText: string;
  iconBg: string;
  iconText: string;
  pillLabel: string;
};

const STATE_STYLES: Record<OwnerVerdictState, StateStyle> = {
  watch: {
    ring: "#00a878",
    pillBg: "rgba(0,168,120,0.12)",
    pillText: "#0a7d5b",
    iconBg: "rgba(0,168,120,0.12)",
    iconText: "#0a7d5b",
    pillLabel: "Stable",
  },
  schedule: {
    ring: "#e0a458",
    pillBg: "rgba(224,164,88,0.16)",
    pillText: "#9a6b1f",
    iconBg: "rgba(224,164,88,0.16)",
    iconText: "#9a6b1f",
    pillLabel: "Worth a visit",
  },
  urgent: {
    ring: "#d98b3a",
    pillBg: "rgba(217,139,58,0.16)",
    pillText: "#8a4f15",
    iconBg: "rgba(217,139,58,0.16)",
    iconText: "#8a4f15",
    pillLabel: "Get advice",
  },
  emergency: {
    ring: "#e25c5c",
    pillBg: "rgba(226,92,92,0.14)",
    pillText: "#b23636",
    iconBg: "rgba(226,92,92,0.14)",
    iconText: "#b23636",
    pillLabel: "Act now",
  },
};

function StatusRing({
  color,
  fill,
  state,
}: {
  color: string;
  fill: number;
  state: OwnerVerdictState;
}) {
  const size = 150;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0.08, Math.min(1, fill));
  const dash = circumference * clamped;
  const Icon = STATE_ICON[state];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e8e2d8"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.04)", color }}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/**
 * The hero verdict card — the single 2-second answer for a worried owner.
 * State and copy come from the deterministic triage verdict; this only renders it.
 */
export function OwnerStatusHero({
  verdict,
  petName,
  asOf,
  confidence,
}: {
  verdict: OwnerVerdict;
  petName: string;
  asOf: string | null;
  /** 0..1 — drives the ring fill (latest check confidence). */
  confidence: number;
}) {
  const style = STATE_STYLES[verdict.state];

  return (
    <section
      className="rounded-3xl border border-[#e8e2d8] bg-white p-6 shadow-sm sm:p-8"
      aria-label="Current status"
    >
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-7 sm:text-left">
        <StatusRing color={style.ring} fill={confidence} state={verdict.state} />
        <div className="min-w-0 flex-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: style.pillBg, color: style.pillText }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: style.ring }}
            />
            {style.pillLabel}
          </span>
          <h2 className="mt-2 text-2xl font-bold text-[#2c2a26] sm:text-[28px]">
            {verdict.headline}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[#6b665d]">
            {verdict.subline}
          </p>
          {asOf ? (
            <p className="mt-1 text-xs text-[#8a857a]">{asOf}</p>
          ) : null}
        </div>
      </div>

      {verdict.emergency ? (
        <div
          className="mt-5 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm"
          style={{ background: "rgba(226,92,92,0.1)", color: "#b23636" }}
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>
            If {petName} is struggling to breathe, collapsed, bleeding heavily, or
            having repeated seizures, contact an emergency vet right away.
          </span>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/symptom-checker"
          className={`${buttonClassName()} w-full sm:w-auto`}
          style={
            verdict.emergency
              ? { background: "#e25c5c", borderColor: "#e25c5c" }
              : undefined
          }
        >
          {verdict.emergency ? (
            <Phone className="mr-2 h-4 w-4" aria-hidden />
          ) : (
            <Stethoscope className="mr-2 h-4 w-4" aria-hidden />
          )}
          {verdict.ctaLabel}
        </Link>
      </div>
    </section>
  );
}
