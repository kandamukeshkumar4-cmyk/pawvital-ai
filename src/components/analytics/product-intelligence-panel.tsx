"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Minus,
  Save,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  ProductBaselineShiftDirection,
  ProductIntelligenceSnapshot,
  ProductIntelligenceState,
} from "@/lib/product-intelligence";

interface ProductIntelligencePanelProps {
  snapshot: ProductIntelligenceSnapshot;
  historyCount?: number;
  onSaveSnapshot?: () => void;
  saveSnapshotDisabled?: boolean;
  saveSnapshotInProgress?: boolean;
  saveSnapshotStatus?: string | null;
}

const STATE_LABEL: Record<ProductIntelligenceState, string> = {
  stable: "Stable",
  watch: "Watch",
  urgent: "Urgent",
  unknown: "Unknown",
};

const STATE_STYLES: Record<
  ProductIntelligenceState,
  { accent: string; bg: string; icon: typeof Activity }
> = {
  stable: { accent: "#059669", bg: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  watch: { accent: "#d97706", bg: "bg-amber-50 text-amber-700", icon: Activity },
  urgent: { accent: "#dc2626", bg: "bg-red-50 text-red-700", icon: AlertTriangle },
  unknown: { accent: "#6b7280", bg: "bg-gray-100 text-gray-700", icon: CircleHelp },
};

const BASELINE_SHIFT_LABEL: Record<ProductBaselineShiftDirection, string> = {
  improving: "Above baseline",
  declining: "Below baseline",
  steady: "Near baseline",
  unknown: "Baseline pending",
  urgent_override: "Urgent override",
};

const BASELINE_SHIFT_STYLES: Record<
  ProductBaselineShiftDirection,
  { bg: string; icon: typeof TrendingDown }
> = {
  improving: { bg: "bg-emerald-50 text-emerald-700", icon: TrendingUp },
  declining: { bg: "bg-amber-50 text-amber-700", icon: TrendingDown },
  steady: { bg: "bg-blue-50 text-blue-700", icon: Minus },
  unknown: { bg: "bg-gray-100 text-gray-700", icon: CircleHelp },
  urgent_override: { bg: "bg-red-50 text-red-700", icon: AlertTriangle },
};

function Chip({ children, tone = "default" }: { children: string; tone?: "default" | "missing" }) {
  return (
    <span
      className={
        tone === "missing"
          ? "inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600"
          : "inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
      }
    >
      {children}
    </span>
  );
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "n/a";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function formatBaselineScores(
  latestScore: number | null,
  baselineScore: number | null
): string {
  if (latestScore === null || baselineScore === null) {
    return "Need comparable baseline";
  }
  return `Latest ${latestScore} / baseline ${baselineScore}`;
}

export default function ProductIntelligencePanel({
  snapshot,
  historyCount,
  onSaveSnapshot,
  saveSnapshotDisabled = false,
  saveSnapshotInProgress = false,
  saveSnapshotStatus,
}: ProductIntelligencePanelProps) {
  const percent = Math.round(snapshot.evidenceCoverage * 100);
  const stateStyle = STATE_STYLES[snapshot.state];
  const StateIcon = stateStyle.icon;
  const savedText =
    typeof historyCount === "number"
      ? `${historyCount} saved snapshot${historyCount === 1 ? "" : "s"}`
      : null;
  const canRenderSave = Boolean(onSaveSnapshot) && snapshot.persistenceAllowed;
  const saveDisabled = saveSnapshotDisabled || saveSnapshotInProgress;
  const baselineStyle = BASELINE_SHIFT_STYLES[snapshot.baselineShift.direction];
  const BaselineIcon = baselineStyle.icon;

  return (
    <section className="space-y-5" aria-label="Product intelligence">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden />
            <h2 className="text-base font-semibold text-gray-900">Evidence ring</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{snapshot.ownerSummary}</p>
        </div>
        <div className={`inline-flex w-fit items-center gap-2 rounded-md px-3 py-2 ${stateStyle.bg}`}>
          <StateIcon className="h-4 w-4" aria-hidden />
          <span className="text-sm font-semibold">{STATE_LABEL[snapshot.state]}</span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[112px_1fr] md:items-center">
        <div
          className="relative grid h-24 w-24 place-items-center rounded-full"
          style={{
            background: `conic-gradient(${stateStyle.accent} ${percent}%, #e5e7eb ${percent}% 100%)`,
          }}
          aria-label={`Evidence coverage ${percent}%`}
        >
          <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white">
            <span className="text-xl font-bold tabular-nums text-gray-900">{percent}%</span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500">Evidence present</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {snapshot.evidenceChips.length > 0 ? (
                snapshot.evidenceChips.map((chip) => <Chip key={chip}>{chip}</Chip>)
              ) : (
                <span className="text-sm text-gray-500">No evidence captured yet</span>
              )}
            </div>
          </div>

          {snapshot.missingEvidenceChips.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gray-500">Missing evidence</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {snapshot.missingEvidenceChips.map((chip) => (
                  <Chip key={chip} tone="missing">
                    {chip}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BaselineIcon className="h-4 w-4 text-gray-500" aria-hidden />
            <p className="font-semibold text-gray-900">Baseline shift</p>
          </div>
          <p className="mt-1 text-gray-600">{snapshot.baselineShift.ownerSummary}</p>
          <p className="mt-1 text-xs font-medium text-gray-500">
            {formatBaselineScores(
              snapshot.baselineShift.latestScore,
              snapshot.baselineShift.baselineScore
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${baselineStyle.bg}`}>
            {BASELINE_SHIFT_LABEL[snapshot.baselineShift.direction]}
          </span>
          <span className="inline-flex min-w-12 justify-center rounded-md border border-gray-200 bg-white px-2.5 py-1 text-sm font-semibold tabular-nums text-gray-900">
            {formatDelta(snapshot.baselineShift.delta)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 border-t border-gray-100 pt-4 text-sm text-gray-600 md:grid-cols-2">
        <div>
          {snapshot.deterministicOverride ? (
            <p className="font-medium text-red-700">{snapshot.deterministicOverride}</p>
          ) : snapshot.nextEvidencePrompt ? (
            <p>{snapshot.nextEvidencePrompt}</p>
          ) : (
            <p>Evidence coverage is complete for this local snapshot.</p>
          )}
        </div>
        <div className="space-y-2 md:text-right">
          {savedText ? <p className="font-medium text-gray-700">{savedText}</p> : null}
          {snapshot.persistenceAllowed ? (
            <div className="flex flex-col gap-2 md:items-end">
              <p className="font-medium text-emerald-700">Evidence complete for this snapshot</p>
              {canRenderSave ? (
                <button
                  type="button"
                  onClick={onSaveSnapshot}
                  disabled={saveDisabled}
                  className="inline-flex h-9 w-fit items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  <Save className="h-4 w-4" aria-hidden />
                  {saveSnapshotInProgress ? "Saving" : "Save snapshot"}
                </button>
              ) : null}
              {saveSnapshotStatus ? (
                <p className="text-xs font-medium text-gray-600">{saveSnapshotStatus}</p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 md:justify-end">
              {snapshot.persistenceBlockedReasons.map((reason) => (
                <Chip key={reason} tone="missing">
                  {reason}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
        {snapshot.claimGuard}
      </p>
    </section>
  );
}
