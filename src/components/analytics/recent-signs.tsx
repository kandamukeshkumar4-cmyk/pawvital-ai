"use client";

import type { OwnerSign } from "@/lib/analytics/owner-readout";

const TONE_STYLE: Record<OwnerSign["tone"], { bg: string; border: string; text: string }> = {
  neutral: { bg: "#f7f4ef", border: "#e8e2d8", text: "#4a463f" },
  caution: { bg: "rgba(224,164,88,0.14)", border: "rgba(224,164,88,0.4)", text: "#8a4f15" },
  alert: { bg: "rgba(226,92,92,0.12)", border: "rgba(226,92,92,0.4)", text: "#b23636" },
};

/**
 * Plain-language chips summarising the latest check. Replaces the ranked
 * top-symptoms bar chart with something an owner reads at a glance.
 */
export function RecentSigns({
  signs,
  asOf,
}: {
  signs: OwnerSign[];
  asOf: string | null;
}) {
  if (signs.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
        What you told us
      </p>
      {asOf ? <p className="mt-0.5 text-xs text-[#a8a097]">{asOf}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {signs.map((sign, i) => {
          const tone = TONE_STYLE[sign.tone];
          return (
            <span
              key={`${sign.label}-${i}`}
              className="rounded-full border px-3 py-1.5 text-sm font-medium"
              style={{ background: tone.bg, borderColor: tone.border, color: tone.text }}
            >
              {sign.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}
