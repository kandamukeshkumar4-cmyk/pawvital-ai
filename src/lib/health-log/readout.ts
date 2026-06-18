import {
  SELECT_FIELDS,
  type FieldDef,
  type HealthLog,
  type LogTone,
} from "./types";

/**
 * Daily Health Log readout — pure presentation logic. Turns logged entries into
 * plain owner feedback: which signs are "off" today, and what changed since the
 * previous log. It never diagnoses; tone only reflects what was logged.
 */

export interface LoggedSign {
  field: string;
  label: string;
  valueLabel: string;
  tone: LogTone;
}

export interface LogChange {
  field: string;
  text: string;
  direction: "improved" | "worse" | "changed";
}

export interface HealthLogReadout {
  hasToday: boolean;
  logDate: string | null;
  allNormal: boolean;
  /** Watch/alert signs in the most recent log. */
  offSigns: LoggedSign[];
  /** Any alert-tone sign present → owner should consider a vet. */
  hasAlert: boolean;
  vomitingCount: number;
  /** Plain changes vs the previous log. */
  changes: LogChange[];
  headline: string;
  detail: string;
}

const TONE_RANK: Record<LogTone, number> = { good: 0, watch: 1, alert: 2 };

function optionFor<T extends string>(
  field: FieldDef<T>,
  value: string,
): { label: string; tone: LogTone } {
  const opt = field.options.find((o) => o.value === value);
  return opt ? { label: opt.label, tone: opt.tone } : { label: value, tone: "good" };
}

function vomitingTone(count: number): LogTone {
  if (count <= 0) return "good";
  if (count <= 2) return "watch";
  return "alert";
}

function sortByDate(logs: HealthLog[]): HealthLog[] {
  return [...logs].sort(
    (a, b) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime(),
  );
}

function collectOffSigns(log: HealthLog): LoggedSign[] {
  const signs: LoggedSign[] = [];
  for (const field of SELECT_FIELDS) {
    const value = (log as unknown as Record<string, string>)[field.key];
    const { label, tone } = optionFor(field, value);
    if (tone !== "good") {
      signs.push({ field: field.key, label: field.label, valueLabel: label, tone });
    }
  }
  if (log.vomiting_count > 0) {
    signs.push({
      field: "vomiting",
      label: "Vomiting",
      valueLabel:
        log.vomiting_count === 1 ? "1 time" : `${log.vomiting_count} times`,
      tone: vomitingTone(log.vomiting_count),
    });
  }
  // Order alerts first so the most important signs lead.
  return signs.sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]);
}

function computeChanges(latest: HealthLog, prior: HealthLog): LogChange[] {
  const changes: LogChange[] = [];
  for (const field of SELECT_FIELDS) {
    const latestVal = (latest as unknown as Record<string, string>)[field.key];
    const priorVal = (prior as unknown as Record<string, string>)[field.key];
    if (latestVal === priorVal) continue;
    const a = optionFor(field, latestVal);
    const b = optionFor(field, priorVal);
    const direction =
      TONE_RANK[a.tone] < TONE_RANK[b.tone]
        ? "improved"
        : TONE_RANK[a.tone] > TONE_RANK[b.tone]
          ? "worse"
          : "changed";
    const text =
      direction === "improved"
        ? `${field.label} back toward normal (${a.label.toLowerCase()})`
        : direction === "worse"
          ? `${field.label} looks worse (${a.label.toLowerCase()})`
          : `${field.label} changed to ${a.label.toLowerCase()}`;
    changes.push({ field: field.key, text, direction });
  }

  if (latest.vomiting_count !== prior.vomiting_count) {
    const direction =
      latest.vomiting_count < prior.vomiting_count ? "improved" : "worse";
    changes.push({
      field: "vomiting",
      direction,
      text:
        direction === "improved"
          ? `Less vomiting than last log (${latest.vomiting_count} vs ${prior.vomiting_count})`
          : `More vomiting than last log (${latest.vomiting_count} vs ${prior.vomiting_count})`,
    });
  }

  if (
    latest.weight_kg != null &&
    prior.weight_kg != null &&
    latest.weight_kg !== prior.weight_kg
  ) {
    const delta = latest.weight_kg - prior.weight_kg;
    changes.push({
      field: "weight",
      direction: "changed",
      text: `Weight ${delta > 0 ? "up" : "down"} ${Math.abs(delta).toFixed(1)} kg since last log`,
    });
  }

  // Lead with worsening, then improvements, then neutral changes.
  const order = { worse: 0, improved: 1, changed: 2 } as const;
  return changes.sort((a, b) => order[a.direction] - order[b.direction]);
}

export function buildHealthLogReadout(logs: HealthLog[]): HealthLogReadout {
  if (logs.length === 0) {
    return {
      hasToday: false,
      logDate: null,
      allNormal: false,
      offSigns: [],
      hasAlert: false,
      vomitingCount: 0,
      changes: [],
      headline: "No check-ins logged yet",
      detail: "Log how your dog is doing today to start spotting changes over time.",
    };
  }

  const sorted = sortByDate(logs);
  const latest = sorted[sorted.length - 1];
  const prior = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  const offSigns = collectOffSigns(latest);
  const hasAlert = offSigns.some((s) => s.tone === "alert");
  const allNormal = offSigns.length === 0;
  const changes = prior ? computeChanges(latest, prior) : [];

  let headline: string;
  let detail: string;
  if (allNormal) {
    headline = "Everything you logged looks normal";
    detail =
      "No off signs in the latest log. Keep checking in so you'll notice any change early.";
  } else if (hasAlert) {
    headline = `${offSigns.length} sign${offSigns.length === 1 ? "" : "s"} worth a vet's input`;
    detail =
      "Some of what you logged can need attention. When in doubt, it's always okay to call your vet.";
  } else {
    headline = `${offSigns.length} thing${offSigns.length === 1 ? "" : "s"} to keep an eye on`;
    detail = "Nothing looks urgent, but keep watching and call your vet if it doesn't settle.";
  }

  return {
    hasToday: true,
    logDate: latest.log_date,
    allNormal,
    offSigns,
    hasAlert,
    vomitingCount: latest.vomiting_count,
    changes,
    headline,
    detail,
  };
}
