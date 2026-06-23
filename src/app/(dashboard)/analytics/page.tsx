"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Calendar, Info, Loader2, Shield, Stethoscope, Upload } from "lucide-react";
import Link from "next/link";
import { PrivateTesterQuarantinedSurface } from "@/components/private-tester/quarantined-surface";
import { buttonClassName } from "@/components/ui/button";
import {
  DecisionCard,
  SignalGrid,
  PatternTimeline,
  VetPacketPanel,
  LogNextChecklist,
  ChangedFromNormalRail,
} from "@/components/analytics/health-board";
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

const STATE_STRIP: Record<OwnerVerdict["state"], { word: string; color: string }> = {
  watch: { word: "Good", color: "#15a06a" },
  schedule: { word: "Watch", color: "#e0890a" },
  urgent: { word: "Alert", color: "#d64545" },
  emergency: { word: "Alert", color: "#d64545" },
};

const MEMORY_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "May 10 – Aug 7, 2025" from the real span of logged data, or null. */
function memoryDateRange(
  entries: SymptomCheckEntry[],
  logs: HealthLog[],
): string | null {
  const dates: Date[] = [];
  for (const e of entries) {
    const d = new Date(e.created_at);
    if (!Number.isNaN(d.getTime())) dates.push(d);
  }
  for (const l of logs) {
    const [y, m, day] = l.log_date.split("-").map((p) => parseInt(p, 10));
    if (y && m && day) dates.push(new Date(y, m - 1, day));
  }
  if (dates.length === 0) return null;
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const start = `${MEMORY_MONTHS[min.getMonth()]} ${min.getDate()}`;
  const end = `${MEMORY_MONTHS[max.getMonth()]} ${max.getDate()}, ${max.getFullYear()}`;
  return start === end.split(",")[0] ? end : `${start} – ${end}`;
}

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

  // "90-day memory" date range, derived from the real span of logged data.
  const memoryRange = useMemo(() => memoryDateRange(filtered, logs), [filtered, logs]);

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
          <h1
            className="text-[29px] font-bold leading-tight text-[#1c2522]"
            style={{ letterSpacing: "-0.6px" }}
          >
            {board.petName === "your dog"
              ? "Health Signals"
              : `${board.petName.replace(/\b\p{L}/gu, (c) => c.toUpperCase())}'s Health Signals`}
          </h1>
          <p className="mt-1 text-[14.5px] text-[#6f7069]">
            90 days of owner-logged memory, shown as a vet-ready story
            {!isSupabaseConfigured ? " (demo data)" : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-[11px]">
            <Link
              href="/health-log"
              className="flex items-center gap-[7px] rounded-[11px] border border-[#e3e2dd] bg-white px-[14px] py-[9px] text-[13.5px] font-semibold text-[#3a3b34]"
            >
              <Info className="h-[15px] w-[15px]" style={{ color: "#6f7069" }} strokeWidth={1.8} aria-hidden />
              How this works
            </Link>
            <button
              type="button"
              onClick={() => {
                if (navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(board.vetPacket.copyText);
                }
              }}
              className="flex items-center gap-[7px] rounded-[11px] border border-[#e3e2dd] bg-white px-[14px] py-[9px] text-[13.5px] font-semibold text-[#3a3b34]"
            >
              <Upload className="h-[15px] w-[15px]" style={{ color: "#3a3b34" }} strokeWidth={1.8} aria-hidden />
              Share
            </button>
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
          {/* Emergency-only safety call-out (renders nothing otherwise). */}
          <DecisionCard
            verdict={verdict}
            petName={board.petName}
            lastCheckedLabel={board.lastCheckedLabel}
            vetCopyText={board.vetPacket.copyText}
          />

          {/* OVERALL STATUS STRIP */}
          <section
            className="flex items-stretch overflow-hidden"
            style={{
              background: "#fff",
              border: "1px solid #ececea",
              borderRadius: 20,
              boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.045)",
            }}
            aria-label="Health memory summary"
          >
            <div
              className="flex items-center"
              style={{ flex: 1.3, padding: "16px 20px", gap: 12, borderRight: "1px solid #ecebe5" }}
            >
              <Shield
                className="h-[34px] w-[34px] shrink-0"
                style={{ color: STATE_STRIP[verdict.state].color }}
                strokeWidth={1.7}
                aria-hidden
              />
              <div className="min-w-0">
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.6px", color: "#9a9b93", textTransform: "uppercase" }}>
                  Current state
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, color: STATE_STRIP[verdict.state].color, letterSpacing: "-0.3px" }}>
                  {STATE_STRIP[verdict.state].word}
                </div>
                <Link href="/health-log" className="flex items-center" style={{ gap: 3, fontSize: 12.5, color: "#0b7a4d", fontWeight: 600 }}>
                  See details ›
                </Link>
              </div>
            </div>
            <div
              className="flex items-center"
              style={{ flex: 1.5, padding: "16px 20px", gap: 12, borderRight: "1px solid #ecebe5" }}
            >
              <Calendar className="h-[30px] w-[30px] shrink-0" style={{ color: "#6f8a5c" }} strokeWidth={1.6} aria-hidden />
              <div className="min-w-0">
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.6px", color: "#9a9b93", textTransform: "uppercase" }}>
                  90-day memory
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "#1c2522" }}>
                  {memoryRange ?? (RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "Last 90 days")}
                </div>
                <Link href="/history" className="flex items-center" style={{ gap: 3, fontSize: 12.5, color: "#0b7a4d", fontWeight: 600 }}>
                  See full timeline ›
                </Link>
              </div>
            </div>
            <div className="flex items-center" style={{ flex: 1, padding: "16px 18px", gap: 11, borderRight: "1px solid #ecebe5" }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color: "#1c2522" }}>{board.evidence.dailyLogs}</div>
                <div style={{ fontSize: 13, color: "#3a3b34", fontWeight: 500 }}>Daily logs</div>
                <div style={{ fontSize: 11.5, color: "#9a9b93" }}>Last 90 days</div>
              </div>
            </div>
            <div className="flex items-center" style={{ flex: 1, padding: "16px 18px", gap: 11, borderRight: "1px solid #ecebe5" }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color: "#1c2522" }}>{board.evidence.photos}</div>
                <div style={{ fontSize: 13, color: "#3a3b34", fontWeight: 500 }}>Photos</div>
                <div style={{ fontSize: 11.5, color: "#9a9b93" }}>Last 90 days</div>
              </div>
            </div>
            <div className="flex items-center" style={{ flex: 1.1, padding: "16px 18px", gap: 11 }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color: "#1c2522" }}>{board.evidence.symptomChecks}</div>
                <div style={{ fontSize: 13, color: "#3a3b34", fontWeight: 500 }}>Symptom checks</div>
                <div style={{ fontSize: 11.5, color: "#9a9b93" }}>Last 90 days</div>
              </div>
            </div>
          </section>

          {/* TWO COLUMNS: left flex 1, right rail 344px */}
          <div className="flex items-start" style={{ gap: 22 }}>
            <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 20 }}>
              <SignalGrid grid={board.grid} />
              <PatternTimeline events={board.timeline} />
            </div>
            <div className="flex flex-none flex-col" style={{ width: 344, gap: 18 }}>
              <ChangedFromNormalRail items={board.changedFromNormal} />
              <VetPacketPanel packet={board.vetPacket} petName={board.petName} />
              <LogNextChecklist items={board.logNext} />
            </div>
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
