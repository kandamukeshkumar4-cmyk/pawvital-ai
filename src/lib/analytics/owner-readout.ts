import type { SymptomCheckEntry } from "@/components/timeline/types";
import type {
  ProductBaselineShiftDirection,
  ProductIntelligenceSnapshot,
} from "@/lib/product-intelligence";

/**
 * Owner-facing analytics readout.
 *
 * This module is a *presentation* layer only. It re-phrases the deterministic
 * triage state (`SymptomCheckEntry.urgency` and the product-intelligence
 * `baselineShift`) into plain language a worried, non-medical owner can act on.
 * It never makes a medical decision: the verdict state comes straight from the
 * latest check's `urgency`, and the trend comes straight from the deterministic
 * `baselineShift.direction`. Copy here must never diagnose, never give an
 * all-clear, and must always keep a "contact a vet" path open.
 */

/** Plain-language verdict states, one-to-one with deterministic `urgency`. */
export type OwnerVerdictState = "watch" | "schedule" | "urgent" | "emergency";

/** Plain-language recovery trend. */
export type OwnerTrend = "improving" | "steady" | "worsening" | "insufficient";

/**
 * How much usable data the owner has. The single-check case is the common case
 * and must render a real answer, not an empty dashboard.
 */
export type OwnerDataState = "empty" | "single" | "building" | "ready";

export interface OwnerVerdict {
  state: OwnerVerdictState;
  /** Short headline, e.g. "Watch Bella at home". */
  headline: string;
  /** One reassuring, bounded sub-line. Never an all-clear. */
  subline: string;
  /** Label for the primary next-action button. */
  ctaLabel: string;
  /** True only for the genuinely-urgent state — drives the emphasised vet banner. */
  emergency: boolean;
}

export interface OwnerTrendReadout {
  trend: OwnerTrend;
  /** Plain-language heading, e.g. "Bella seems to be improving". */
  headline: string;
  /** Supporting sentence. */
  detail: string;
  /** Wellness points over time (chronological), higher = better. For the sparkline. */
  series: number[];
  /** Whether a sparkline should render (needs >= 3 points). */
  showChart: boolean;
}

export interface OwnerSign {
  label: string;
  tone: "neutral" | "caution" | "alert";
}

export interface OwnerReadout {
  dataState: OwnerDataState;
  petName: string;
  checkCount: number;
  /** Null only when there are zero checks. */
  verdict: OwnerVerdict | null;
  trend: OwnerTrendReadout;
  signs: OwnerSign[];
  /** Plain "as of" line for the latest check, e.g. "Based on today's check". */
  asOf: string | null;
}

/** Wellness points by severity (higher = healthier). Mirrors product-intelligence. */
const WELLNESS_BY_SEVERITY: Record<SymptomCheckEntry["severity"], number> = {
  mild: 92,
  moderate: 78,
  serious: 58,
  critical: 34,
};

const SEVERITY_LABEL: Record<SymptomCheckEntry["severity"], string> = {
  mild: "Mild",
  moderate: "Moderate",
  serious: "Serious",
  critical: "Critical",
};

const SEVERITY_TONE: Record<SymptomCheckEntry["severity"], OwnerSign["tone"]> = {
  mild: "neutral",
  moderate: "caution",
  serious: "alert",
  critical: "alert",
};

const URGENCY_LABEL: Record<SymptomCheckEntry["urgency"], string> = {
  monitor: "Watch at home",
  schedule: "Plan a vet visit",
  urgent: "Call your vet soon",
  emergency: "Emergency care",
};

function titleCaseName(name: string | undefined | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "your dog";
  return trimmed;
}

