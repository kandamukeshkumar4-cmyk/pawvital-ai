"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import type { OwnerTrend, OwnerTrendReadout } from "@/lib/analytics/owner-readout";

const TREND_COLOR: Record<OwnerTrend, string> = {
  improving: "#00a878",
  steady: "#7c4dc4",
  worsening: "#d98b3a",
  insufficient: "#a8a097",
};

function TrendIcon({ trend }: { trend: OwnerTrend }) {
  const cls = "h-4 w-4";
  if (trend === "improving") return <ArrowUpRight className={cls} aria-hidden />;
  if (trend === "worsening") return <ArrowDownRight className={cls} aria-hidden />;
  if (trend === "steady") return <ArrowRight className={cls} aria-hidden />;
  return <Minus className={cls} aria-hidden />;
}

/**
 * The only chart on the page: a minimal wellness sparkline (no axes, no grid)
 * framed by a plain-language verdict. When there aren't enough check-ins, it
 * shows a calm text state instead of an empty or misleading chart.
 */
export function RecoveryTrendStrip({
  readout,
  petName,
}: {
  readout: OwnerTrendReadout;
  petName: string;
}) {
  const color = TREND_COLOR[readout.trend];
  const data = readout.series.map((v, i) => ({ i, v }));

  return (
    <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
        How {petName} is trending
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span style={{ color }}>
          <TrendIcon trend={readout.trend} />
        </span>
        <h3 className="text-base font-semibold text-[#2c2a26]">
          {readout.headline}
        </h3>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-[#6b665d]">{readout.detail}</p>

      {readout.showChart && data.length >= 2 ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-[#a8a097]">
            <span>Earlier</span>
            <span>Today</span>
          </div>
          <ResponsiveContainer width="100%" height={56}>
            <LineChart data={data} margin={{ top: 4, right: 6, left: 6, bottom: 0 }}>
              <YAxis domain={[20, 100]} hide />
              <Line
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}
