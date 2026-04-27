"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import Badge from "@/components/ui/badge";
import type { SymptomCheckEntry } from "./types";

function severityBadgeVariant(
  s: SymptomCheckEntry["severity"]
): "success" | "warning" | "danger" | "info" {
  switch (s) {
    case "mild":
      return "success";
    case "moderate":
      return "warning";
    case "serious":
      return "danger";
    case "critical":
      return "danger";
    default:
      return "info";
  }
}

function severityLabel(s: SymptomCheckEntry["severity"]): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type MonthGroup = {
  key: string;
  label: string;
  entries: SymptomCheckEntry[];
};

export default function HealthTimeline({ checks }: { checks: SymptomCheckEntry[] }) {
  const groups = useMemo(() => {
    const sorted = [...checks].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const map = new Map<string, SymptomCheckEntry[]>();
    for (const c of sorted) {
      const d = parseISO(c.created_at);
      const key = format(d, "yyyy-MM");
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    const out: MonthGroup[] = [];
    for (const [key, entries] of map) {
      const label = format(parseISO(entries[0].created_at), "MMMM yyyy");
      out.push({ key, label, entries });
    }
    out.sort((a, b) => b.key.localeCompare(a.key));
    return out;
  }, [checks]);

  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  const isOpen = (key: string) => openMonths[key] !== false;

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => ({
      ...prev,
      [key]: prev[key] === false,
    }));
  };

  if (checks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-14 text-center">
        <p className="text-gray-600 text-sm max-w-md mx-auto">
          No health checks yet — start your first symptom check
        </p>
        <a
          href="/symptom-checker"
          target="_top"
          className="inline-flex mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          Open Symptom Checker
        </a>
      </div>
    );
  }

  return (
    <div className="relative pl-2 sm:pl-4">
      <div
        className="absolute left-[11px] sm:left-[19px] top-2 bottom-2 w-px bg-gray-200"
        aria-hidden
      />
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.key}>
            <button
              type="button"
              onClick={() => toggleMonth(group.key)}
              className="flex items-center gap-2 mb-4 text-left w-full group"
              aria-expanded={isOpen(group.key)}
            >
              <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 group-hover:border-gray-300">
                {isOpen(group.key) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </span>
              <h3 className="text-sm font-semibold text-gray-900 tracking-tight">
                {group.label}
              </h3>
              <span className="text-xs text-gray-400">({group.entries.length})</span>
            </button>

            {isOpen(group.key) && (
              <ul className="space-y-6 ml-0 sm:ml-2">
                {group.entries.map((entry) => {
                  const when = format(parseISO(entry.created_at), "MMM d, yyyy · h:mm a");
                  return (
                    <li key={entry.id} className="relative flex gap-4">
                      <div
                        className="relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full bg-blue-500 ring-4 ring-white"
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                          <time
                            dateTime={entry.created_at}
                            className="text-xs font-medium text-gray-400"
                          >
                            {when}
                          </time>
                          <Badge variant={severityBadgeVariant(entry.severity)}>
                            {severityLabel(entry.severity)}
                          </Badge>
                        </div>
                        <h4 className="mt-2 font-semibold text-gray-900 text-base">
                          {entry.primary_symptom}
                        </h4>
                        <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                          {entry.report_summary ??
                            `${entry.top_diagnosis} · ${Math.round(entry.confidence * 100)}% confidence`}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          Top assessment:{" "}
                          <span className="font-medium text-gray-700">{entry.top_diagnosis}</span>
                        </p>
                        <div className="mt-3">
                          <a
                            href="/history"
                            target="_top"
                            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                          >
                            View Report
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
