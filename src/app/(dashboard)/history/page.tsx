"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Stethoscope,
  Clock,
  ChevronDown,
  ChevronUp,
  Share2,
  Loader2,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  FullReport,
  severityConfig,
  type SymptomReport,
} from "@/components/symptom-report";

const PAGE_SIZE = 10;

type DbSymptomCheckRow = {
  id: string;
  symptoms: string;
  ai_response: string | Record<string, unknown> | null;
  severity: SymptomReport["severity"];
  recommendation: SymptomReport["recommendation"];
  created_at: string;
};

function recommendationShort(
  r: SymptomReport["recommendation"]
): string {
  switch (r) {
    case "emergency_vet":
      return "Seek emergency veterinary care";
    case "vet_24h":
      return "See vet within 24 hours";
    case "vet_48h":
      return "Monitor or see vet within 48 hours";
    default:
      return "Monitor at home with guidance below";
  }
}

function parseReportPayload(
  raw: string | Record<string, unknown> | null | undefined
): SymptomReport | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (
    typeof o.title !== "string" ||
    typeof o.severity !== "string" ||
    typeof o.recommendation !== "string" ||
    typeof o.explanation !== "string"
  ) {
    return null;
  }
  const actions = Array.isArray(o.actions)
    ? (o.actions as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const warningSigns = Array.isArray(o.warning_signs)
    ? (o.warning_signs as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return {
    ...(o as unknown as SymptomReport),
    actions,
    warning_signs: warningSigns,
  };
}

const DEMO_ROWS: DbSymptomCheckRow[] = [
  {
    id: "demo-1",
    symptoms: "Vomiting, lethargy, not eating",
    severity: "high",
    recommendation: "vet_24h",
    created_at: new Date(2026, 3, 3).toISOString(),
    ai_response: {
      severity: "high",
      recommendation: "vet_24h",
      title: "Vomiting and Lethargy",
      explanation:
        "These signs can indicate dehydration or a gastrointestinal issue that needs prompt veterinary assessment.",
      differential_diagnoses: [
        {
          condition: "Gastroenteritis",
          likelihood: "high" as const,
          description: "Inflammation of stomach and intestines; common with acute vomiting.",
        },
        {
          condition: "Dietary indiscretion",
          likelihood: "moderate" as const,
          description: "Milder course if appetite returns and vomiting stops.",
        },
      ],
      actions: [
        "Offer small amounts of water frequently.",
        "Withhold food for 8–12 hours unless your vet advises otherwise.",
      ],
      warning_signs: [
        "Repeated vomiting with inability to keep water down",
        "Bloody vomit or black stool",
        "Extreme lethargy or collapse",
      ],
      vet_handoff_summary:
        "Patient presented with vomiting and lethargy. Owner reports decreased appetite for 24h. Request exam, hydration status, and baseline bloodwork if indicated.",
    },
  },
  {
    id: "demo-2",
    symptoms: "Excessive scratching, red ears",
    severity: "medium",
    recommendation: "vet_48h",
    created_at: new Date(2026, 2, 28).toISOString(),
    ai_response: {
      severity: "medium",
      recommendation: "vet_48h",
      title: "Excessive Scratching",
      explanation:
        "Scratching may reflect allergies, parasites, or infection. Monitoring and vet visit if worsening.",
      differential_diagnoses: [
        {
          condition: "Seasonal allergies",
          likelihood: "high" as const,
          description: "Environmental allergens often cause pruritus and ear inflammation.",
        },
      ],
      actions: [
        "Check for fleas; use vet-approved parasite control.",
        "Avoid over-bathing which can dry the skin.",
      ],
      warning_signs: [
        "Open wounds or bleeding from scratching",
        "Ear discharge or head tilt",
      ],
      vet_handoff_summary:
        "Pruritus with erythematous ears. Discuss cytology, allergy workup, and appropriate anti-itch therapy.",
    },
  },
  {
    id: "demo-3",
    symptoms: "Slight limp after play",
    severity: "low",
    recommendation: "monitor",
    created_at: new Date(2026, 2, 15).toISOString(),
    ai_response: {
      severity: "low",
      recommendation: "monitor",
      title: "Mild Limp After Activity",
      explanation:
        "A brief mild limp after vigorous play often resolves with rest. Watch for persistence.",
      differential_diagnoses: [
        {
          condition: "Soft tissue strain",
          likelihood: "high" as const,
          description: "Common after exercise; improves over 24–48h with rest.",
        },
      ],
      actions: [
        "Strict rest from running and jumping for 24–48 hours.",
        "Cold compress 10 minutes 2–3 times daily if tolerated.",
      ],
      warning_signs: [
        "Non-weight-bearing limb",
        "Swelling or visible deformity",
      ],
    },
  },
];

function topDiagnosisLine(report: SymptomReport): string | null {
  const dx = report.differential_diagnoses?.[0];
  if (!dx) return null;
  if (typeof report.confidence === "number") {
    return `${dx.condition} (${(report.confidence * 100).toFixed(0)}%)`;
  }
  return dx.condition;
}

export default function HistoryPage() {
  const { activePet } = useAppStore();
  const [rows, setRows] = useState<DbSymptomCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const petId = activePet?.id;

  const loadPage = useCallback(
    async (start: number, append: boolean) => {
      if (!isSupabaseConfigured || !petId || petId === "demo") {
        const all = DEMO_ROWS;
        const slice = all.slice(start, start + PAGE_SIZE);
        setRows((prev) => (append ? [...prev, ...slice] : slice));
        setHasMore(start + slice.length < all.length);
        setOffset(start + slice.length);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("symptom_checks")
          .select("id, symptoms, ai_response, severity, recommendation, created_at")
          .eq("pet_id", petId)
          .order("created_at", { ascending: false })
          .range(start, start + PAGE_SIZE - 1);

        if (error) throw error;

        const list = (data ?? []) as DbSymptomCheckRow[];
        setRows((prev) => (append ? [...prev, ...list] : list));
        setHasMore(list.length === PAGE_SIZE);
        setOffset(start + list.length);
      } catch (e) {
        console.error("History load failed:", e);
        const all = DEMO_ROWS;
        const slice = all.slice(start, start + PAGE_SIZE);
        setRows((prev) => (append ? [...prev, ...slice] : slice));
        setHasMore(start + slice.length < all.length);
        setOffset(start + slice.length);
      } finally {
        setLoading(false);
      }
    },
    [petId]
  );

  useEffect(() => {
    setOffset(0);
    setRows([]);
    void loadPage(0, false);
  }, [loadPage]);

  const handleLoadMore = () => {
    void loadPage(offset, true);
  };

  const parsedById = useMemo(() => {
    const m = new Map<string, SymptomReport | null>();
    for (const row of rows) {
      m.set(row.id, parseReportPayload(row.ai_response));
    }
    return m;
  }, [rows]);

  const copyVetHandoff = async (report: SymptomReport | null) => {
    const text =
      report?.vet_handoff_summary?.trim() ||
      `${report?.title ?? "Symptom check"}\n\n${report?.explanation ?? ""}`.trim();
    if (!text) {
      setShareMessage("Nothing to copy yet.");
      window.setTimeout(() => setShareMessage(null), 2500);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareMessage("Copied for your vet.");
      window.setTimeout(() => setShareMessage(null), 2500);
    } catch {
      setShareMessage("Could not copy — select text manually.");
      window.setTimeout(() => setShareMessage(null), 2500);
    }
  };

  const showOnboarding = !activePet;

  if (showOnboarding) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Card className="p-8 text-center">
          <Stethoscope className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Add a pet to see history
          </h1>
          <p className="text-gray-600 text-sm">
            Symptom checks are saved per pet when you use the checker with Supabase
            enabled.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="w-7 h-7 text-blue-600" />
          Symptom Check History
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          View your pet&apos;s past health assessments
        </p>
      </div>

      {shareMessage && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          {shareMessage}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-gray-600 text-sm">
          No symptom checks yet. Run a check from the Symptom Checker to see it here.
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const report = parsedById.get(row.id) ?? null;
            const sev = severityConfig[row.severity];
            const SevIcon = sev.icon;
            const expanded = expandedId === row.id;
            const date = new Date(row.created_at);
            const dateLabel = date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            });

            return (
              <Card key={row.id} className="overflow-hidden border border-gray-200">
                <div className="p-4 border-b border-gray-100 bg-gray-50/80">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {dateLabel}
                  </p>
                  <div className="mt-2 flex items-start gap-2 flex-wrap">
                    <SevIcon className="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-gray-900">
                        {report?.title ?? row.symptoms.slice(0, 80)}
                        {row.symptoms.length > 80 && !report?.title ? "…" : ""}
                      </h2>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {sev.label} — {row.symptoms}
                      </p>
                      <p className="text-sm text-gray-700 mt-2">
                        <span className="font-medium">Recommendation:</span>{" "}
                        {recommendationShort(row.recommendation)}
                      </p>
                      {report && topDiagnosisLine(report) && (
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">Top diagnosis:</span>{" "}
                          {topDiagnosisLine(report)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExpandedId(expanded ? null : row.id)
                      }
                      className="gap-1"
                    >
                      {expanded ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          Hide Report
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          View Full Report
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copyVetHandoff(report)}
                      className="gap-1"
                    >
                      <Share2 className="w-4 h-4" />
                      Share with Vet
                    </Button>
                  </div>
                </div>
                {expanded && report && (
                  <div className="p-4 bg-white">
                    <FullReport
                      report={{
                        ...report,
                        report_storage_id:
                          report.report_storage_id ?? row.id,
                      }}
                    />
                  </div>
                )}
                {expanded && !report && (
                  <div className="p-4 text-sm text-amber-800 bg-amber-50">
                    This saved check could not be parsed as a full report. Raw symptoms
                    and recommendation are shown above.
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore}>
            Load More
          </Button>
        </div>
      )}

      {loading && rows.length > 0 && (
        <p className="text-center text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </p>
      )}
    </div>
  );
}
