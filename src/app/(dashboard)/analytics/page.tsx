"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Activity, Loader2, Stethoscope } from "lucide-react";
import Link from "next/link";
import { PrivateTesterQuarantinedSurface } from "@/components/private-tester/quarantined-surface";
import { buttonClassName } from "@/components/ui/button";
import {
  DailyLogSnapshot,
  DailySignalsGridView,
  OwnerStatusHero,
  RecentSigns,
  RecoveryTrendStrip,
  TrackNext,
  VetPacket,
  VetTimeline,
  WhyThisChanged,
} from "@/components/analytics";
import Select from "@/components/ui/select";
import Card from "@/components/ui/card";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import { symptomCheckRowToEntry, type SymptomCheckDbRow } from "@/lib/symptom-check-entry-map";
import { getPrivateTesterQuarantinedSurface } from "@/lib/private-tester-scope";
import { buildProductIntelligenceSnapshot } from "@/lib/product-intelligence";
import { buildOwnerReadout } from "@/lib/analytics/owner-readout";
import type { VetTimelineData } from "@/lib/analytics/vet-timeline";
import type { HealthLog } from "@/lib/health-log/types";
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

function HealthSignalsContent() {
  const { pets, activePet } = useAppStore();
  const [rawEntries, setRawEntries] = useState<SymptomCheckEntry[]>([]);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [vetTimeline, setVetTimeline] = useState<VetTimelineData | null>(null);
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
      setRawEntries(
        rows.map((row) => symptomCheckRowToEntry(row, petNameById.get(row.pet_id) ?? "Dog")),
      );
    } catch (e) {
      console.error("Health signals load failed:", e);
      setRawEntries([]);
    } finally {
      setLoading(false);
    }
  }, [pets]);

  useEffect(() => {
    void loadChecks();
  }, [loadChecks]);

  // Resolve which pet the daily-log sections describe (selected, else active).
  const resolvedPetId = useMemo(() => {
    if (petId !== "all") return petId;
    return activePet?.id ?? pets[0]?.id ?? null;
  }, [petId, activePet?.id, pets]);

  const loadLogs = useCallback(async () => {
    if (!isSupabaseConfigured || !resolvedPetId) {
      setLogs([]);
      return;
    }
    try {
      const res = await fetch(`/api/health-log?pet_id=${encodeURIComponent(resolvedPetId)}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      setLogs(res.ok && Array.isArray(json.data) ? json.data : []);
    } catch {
      setLogs([]);
    }
  }, [resolvedPetId]);

  const loadVetTimeline = useCallback(async () => {
    if (!isSupabaseConfigured || !resolvedPetId) {
      setVetTimeline(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/analytics/vet-timeline?pet_id=${encodeURIComponent(resolvedPetId)}`,
        { credentials: "include" },
      );
      const json = await res.json().catch(() => ({}));
      setVetTimeline(res.ok && json.data ? (json.data as VetTimelineData) : null);
    } catch {
      setVetTimeline(null);
    }
  }, [resolvedPetId]);

  useEffect(() => {
    void loadLogs();
    void loadVetTimeline();
  }, [loadLogs, loadVetTimeline]);

  const petOptions = useMemo(() => {
    const base = [{ value: "all", label: "All dogs" }];
    if (!isSupabaseConfigured && pets.length === 0) {
      const seen = new Map<string, string>();
      for (const e of DEMO_ANALYTICS_SYMPTOM_ENTRIES) {
        if (!seen.has(e.pet_id)) seen.set(e.pet_id, e.pet_name);
      }
      for (const [id, name] of seen) base.push({ value: id, label: name });
      return base;
    }
    return [...base, ...pets.map((p) => ({ value: p.id, label: p.name }))];
  }, [pets]);

  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    let list = rawEntries.filter((e) => inDateRange(e, range, now));
    if (petId !== "all") list = list.filter((e) => e.pet_id === petId);
    return list;
  }, [rawEntries, range, petId, now]);

  const productSnapshot = useMemo(
    () => buildProductIntelligenceSnapshot({ entries: filtered }),
    [filtered],
  );

  const selectedPetName = useMemo(() => {
    if (petId === "all") return undefined;
    return petOptions.find((o) => o.value === petId)?.label;
  }, [petId, petOptions]);

  const ownerReadout = useMemo(
    () =>
      buildOwnerReadout({
        entries: filtered,
        snapshot: productSnapshot,
        now,
        fallbackPetName: selectedPetName ?? activePet?.name ?? "your dog",
      }),
    [filtered, productSnapshot, now, selectedPetName, activePet?.name],
  );

  const latestConfidence = useMemo(() => {
    if (filtered.length === 0) return 0.5;
    const latest = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    const c = latest?.confidence ?? 0.5;
    return c > 1 ? c / 100 : c;
  }, [filtered]);

  const latestLog = useMemo(() => {
    if (logs.length === 0) return null;
    return [...logs].sort(
      (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime(),
    )[0];
  }, [logs]);

  const noChecks = ownerReadout.checkCount === 0 || !ownerReadout.verdict;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[#00a878]">
            <Activity className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {ownerReadout.petName === "your dog"
                ? "Health signals"
                : `${ownerReadout.petName}'s health`}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#2c2a26]">How is your dog doing?</h1>
          <p className="mt-1 text-sm text-[#6b665d]">
            A plain-language read on your recent checks and daily logs
            {!isSupabaseConfigured ? " (demo data)" : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="w-full sm:w-40">
            <Select label="Dog" options={petOptions} value={petId} onChange={(e) => setPetId(e.target.value)} />
          </div>
          <div className="w-full sm:w-40">
            <Select label="Time" options={RANGE_OPTIONS} value={range} onChange={(e) => setRange(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-[#6b665d]">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : isSupabaseConfigured && pets.length === 0 ? (
        <Card className="p-10 text-center text-[#6b665d]">
          <p>Add a dog profile to start tracking how your dog is doing.</p>
        </Card>
      ) : (
        <>
          {noChecks ? (
            <section className="rounded-3xl border border-[#e8e2d8] bg-white p-8 text-center shadow-sm">
              <div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: "rgba(0,168,120,0.12)", color: "#0a7d5b" }}
              >
                <Stethoscope className="h-7 w-7" aria-hidden />
              </div>
              <h2 className="mt-4 text-xl font-bold text-[#2c2a26]">
                Let&apos;s get to know {ownerReadout.petName}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#6b665d]">
                Do a quick symptom check and we&apos;ll show you how {ownerReadout.petName}
                {" "}is doing — in plain language, with what to watch for.
              </p>
              <Link href="/symptom-checker" className={`${buttonClassName()} mt-5 inline-flex`}>
                <Stethoscope className="mr-2 h-4 w-4" aria-hidden />
                Start a quick check
              </Link>
            </section>
          ) : (
            <>
              <OwnerStatusHero
                verdict={ownerReadout.verdict!}
                petName={ownerReadout.petName}
                asOf={ownerReadout.asOf}
                confidence={latestConfidence}
              />
              <RecoveryTrendStrip readout={ownerReadout.trend} petName={ownerReadout.petName} />
              <WhyThisChanged drivers={ownerReadout.drivers} />
              <RecentSigns signs={ownerReadout.signs} asOf={ownerReadout.asOf} />
            </>
          )}

          {/* Daily Log sync — always shown so the loop is visible even before a check */}
          <DailyLogSnapshot latest={latestLog} petName={ownerReadout.petName} />
          <DailySignalsGridView logs={logs} now={now} />

          {!noChecks && ownerReadout.nextStep ? (
            <TrackNext nextStep={ownerReadout.nextStep} petName={ownerReadout.petName} />
          ) : null}

          {!noChecks ? (
            <VetPacket
              packet={ownerReadout.vetPacket}
              petName={ownerReadout.petName}
              dailyLogCount={logs.length}
            />
          ) : null}

          {vetTimeline && vetTimeline.entries.length > 0 ? (
            <VetTimeline data={vetTimeline} petName={ownerReadout.petName} />
          ) : null}

          <p className="px-2 pb-4 pt-1 text-center text-xs leading-relaxed text-[#8a857a]">
            PawVital helps you understand your dog&apos;s signs — it&apos;s not a diagnosis and
            doesn&apos;t replace a vet. If you&apos;re worried or things get worse, contact your
            vet. In an emergency, call an emergency vet right away.
          </p>
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
  return <HealthSignalsContent />;
}