function sortChronological(entries: SymptomCheckEntry[]): SymptomCheckEntry[] {
  return [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/** "today" / "yesterday" / "Mon 3" style recency for the latest check. */
function describeRecency(latest: SymptomCheckEntry, now: Date): string {
  const then = new Date(latest.created_at);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(
    (startOfDay(now).getTime() - startOfDay(then).getTime()) / dayMs,
  );
  if (diffDays <= 0) return "Based on today's check";
  if (diffDays === 1) return "Based on yesterday's check";
  if (diffDays < 7) return `Based on your check ${diffDays} days ago`;
  return "Based on your latest check";
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Build the 4-state verdict from the latest check's deterministic `urgency`.
 * One-to-one mapping; no medical inference is added here.
 */
function buildVerdict(
  latest: SymptomCheckEntry,
  petName: string,
): OwnerVerdict {
  switch (latest.urgency) {
    case "emergency":
      return {
        state: "emergency",
        headline: `${petName} may need urgent care`,
        subline:
          "Some signs shouldn't wait. Contact an emergency vet now — it's always okay to call.",
        ctaLabel: "Get vet help now",
        emergency: true,
      };
    case "urgent":
      return {
        state: "urgent",
        headline: `Call your vet about ${petName} soon`,
        subline:
          "These signs are worth a vet's input today. When in doubt, it's always okay to call.",
        ctaLabel: "Start a symptom check",
        emergency: false,
      };
    case "schedule":
      return {
        state: "schedule",
        headline: `Plan a vet visit for ${petName}`,
        subline:
          "This doesn't look like an emergency, but it's worth booking a routine vet visit.",
        ctaLabel: "Start a symptom check",
        emergency: false,
      };
    case "monitor":
    default:
      return {
        state: "watch",
        headline: `Watch ${petName} at home`,
        subline:
          "This doesn't look like an emergency right now. Keep an eye out, and call your vet if anything changes.",
        ctaLabel: "Check in again",
        emergency: false,
      };
  }
}

function trendFromDirection(
  direction: ProductBaselineShiftDirection,
): OwnerTrend {
  switch (direction) {
    case "improving":
      return "improving";
    case "declining":
    case "urgent_override":
      return "worsening";
    case "steady":
      return "steady";
    case "unknown":
    default:
      return "insufficient";
  }
}

function buildTrend(
  entries: SymptomCheckEntry[],
  dataState: OwnerDataState,
  snapshot: ProductIntelligenceSnapshot,
  petName: string,
): OwnerTrendReadout {
  const series = sortChronological(entries).map(
    (e) => WELLNESS_BY_SEVERITY[e.severity],
  );

  // Need at least 3 comparable checks before we state a real trend direction.
  if (dataState !== "ready") {
    const detail =
      dataState === "empty"
        ? `We'll show ${petName}'s trend here once you've done a couple of checks.`
        : dataState === "single"
          ? `Trend appears after a few check-ins — you've done 1 so far.`
          : `Not enough yet to call a trend — keep checking in.`;
    // Only draw the line once we can state a real direction (3+ checks). A
    // 2-point line reads as a trend the copy isn't ready to claim.
    return {
      trend: "insufficient",
      headline: `${petName}'s trend`,
      detail,
      series,
      showChart: false,
    };
  }

  const trend = trendFromDirection(snapshot.baselineShift.direction);
  switch (trend) {
    case "improving":
      return {
        trend,
        headline: `${petName} seems to be improving`,
        detail:
          "Recent check-ins are trending back toward normal. Keep going, and finish any vet-prescribed meds.",
        series,
        showChart: true,
      };
    case "worsening":
      return {
        trend,
        headline: `${petName}'s signs are trending worse`,
        detail:
          "Recent check-ins are heading the wrong way. Watch closely and check with your vet.",
        series,
        showChart: true,
      };
    case "steady":
      return {
        trend,
        headline: `${petName} is holding steady`,
        detail: "Recent check-ins look about the same. Keep watching for any change.",
        series,
        showChart: true,
      };
    case "insufficient":
    default:
      return {
        trend: "insufficient",
        headline: `${petName}'s trend`,
        detail: "Keep checking in to build a clearer picture over time.",
        series,
        showChart: true,
      };
  }
}

/** Plain-language chips from the latest check. Replaces the top-symptoms bar chart. */
function buildSigns(latest: SymptomCheckEntry): OwnerSign[] {
  const signs: OwnerSign[] = [];
  const symptom = (latest.primary_symptom ?? "").trim();
  if (symptom) {
    signs.push({ label: symptom, tone: SEVERITY_TONE[latest.severity] });
  }
  signs.push({ label: SEVERITY_LABEL[latest.severity], tone: SEVERITY_TONE[latest.severity] });
  signs.push({
    label: URGENCY_LABEL[latest.urgency],
    tone:
      latest.urgency === "emergency"
        ? "alert"
        : latest.urgency === "urgent"
          ? "caution"
          : "neutral",
  });
  return signs;
}

function resolveDataState(count: number): OwnerDataState {
  if (count <= 0) return "empty";
  if (count === 1) return "single";
  if (count === 2) return "building";
  return "ready";
}

/**
 * Map filtered symptom checks + the deterministic product-intelligence snapshot
 * into an owner-facing readout. Pure and side-effect free.
 */
export function buildOwnerReadout({
  entries,
  snapshot,
  now = new Date(),
  fallbackPetName = "your dog",
}: {
  entries: SymptomCheckEntry[];
  snapshot: ProductIntelligenceSnapshot;
  now?: Date;
  fallbackPetName?: string;
}): OwnerReadout {
  const dataState = resolveDataState(entries.length);
  const chronological = sortChronological(entries);
  const latest = chronological[chronological.length - 1] ?? null;
  const petName = titleCaseName(latest?.pet_name ?? fallbackPetName);

  const trend = buildTrend(entries, dataState, snapshot, petName);

  if (!latest) {
    return {
      dataState,
      petName,
      checkCount: 0,
      verdict: null,
      trend,
      signs: [],
      asOf: null,
    };
  }

  return {
    dataState,
    petName,
    checkCount: entries.length,
    verdict: buildVerdict(latest, petName),
    trend,
    signs: buildSigns(latest),
    asOf: describeRecency(latest, now),
  };
}
