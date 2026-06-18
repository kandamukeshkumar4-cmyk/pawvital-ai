"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { subDays } from "date-fns";
import { BarChart3, ChevronDown, Loader2, Stethoscope } from "lucide-react";
import { PrivateTesterQuarantinedSurface } from "@/components/private-tester/quarantined-surface";
import Card from "@/components/ui/card";
import Select from "@/components/ui/select";
import { buttonClassName } from "@/components/ui/button";
import {
  HealthScoreCard,
  OwnerStatusHero,
  ProductIntelligencePanel,
  RecentSigns,
  RecoveryTrendStrip,
  SeverityTrendChart,
  SymptomFrequencyChart,
  UrgencyDistribution,
} from "@/components/analytics";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import { symptomCheckRowToEntry, type SymptomCheckDbRow } from "@/lib/symptom-check-entry-map";
import { getPrivateTesterQuarantinedSurface } from "@/lib/private-tester-scope";
import { buildProductIntelligenceSnapshot } from "@/lib/product-intelligence";
import { buildOwnerReadout } from "@/lib/analytics/owner-readout";
import {
  buildOwnerRecoveryCheckpoint,
  loadProductIntelligenceHistory,
  saveProductIntelligenceSnapshot,
  type ProductIntelligenceHistory,
} from "@/lib/product-intelligence-owner-workflow";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import { DEMO_ANALYTICS_SYMPTOM_ENTRIES } from "@/lib/demo-health-data";
import { useAppStore } from "@/store/app-store";

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

interface ProductIntelligenceUiState {
  history: ProductIntelligenceHistory | null;
  historyLoading: boolean;
  readinessSaving: boolean;
  readinessStatus: string | null;
  recoverySaving: boolean;
  recoveryStatus: string | null;
}

