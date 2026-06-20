import { SELECT_FIELDS, type HealthLog } from "./types";

/**
 * Summarize recent daily health logs into a compact, owner-reported context
 * string for the symptom-checker AI. This is *supportive narrative context*
 * only — it must never be fed into deterministic urgency / red-flag logic, and
 * the summary explicitly labels itself as owner-reported and non-overriding.
 *
 * Pure and side-effect free.
 */

const DEFAULT_MAX_LOGS = 14;

function field<T extends string>(log: HealthLog, key: string): T {
  return (log as unknown as Record<string, T>)[key];
}

/**
 * @param maxLogs how many of the newest logs to summarize. Defaults to a
 *   14-day recent window; the Dog Brain passes its full 90-day window so the
 *   summary reflects long-window trends ("appetite off on 9 of 87 days"), not
 *   just the last two weeks.
 */
export function summarizeDailyLogsForContext(
  logs: HealthLog[],
  petName: string,
  maxLogs: number = DEFAULT_MAX_LOGS,
): string {
  if (logs.length === 0) return "";

  const newestFirst = [...logs]
    .sort((a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime())
    .slice(0, Math.max(1, maxLogs));
  const chronological = [...newestFirst].reverse();
  const days = newestFirst.length;
  const newest = newestFirst[0].log_date;
  const oldest = chronological[0].log_date;
  const dayWord = (n: number) => (n === 1 ? "day" : "days");

  const parts: string[] = [];

  for (const def of SELECT_FIELDS) {
    const offDays = newestFirst.filter((l) => field(l, def.key) !== "normal");
    if (offDays.length > 0) {
      const values = Array.from(new Set(offDays.map((l) => field<string>(l, def.key))));
      parts.push(
        `${def.label.toLowerCase()} off on ${offDays.length} of ${days} ${dayWord(days)} (${values.join(", ")})`,
      );
    }
  }

  const vomitDays = newestFirst.filter((l) => l.vomiting_count > 0);
  if (vomitDays.length > 0) {
    const total = vomitDays.reduce((sum, l) => sum + l.vomiting_count, 0);
    parts.push(
      `vomiting reported on ${vomitDays.length} ${dayWord(vomitDays.length)} (${total} episode${total === 1 ? "" : "s"} total)`,
    );
  }

  const weighed = chronological.filter((l) => l.weight_kg != null);
  if (weighed.length >= 2) {
    const first = weighed[0].weight_kg as number;
    const last = weighed[weighed.length - 1].weight_kg as number;
    const delta = last - first;
    if (Math.abs(delta) >= 0.1) {
      parts.push(
        `weight ${delta > 0 ? "up" : "down"} ${Math.abs(delta).toFixed(1)} kg over the period (now ${last.toFixed(1)} kg)`,
      );
    }
  } else if (weighed.length === 1) {
    parts.push(`weight ${(weighed[0].weight_kg as number).toFixed(1)} kg`);
  }

  const medDays = newestFirst.filter((l) => l.meds_given).length;
  if (medDays > 0) {
    parts.push(`medication/fluids given on ${medDays} ${dayWord(medDays)}`);
  }

  const window =
    days === 1 ? "the latest day" : `the last ${days} ${dayWord(days)} (${oldest} to ${newest})`;
  const disclaimer =
    "Owner-reported observations, not clinical measurements; supportive context only — do not override clinical assessment.";

  if (parts.length === 0) {
    return `Owner's daily check-ins for ${petName} over ${window}: all signs logged as normal. (${disclaimer})`;
  }
  return `Owner's daily check-ins for ${petName} over ${window}: ${parts.join("; ")}. (${disclaimer})`;
}

export interface FollowupContextRow {
  prompt: string;
  /** pending | better | worse | same | dismissed */
  status: string;
  due_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

const FOLLOWUP_DISCLAIMER =
  "Owner-reported follow-up outcomes, not clinical measurements; supportive context only — do not override clinical assessment.";

/**
 * Summarize the Dog Brain follow-up loop for the report/context model — this is
 * how an owner's better / worse / same answer feeds back into Brain reasoning.
 *
 * Pending follow-ups read as *active concerns*; resolved outcomes carry
 * outcome-aware next-action language so the same answer measurably changes what
 * the Brain says next: worse → unresolved, consider the vet; better →
 * de-escalate, keep monitoring; same → keep monitoring and re-check. Dismissed
 * follow-ups are dropped. Supportive narrative only — never feeds deterministic
 * urgency / red-flag logic. Pure and side-effect free.
 */
export function summarizeFollowupsForContext(
  followups: FollowupContextRow[],
  petName: string,
): string {
  if (followups.length === 0) return "";

  const lines: string[] = [];
  for (const f of followups) {
    if (f.status === "dismissed") continue;

    if (f.status === "pending") {
      const due = f.due_at ? ` (due ${f.due_at.slice(0, 10)})` : "";
      lines.push(`${f.prompt}${due} → awaiting owner response (active concern).`);
      continue;
    }

    const date = (f.updated_at ?? f.created_at ?? "").slice(0, 10);
    const nextAction =
      f.status === "worse"
        ? "owner reported it got WORSE — unresolved; consider contacting your vet"
        : f.status === "better"
          ? "owner reported it improved — de-escalating; keep monitoring"
          : f.status === "same"
            ? "owner reported no change — keep monitoring and re-check"
            : `owner reported ${f.status}`;
    lines.push(`${date ? `${date}: ` : ""}${f.prompt} → ${nextAction}.`);
  }

  if (lines.length === 0) return "";
  return `Dog Brain follow-up loop for ${petName} (${FOLLOWUP_DISCLAIMER}):\n${lines.join("\n")}`;
}
