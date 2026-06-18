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

/** A plain-language reason the current status looks the way it does. */
export interface OwnerDriver {
  label: string;
  tone: "neutral" | "caution" | "alert";
}

/** One adaptive "what to do next" nudge derived from the latest check. */
export interface OwnerNextStep {
  title: string;
  detail: string;
}

/** A vet-ready summary of the checks in view. */
export interface OwnerVetPacket {
  checkCount: number;
  urgentFlags: number;
  rangeLabel: string | null;
  ready: boolean;
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
  /** Why the status looks the way it does — top drivers from recent checks. */
  drivers: OwnerDriver[];
  /** One adaptive next-step nudge. Null when there are no checks. */
  nextStep: OwnerNextStep | null;
  /** Vet-ready summary of the checks in view. */
  vetPacket: OwnerVetPacket;
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

const URGENCY_REASON: Record<SymptomCheckEntry["urgency"], string> = {
  monitor: "These signs look mild and can usually be watched at home.",
  schedule: "Not an emergency, but worth a routine vet visit.",
  urgent: "These signs can need same-day care — worth calling your vet.",
  emergency: "Some signs shouldn't wait — contact an emergency vet.",
};

/**
 * "Why this changed" — the plain-language drivers behind the current status.
 * Built only from the owner's own checks (latest sign, why it matters, and
 * whether it has come up before). Never surfaces a diagnosis label.
 */
function buildDrivers(
  latest: SymptomCheckEntry,
  all: SymptomCheckEntry[],
): OwnerDriver[] {
  const drivers: OwnerDriver[] = [];
  const symptom = (latest.primary_symptom ?? "").trim();
  if (symptom) {
    drivers.push({
      label: `${symptom} — flagged as ${SEVERITY_LABEL[latest.severity].toLowerCase()}`,
      tone: SEVERITY_TONE[latest.severity],
    });
  }
  drivers.push({
    label: URGENCY_REASON[latest.urgency],
    tone:
      latest.urgency === "emergency" || latest.urgency === "urgent"
        ? "caution"
        : "neutral",
  });

  // Recurrence: has this same sign come up in earlier checks?
  if (symptom) {
    const key = symptom.toLowerCase();
    const priorCount = all.filter(
      (e) => e.id !== latest.id && (e.primary_symptom ?? "").trim().toLowerCase() === key,
    ).length;
    if (priorCount >= 1) {
      drivers.push({
        label: `You've noted this before — worth mentioning to your vet.`,
        tone: "caution",
      });
    }
  }

  return drivers.slice(0, 3);
}

const NEXT_STEP_RULES: Array<{ test: RegExp; title: string; detail: string }> = [
  {
    test: /vomit|diarrh|stool|poop|nausea/i,
    title: "Note any more vomiting or diarrhea",
    detail: "Over the next day, keep a quick count and look for blood or signs of dehydration.",
  },
  {
    test: /limp|lame|leg|paw|joint|mobility/i,
    title: "Check the limp tomorrow",
    detail: "See whether it's easing or getting worse, and whether it affects eating or resting.",
  },
  {
    test: /scratch|itch|skin|ear|rash|lick/i,
    title: "Watch the scratching and skin",
    detail: "Note any new redness, hot spots, or hair loss to share with your vet.",
  },
  {
    test: /eat|appetite|lethar|energy|tired|weak/i,
    title: "Watch appetite and energy",
    detail: "Check how the next couple of meals go and whether energy returns to normal.",
  },
  {
    test: /cough|breath|wheez|pant|respir/i,
    title: "Watch breathing closely",
    detail: "Note any coughing, fast breathing, or effort — and call your vet if it worsens.",
  },
  {
    test: /drink|water|thirst|urin|pee/i,
    title: "Watch water and bathroom habits",
    detail: "Note changes in how much your dog drinks and how often they pee.",
  },
];

/** "Track next" — one adaptive nudge keyed to the latest check's main sign. */
function buildNextStep(latest: SymptomCheckEntry, petName: string): OwnerNextStep {
  const symptom = (latest.primary_symptom ?? "").trim();
  const matched = NEXT_STEP_RULES.find((rule) => rule.test.test(symptom));
  if (matched) {
    return { title: matched.title, detail: matched.detail };
  }
  return {
    title: `Check in on ${petName} tomorrow`,
    detail: "A quick follow-up check helps spot whether things are getting better or worse.",
  };
}

function buildVetPacket(entries: SymptomCheckEntry[]): OwnerVetPacket {
  const urgentFlags = entries.filter(
    (e) => e.urgency === "urgent" || e.urgency === "emergency",
  ).length;
  const rangeLabel =
    entries.length === 0
      ? null
      : entries.length === 1
        ? "1 check"
        : `${entries.length} checks`;
  return {
    checkCount: entries.length,
    urgentFlags,
    rangeLabel,
    ready: entries.length > 0,
  };
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
  const vetPacket = buildVetPacket(entries);

  if (!latest) {
    return {
      dataState,
      petName,
      checkCount: 0,
      verdict: null,
      trend,
      signs: [],
      asOf: null,
      drivers: [],
      nextStep: null,
      vetPacket,
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
    drivers: buildDrivers(latest, chronological),
    nextStep: buildNextStep(latest, petName),
    vetPacket,
  };
}
