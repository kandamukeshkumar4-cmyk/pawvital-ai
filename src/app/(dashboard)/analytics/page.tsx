"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { BarChart3, Loader2 } from "lucide-react";
import { PrivateTesterQuarantinedSurface } from "@/components/private-tester/quarantined-surface";
import Card from "@/components/ui/card";
import Select from "@/components/ui/select";
import {
  HealthScoreCard,
  SeverityTrendChart,
  SymptomFrequencyChart,
  UrgencyDistribution,
} from "@/components/analytics";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import { symptomCheckRowToEntry, type SymptomCheckDbRow } from "@/lib/symptom-check-entry-map";
import { getPrivateTesterQuarantinedSurface } from "@/lib/private-tester-scope";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import { DEMO_ANALYTICS_SYMPTOM_ENTRIES } from "@/lib/demo-health-data";
import { useAppStore } from "@/store/app-store";

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function inDateRange(entry: SymptomCheckEntry, rangeKey: string, now: Date): boolean {
  if (rangeKey === "all") return true;
  const days = parseInt(rangeKey, 10);
  if (!Number.isFinite(days)) return true;
  const cutoff = subDays(now, days);
  return new Date(entry.created_at) >= cutoff;
}

function AnalyticsPageContent() {
  const { pets } = useAppStore();
  const [rawEntries, setRawEntries] = useState<SymptomCheckEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [petId, setPetId] = useState<string>("all");
  const [range, setRange] = useState<string>("90");

  const loadChecks = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setRawEntries(DEMO_ANALYTICS_SYMPTOM_ENTRIES);
      setLoading(false);
      return;
    }

    if (pets.length === 0) {
      setRawEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const petIds = pets.map((p) => p.id);
      const petNameById = new Map(pets.map((p) => [p.id, p.name] as const));

      const { data, error } = await supabase
        .from("symptom_checks")
        .select("id, pet_id, symptoms, ai_response, severity, recommendation, created_at")
        .in("pet_id", petIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as SymptomCheckDbRow[];
      const mapped = rows.map((row) =>
        symptomCheckRowToEntry(row, petNameById.get(row.pet_id) ?? "Dog")
      );
      setRawEntries(mapped);
    } catch (e) {
      console.error("Analytics load failed:", e);
      setRawEntries([]);
    } finally {
      setLoading(false);
    }
  }, [pets]);

  useEffect(() => {
    void loadChecks();
  }, [loadChecks]);

  const petOptions = useMemo(() => {
    const base = [{ value: "all", label: "All dogs" }];
    if (!isSupabaseConfigured && pets.length === 0) {
      const seen = new Map<string, string>();
      for (const e of DEMO_ANALYTICS_SYMPTOM_ENTRIES) {
        if (!seen.has(e.pet_id)) seen.set(e.pet_id, e.pet_name);
      }
      for (const [id, name] of seen) {
        base.push({ value: id, label: name });
      }
      return base;
    }
    return [...base, ...pets.map((p) => ({ value: p.id, label: p.name }))];
  }, [pets]);

  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    let list = rawEntries.filter((e) => inDateRange(e, range, now));
    if (petId !== "all") {
      list = list.filter((e) => e.pet_id === petId);
    }
    return list;
  }, [rawEntries, range, petId, now]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <BarChart3 className="h-6 w-6" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide">Insights</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Health analytics</h1>
          <p className="text-gray-500 mt-1">
            Trends from symptom checks{!isSupabaseConfigured ? " (demo data)" : ""}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-48">
            <Select
              label="Dog"
              options={petOptions}
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              label="Date range"
              options={RANGE_OPTIONS}
              value={range}
              onChange={(e) => setRange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-500 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          Loading analytics…
        </div>
      ) : isSupabaseConfigured && pets.length === 0 ? (
        <Card className="p-10 text-center text-gray-600">
          <p>Add a dog profile to see analytics from your symptom checks.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <HealthScoreCard entries={filtered} />
            </Card>
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Urgency mix</h2>
              <p className="text-xs text-gray-500 mb-2">How often each urgency level appeared</p>
              <UrgencyDistribution entries={filtered} />
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Top symptoms</h2>
              <p className="text-xs text-gray-500 mb-4">Five most common primary concerns</p>
              <SymptomFrequencyChart entries={filtered} />
            </Card>
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Severity over time</h2>
              <p className="text-xs text-gray-500 mb-4">Per-check severity (chronological)</p>
              <SeverityTrendChart entries={filtered} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const quarantinedSurface = getPrivateTesterQuarantinedSurface("/analytics");

  if (quarantinedSurface) {
    return <PrivateTesterQuarantinedSurface {...quarantinedSurface} />;
  }

  return <AnalyticsPageContent />;
}
