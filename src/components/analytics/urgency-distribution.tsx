"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SymptomCheckEntry } from "@/components/timeline/types";

const URGENCY_ORDER: SymptomCheckEntry["urgency"][] = [
  "monitor",
  "schedule",
  "urgent",
  "emergency",
];

const COLORS: Record<SymptomCheckEntry["urgency"], string> = {
  monitor: "#22c55e",
  schedule: "#eab308",
  urgent: "#f97316",
  emergency: "#dc2626",
};

const LABELS: Record<SymptomCheckEntry["urgency"], string> = {
  monitor: "Monitor",
  schedule: "Schedule",
  urgent: "Urgent",
  emergency: "Emergency",
};

export default function UrgencyDistribution({ entries }: { entries: SymptomCheckEntry[] }) {
  const counts = new Map<SymptomCheckEntry["urgency"], number>();
  for (const u of URGENCY_ORDER) counts.set(u, 0);
  for (const e of entries) {
    counts.set(e.urgency, (counts.get(e.urgency) ?? 0) + 1);
  }

  const data = URGENCY_ORDER.filter((u) => (counts.get(u) ?? 0) > 0).map((u) => ({
    name: LABELS[u],
    value: counts.get(u) ?? 0,
    key: u,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-gray-500">
        No urgency data
      </div>
    );
  }

  return (
    <div className="w-full min-h-[260px] flex flex-col items-center">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={COLORS[d.key]} stroke="white" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              fontSize: 12,
            }}
            formatter={(value, name) => [`${value ?? 0}`, String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600 mt-1">
        {URGENCY_ORDER.map((u) => (
          <li key={u} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[u] }} />
            {LABELS[u]} ({counts.get(u) ?? 0})
          </li>
        ))}
      </ul>
    </div>
  );
}