const INITIAL_PRODUCT_UI_STATE: ProductIntelligenceUiState = {
  history: null,
  historyLoading: false,
  readinessSaving: false,
  readinessStatus: null,
  recoverySaving: false,
  recoveryStatus: null,
};

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
  const [productUiState, setProductUiState] = useState<ProductIntelligenceUiState>(
    INITIAL_PRODUCT_UI_STATE
  );

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

  const productSnapshot = useMemo(
    () => buildProductIntelligenceSnapshot({ entries: filtered }),
    [filtered]
  );
  const selectedPetIdForPersistence = isSupabaseConfigured && petId !== "all" ? petId : null;
  const selectedPetIdForRecovery = petId !== "all" ? petId : null;
  const recoveryCheckpoint = useMemo(
    () =>
      buildOwnerRecoveryCheckpoint({
        petId: selectedPetIdForRecovery,
        entries: filtered,
        generatedAt: now.toISOString(),
      }),
    [filtered, now, selectedPetIdForRecovery]
  );

  const selectedPetName = useMemo(() => {
    if (petId === "all") return undefined;
    return petOptions.find((option) => option.value === petId)?.label;
  }, [petId, petOptions]);

  const ownerReadout = useMemo(
    () =>
      buildOwnerReadout({
        entries: filtered,
        snapshot: productSnapshot,
        now,
        fallbackPetName: selectedPetName ?? "your dog",
      }),
    [filtered, productSnapshot, now, selectedPetName]
  );

  // Latest check's confidence drives the hero ring fill (0..1).
  const latestConfidence = useMemo(() => {
    if (filtered.length === 0) return 0.5;
    const latest = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    const c = latest?.confidence ?? 0.5;
    return c > 1 ? c / 100 : c;
  }, [filtered]);

  const loadProductHistory = useCallback(async () => {
    if (!selectedPetIdForPersistence) {
      setProductUiState((current) => ({ ...current, history: null }));
      return;
    }

    setProductUiState((current) => ({ ...current, historyLoading: true }));
    try {
      const history = await loadProductIntelligenceHistory(selectedPetIdForPersistence);
      setProductUiState((current) => ({ ...current, history }));
    } catch (error) {
      console.error("Product intelligence history load failed:", error);
      setProductUiState((current) => ({ ...current, history: null }));
    } finally {
      setProductUiState((current) => ({ ...current, historyLoading: false }));
    }
  }, [selectedPetIdForPersistence]);

  useEffect(() => {
    void loadProductHistory();
  }, [loadProductHistory]);

  const saveReadinessSnapshot = useCallback(async () => {
    if (!selectedPetIdForPersistence || !productSnapshot.persistenceAllowed) {
      return;
    }

    setProductUiState((current) => ({
      ...current,
      readinessSaving: true,
      readinessStatus: null,
    }));
    try {
      await saveProductIntelligenceSnapshot({
        petId: selectedPetIdForPersistence,
        readiness: {
          generatedAt: new Date().toISOString(),
          sourceCheckIds: filtered.map((entry) => entry.id),
        },
      });
      setProductUiState((current) => ({ ...current, readinessStatus: "Snapshot saved" }));
      await loadProductHistory();
    } catch (error) {
      console.error("Product intelligence snapshot save failed:", error);
      setProductUiState((current) => ({ ...current, readinessStatus: "Snapshot save failed" }));
    } finally {
      setProductUiState((current) => ({ ...current, readinessSaving: false }));
    }
  }, [filtered, loadProductHistory, productSnapshot.persistenceAllowed, selectedPetIdForPersistence]);

  const saveRecoveryCheckpoint = useCallback(async () => {
    if (
      !selectedPetIdForPersistence ||
      !recoveryCheckpoint?.persistenceAllowed ||
      !recoveryCheckpoint.reportSourceId
    ) {
      return;
    }

    setProductUiState((current) => ({
      ...current,
      recoverySaving: true,
      recoveryStatus: null,
    }));
    try {
      await saveProductIntelligenceSnapshot({
        petId: selectedPetIdForPersistence,
        recovery: {
          reportSourceId: recoveryCheckpoint.reportSourceId,
          generatedAt: new Date().toISOString(),
          sourceCheckIds: filtered.map((entry) => entry.id),
        },
      });
      setProductUiState((current) => ({ ...current, recoveryStatus: "Checkpoint saved" }));
      await loadProductHistory();
    } catch (error) {
      console.error("Product intelligence recovery checkpoint save failed:", error);
      setProductUiState((current) => ({
        ...current,
        recoveryStatus: "Checkpoint save failed",
      }));
    } finally {
      setProductUiState((current) => ({ ...current, recoverySaving: false }));
    }
  }, [
    filtered,
    loadProductHistory,
    recoveryCheckpoint?.reportSourceId,
    recoveryCheckpoint?.persistenceAllowed,
    selectedPetIdForPersistence,
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[#00a878]">
            <BarChart3 className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {ownerReadout.petName === "your dog"
                ? "Health overview"
                : `${ownerReadout.petName}'s health`}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#2c2a26]">How is your dog doing?</h1>
          <p className="mt-1 text-sm text-[#6b665d]">
            A plain-language read on your recent symptom checks
            {!isSupabaseConfigured ? " (demo data)" : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="w-full sm:w-40">
            <Select
              label="Dog"
              options={petOptions}
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              label="Time"
              options={RANGE_OPTIONS}
              value={range}
              onChange={(e) => setRange(e.target.value)}
            />
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
      ) : ownerReadout.checkCount === 0 || !ownerReadout.verdict ? (
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
          <Link
            href="/symptom-checker"
            className={`${buttonClassName()} mt-5 inline-flex`}
          >
            <Stethoscope className="mr-2 h-4 w-4" aria-hidden />
            Start a quick check
          </Link>
        </section>
      ) : (
        <>
          <OwnerStatusHero
            verdict={ownerReadout.verdict}
            petName={ownerReadout.petName}
            asOf={ownerReadout.asOf}
            confidence={latestConfidence}
          />

          <RecoveryTrendStrip readout={ownerReadout.trend} petName={ownerReadout.petName} />

          <RecentSigns signs={ownerReadout.signs} asOf={ownerReadout.asOf} />

          <details className="group rounded-2xl border border-[#e8e2d8] bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-medium text-[#7c4dc4]">
              <span>See the full details</span>
              <ChevronDown
                className="h-4 w-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="space-y-5 border-t border-[#e8e2d8] px-4 py-5 sm:px-5">
              <ProductIntelligencePanel
                snapshot={productSnapshot}
                historyCount={productUiState.history?.readiness.length}
                onSaveSnapshot={
                  selectedPetIdForPersistence ? saveReadinessSnapshot : undefined
                }
                saveSnapshotDisabled={productUiState.historyLoading}
                saveSnapshotInProgress={productUiState.readinessSaving}
                saveSnapshotStatus={productUiState.readinessStatus}
                recoveryCheckpoint={recoveryCheckpoint}
                recoveryHistoryCount={productUiState.history?.recovery.length}
                onSaveRecoveryCheckpoint={
                  selectedPetIdForPersistence ? saveRecoveryCheckpoint : undefined
                }
                saveRecoveryDisabled={productUiState.historyLoading}
                saveRecoveryInProgress={productUiState.recoverySaving}
                saveRecoveryStatus={productUiState.recoveryStatus}
              />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <Card className="p-5">
                  <HealthScoreCard entries={filtered} />
                </Card>
                <Card className="p-5">
                  <h2 className="mb-2 text-sm font-semibold text-gray-900">Urgency mix</h2>
                  <p className="mb-2 text-xs text-gray-500">
                    How often each urgency level appeared
                  </p>
                  <UrgencyDistribution entries={filtered} />
                </Card>
                <Card className="p-5">
                  <h2 className="mb-1 text-sm font-semibold text-gray-900">Top symptoms</h2>
                  <p className="mb-4 text-xs text-gray-500">
                    Five most common primary concerns
                  </p>
                  <SymptomFrequencyChart entries={filtered} />
                </Card>
                <Card className="p-5">
                  <h2 className="mb-1 text-sm font-semibold text-gray-900">
                    Severity over time
                  </h2>
                  <p className="mb-4 text-xs text-gray-500">
                    Per-check severity (chronological)
                  </p>
                  <SeverityTrendChart entries={filtered} />
                </Card>
              </div>
            </div>
          </details>

          <p className="px-2 pb-4 pt-1 text-center text-xs leading-relaxed text-[#8a857a]">
            PawVital helps you understand your dog&apos;s signs — it&apos;s not a
            diagnosis and doesn&apos;t replace a vet. If you&apos;re worried or things
            get worse, contact your vet. In an emergency, call an emergency vet right away.
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

  return <AnalyticsPageContent />;
}
