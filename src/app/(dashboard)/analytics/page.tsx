"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Activity, Loader2, Stethoscope } from "lucide-react";
import Link from "next/link";
import { PrivateTesterQuarantinedSurface } from "@/components/private-tester/quarantined-surface";
import { buttonClassName } from "@/components/ui/button";
import {
  DecisionCard,
  InsightTiles,
  SignalGrid,
  PatternTimeline,
  TrendCards,
  VetPacketPanel,
  LogNextChecklist,
} from "@/components/analytics/health-board";
import { VetReportButton } from "@/components/analytics/vet-report-button";
import Select from "@/components/ui/select";
import Card from "@/components/ui/card";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import { symptomCheckRowToEntry, type SymptomCheckDbRow } from "@/lib/symptom-check-entry-map";
import { getPrivateTesterQuarantinedSurface } from "@/lib/private-tester-scope";
import { buildProductIntelligenceSnapshot } from "@/lib/product-intelligence";
import { buildOwnerReadout } from "@/lib/analytics/owner-readout";
import { buildHealthBoard } from "@/lib/analytics/health-board";
import type { OwnerVerdict } from "@/lib/analytics/owner-readout";
import type { HealthLog } from "@/lib/health-log/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  DEMO_ANALYTICS_SYMPTOM_ENTRIES,
  DEMO_PET_VET821_ID,
  buildDemoHealthLogs,
} from "@/lib/demo-health-data";
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
  const [realLogs, setRealLogs] = useState<HealthLog[]>([]);
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
      setRealLogs([]);
      return;
    }
    try {
      const res = await fetch(`/api/health-log?pet_id=${encodeURIComponent(resolvedPetId)}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      setRealLogs(res.ok && Array.isArray(json.data) ? json.data : []);
    } catch {
      setRealLogs([]);
    }
  }, [resolvedPetId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

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

  // Daily logs: real (Supabase) or demo. Biscuit carries the rich demo story;
  // other demo pets show an empty grid so the empty-state path is visible too.
  const logs = useMemo(() => {
    if (isSupabaseConfigured) return realLogs;
    const targetIsOtherPet = petId !== "all" && petId !== DEMO_PET_VET821_ID;
    return targetIsOtherPet ? [] : buildDemoHealthLogs(DEMO_PET_VET821_ID, now);
  }, [realLogs, petId, now]);

  const productSnapshot = useMemo(
    () => buildProductIntelligenceSnapshot({ entries: filtered }),
    [filtered],
  );

  const selectedPetName = useMemo(() => {
    if (petId === "all") return undefined;
    return petOptions.find((o) => o.value === petId)?.label;
  }, [petId, petOptions]);

  const fallbackPetName = selectedPetName ?? activePet?.name ?? "your dog";

  const ownerReadout = useMemo(
    () =>
      buildOwnerReadout({
        entries: filtered,
        snapshot: productSnapshot,
        now,
        fallbackPetName,
      }),
    [filtered, productSnapshot, now, fallbackPetName],
  );

  const board = useMemo(
    () => buildHealthBoard({ checks: filtered, logs, now, fallbackPetName }),
    [filtered, logs, now, fallbackPetName],
  );

  const noChecks = filtered.length === 0;
  const noLogs = logs.length === 0;
  const empty = noChecks && noLogs;

  // The decision card needs a verdict. Symptom checks drive it; when the owner
  // only has daily logs, show a neutral "keep watching" card that still points
  // them to a check.
  const verdict: OwnerVerdict =
    ownerReadout.verdict ?? {
      state: "watch",
      headline: `Keep an eye on ${board.petName}`,
      subline:
        "No symptom check yet — your daily logs are building the picture. Run a quick check if anything looks off.",
      ctaLabel: "Start a check",
      emergency: false,
    };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[#00a878]">
            <Activity className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {board.petName === "your dog" ? "Health Signals" : `${board.petName}'s Health Signals`}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#2c2a26]">
            What changed, what matters, and what to tell your vet
          </h1>
          <p className="mt-1 text-sm text-[#6b665d]">
            PawVital remembers {board.petName} and helps you explain the story
            {!isSupabaseConfigured ? " (demo data)" : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="w-full sm:w-40">
            <Select label="Dog" options={petOptions} value={petId} onChange={(e) => setPetId(e.target.value)} />
          </div>
          <div className="w-full sm:w-40">
            <Select label="Time range" options={RANGE_OPTIONS} value={range} onChange={(e) => setRange(e.target.value)} />
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
      ) : empty ? (
        <section className="rounded-3xl border border-[#e8e2d8] bg-white p-8 text-center shadow-sm">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "rgba(0,168,120,0.12)", color: "#0a7d5b" }}
          >
            <Stethoscope className="h-7 w-7" aria-hidden />
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#2c2a26]">
            Let&apos;s get to know {board.petName}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#6b665d]">
            Do a quick symptom check or log today&apos;s signs, and we&apos;ll start building
            {" "}{board.petName}&apos;s health story — in plain language, ready for your vet.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Link href="/symptom-checker" className={`${buttonClassName()} inline-flex`}>
              <Stethoscope className="mr-2 h-4 w-4" aria-hidden />
              Start a quick check
            </Link>
            <Link
              href="/health-log"
              className={`${buttonClassName({ variant: "outline" })} inline-flex border-[#cfe6dd] text-[#0a7d5b]`}
            >
              Log today&apos;s signs
            </Link>
          </div>
        </section>
      ) : (
        <>
          <DecisionCard
            verdict={verdict}
            petName={board.petName}
            lastCheckedLabel={board.lastCheckedLabel}
            vetCopyText={board.vetPacket.copyText}
          />
          <InsightTiles board={board} />
          <SignalGrid grid={board.grid} />
          <PatternTimeline events={board.timeline} />
          <TrendCards cards={board.trends} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <VetPacketPanel packet={board.vetPacket} petName={board.petName} />
            <LogNextChecklist items={board.logNext} />
          </div>

          {/* Shareable vet-ready PDF built from the same timeline data. */}
          <div className="flex justify-center">
            <VetReportButton petId={isSupabaseConfigured ? resolvedPetId : null} />
          </div>

          <p className="px-2 pb-4 pt-1 text-center text-xs leading-relaxed text-[#8a857a]">
            PawVital helps you understand {board.petName}&apos;s signs — it&apos;s not a diagnosis and
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
