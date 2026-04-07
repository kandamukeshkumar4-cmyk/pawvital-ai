"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { SymptomCheckEntry } from "@/components/timeline/types";

const SEVERITY_VALUE: Record<SymptomCheckEntry["severity"], number> = {
  mild: 1,
  moderate: 2,
  serious: 3,
  critical: 4,
};

const TICK_LABELS: Record<number, string> = {
  1: "Mild",
  2: "Moderate",
  3: "Serious",
  4: "Critical",
};

export default function SeverityTrendChart({ entries }: { entries: SymptomCheckEntry[] }) {
  const data = [...entries]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((e) => ({
      t: e.created_at,
      label: format(parseISO(e.created_at), "MMM d"),
      severity: SEVERITY_VALUE[e.severity],
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
        No checks in this range
      </div>
    );
  }

  return (
    <div className="w-full min-h-[280px]">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval="preserveStartEnd" />
          <YAxis
            domain={[1, 4]}
            ticks={[1, 2, 3, 4]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickFormatter={(v: number) => TICK_LABELS[v] ?? v}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              fontSize: 12,
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { t?: string } | undefined;
              if (row?.t) {
                try {
                  return format(parseISO(row.t), "MMM d, yyyy h:mm a");
                } catch {
                  return row.t;
                }
              }
              return "";
            }}
            formatter={(value: number | string) => [TICK_LABELS[Number(value)] ?? value, "Severity"]}
          />
          <Line
            type="monotone"
            dataKey="severity"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={{ r: 4, fill: "#7c3aed" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
