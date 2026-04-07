"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SymptomCheckEntry } from "@/components/timeline/types";

function buildTopSymptoms(entries: SymptomCheckEntry[], limit = 5) {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = e.primary_symptom.trim() || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name: name.length > 28 ? `${name.slice(0, 27)}…` : name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export default function SymptomFrequencyChart({ entries }: { entries: SymptomCheckEntry[] }) {
  const data = buildTopSymptoms(entries);

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
        No symptom data in this range
      </div>
    );
  }

  return (
    <div className="w-full min-h-[280px]">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 11, fill: "#374151" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              fontSize: 12,
            }}
            formatter={(value) => [`${value ?? 0}`, "Checks"]}
          />
          <Bar dataKey="count" name="Checks" fill="#2563eb" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
