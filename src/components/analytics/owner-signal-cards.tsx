"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, FileText, ListChecks } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import type {
  OwnerDriver,
  OwnerNextStep,
  OwnerVetPacket,
} from "@/lib/analytics/owner-readout";

const DRIVER_DOT: Record<OwnerDriver["tone"], string> = {
  neutral: "#a8a097",
  caution: "#d98b3a",
  alert: "#e25c5c",
};

/** "Why this changed" — the plain drivers behind the current status. */
export function WhyThisChanged({ drivers }: { drivers: OwnerDriver[] }) {
  if (drivers.length === 0) return null;
  return (
    <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[#7c4dc4]" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
          Why this status
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {drivers.map((d, i) => (
          <li key={`${d.label}-${i}`} className="flex items-start gap-2.5">
            <span
              className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: DRIVER_DOT[d.tone] }}
              aria-hidden
            />
            <span className="text-sm leading-relaxed text-[#4a463f]">{d.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Track next" — one adaptive nudge keyed to the latest check. */
export function TrackNext({
  nextStep,
  petName,
}: {
  nextStep: OwnerNextStep;
  petName: string;
}) {
  return (
    <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-[#0a7d5b]" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
          Track next
        </p>
      </div>
      <h3 className="mt-2 text-base font-semibold text-[#2c2a26]">
        {nextStep.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-[#6b665d]">{nextStep.detail}</p>
      <Link
        href="/symptom-checker"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#0a7d5b] hover:underline"
      >
        Do a quick check-in for {petName}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

/** "Vet packet" — a vet-ready summary of the checks in view. */
export function VetPacket({
  packet,
  petName,
}: {
  packet: OwnerVetPacket;
  petName: string;
}) {
  if (!packet.ready) return null;
  const parts: string[] = [];
  if (packet.rangeLabel) parts.push(packet.rangeLabel);
  parts.push(
    packet.urgentFlags === 0
      ? "no urgent flags"
      : packet.urgentFlags === 1
        ? "1 urgent flag"
        : `${packet.urgentFlags} urgent flags`,
  );

  return (
    <section className="rounded-2xl border border-[#e8e2d8] bg-[#faf8f5] p-5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#7c4dc4]" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
          Ready to share with your vet
        </p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#4a463f]">
        {petName}&apos;s recent history: <span className="font-medium">{parts.join(" · ")}</span>.
        Bring it to your next visit so nothing gets missed.
      </p>
      <Link
        href="/history"
        className={`${buttonClassName({ variant: "outline", size: "sm" })} mt-3 inline-flex`}
      >
        <FileText className="mr-2 h-4 w-4" aria-hidden />
        Open &amp; share history
      </Link>
    </section>
  );
}
