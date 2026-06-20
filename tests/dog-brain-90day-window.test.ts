/**
 * Proves the Dog Brain summary honours its window: an abnormal day ~60 days ago
 * is reflected when summarizing the 90-day window but not the 14-day recent one.
 * Guards against the regression where the summary was hard-capped to 14 logs.
 */
import { summarizeDailyLogsForContext } from "@/lib/health-log/context";
import type { HealthLog } from "@/lib/health-log/types";

function makeLog(daysAgo: number, over: Partial<HealthLog>): HealthLog {
  const d = new Date("2026-06-19T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    id: `l${daysAgo}`,
    user_id: "u",
    pet_id: "p",
    log_date: d.toISOString().slice(0, 10),
    appetite: "normal",
    water: "normal",
    stool: "normal",
    urination: "normal",
    vomiting_count: 0,
    energy: "normal",
    weight_kg: null,
    meds_given: false,
    notes: null,
    photo_urls: [],
    context_signals: null,
    created_at: d.toISOString(),
    updated_at: d.toISOString(),
    ...over,
  } as HealthLog;
}

describe("Dog Brain summary window", () => {
  // 20 recent normal days + one reduced-appetite day 60 days ago.
  const logs = [
    ...Array.from({ length: 20 }, (_, i) => makeLog(i, {})),
    makeLog(60, { appetite: "reduced" }),
  ];

  it("omits a 60-day-old event from the 14-day recent summary", () => {
    const recent = summarizeDailyLogsForContext(logs, "Bruno", 14);
    expect(recent).not.toMatch(/appetite/i);
  });

  it("captures the 60-day-old event in the 90-day window summary", () => {
    const full = summarizeDailyLogsForContext(logs, "Bruno", 90);
    expect(full).toMatch(/appetite/i);
  });
});
