/**
 * Phase 2 — Dog Brain memory is a real 90-CALENDAR-DAY window, not latest-90-rows.
 *
 * `memoryWindowStartDate` is the lower bound the daily-log query filters on
 * (`log_date >= start`). These tests pin the boundary: a 75-day-old log is in,
 * a 100-day-old log is out, and the exact 90-day edge is included. Pure + UTC.
 */
import { memoryWindowStartDate } from "@/lib/health-log/dog-brain-context";

const NOW = new Date("2026-06-24T12:00:00Z");

function dayBefore(now: Date, days: number): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

describe("memoryWindowStartDate — 90 calendar-day lookback", () => {
  it("is exactly 90 UTC days before now", () => {
    expect(memoryWindowStartDate(NOW)).toBe("2026-03-26");
    expect(memoryWindowStartDate(NOW)).toBe(dayBefore(NOW, 90));
  });

  it("includes a 75-day-old log (inside the window)", () => {
    expect(dayBefore(NOW, 75) >= memoryWindowStartDate(NOW)).toBe(true);
  });

  it("excludes a 100-day-old log (outside the window)", () => {
    expect(dayBefore(NOW, 100) >= memoryWindowStartDate(NOW)).toBe(false);
  });

  it("includes the exact 90-day boundary day", () => {
    const start = memoryWindowStartDate(NOW);
    expect(dayBefore(NOW, 90)).toBe(start);
    expect(dayBefore(NOW, 90) >= start).toBe(true);
  });

  it("defaults to the current date when no argument is given (no throw)", () => {
    expect(memoryWindowStartDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
