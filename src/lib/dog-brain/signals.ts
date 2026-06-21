import type { HealthLog } from "@/lib/health-log/types";
import type {
  BriefState,
  DetectedSignal,
  SignalSeverity,
} from "@/lib/dog-brain/types";

const RECENT_WINDOW = 3;
const WEIGHT_WATCH_DROP = 0.02;
const WEIGHT_ALERT_DROP = 0.05;

function newestFirst(logs: HealthLog[]): HealthLog[] {
  return [...logs].sort(
    (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime(),
  );
}

function pushSignal(
  signals: DetectedSignal[],
  signal: DetectedSignal | null,
): void {
  if (signal) signals.push(signal);
}

function severityState(severity: SignalSeverity): BriefState {
  if (severity === "alert") return "needs_attention";
  if (severity === "watch") return "watch";
  return "stable";
}

function combineState(signals: DetectedSignal[]): BriefState {
  if (signals.some((signal) => signal.severity === "alert")) {
    return "needs_attention";
  }
  if (signals.some((signal) => signal.severity === "watch")) {
    return "watch";
  }
  return "stable";
}

function appetiteSignal(logs: HealthLog[]): DetectedSignal | null {
  const recent = logs.slice(0, RECENT_WINDOW);
  const offDays = recent.filter((log) => log.appetite === "reduced" || log.appetite === "none");
  if (offDays.length === 0) return null;

  const latest = recent[0];
  const severity: SignalSeverity =
    latest?.appetite === "none" || offDays.length >= 2 ? "watch" : "info";
  return {
    signal_type: "appetite_drop",
    severity,
    owner_message:
      offDays.length >= 2
        ? `Appetite was down on ${offDays.length} of the last ${recent.length} logged days.`
        : "The latest log shows appetite was lower than normal.",
    dedupe_key: `appetite_drop:${latest?.log_date ?? "unknown"}`,
    next_action: "Log meals closely today and start a symptom check if appetite stays low.",
  };
}

function stoolSignal(logs: HealthLog[]): DetectedSignal | null {
  const recent = logs.slice(0, RECENT_WINDOW);
  const latest = recent[0];
  if (!latest) return null;

  if (latest.stool === "blood") {
    return {
      signal_type: "stool_change",
      severity: "alert",
      owner_message: "The latest log includes blood in stool.",
      dedupe_key: `stool_blood:${latest.log_date}`,
      next_action: "Start a symptom check now and contact your vet for guidance.",
    };
  }

  const offDays = recent.filter((log) => log.stool !== "normal");
  if (latest.stool === "diarrhea" || offDays.length >= 2) {
    return {
      signal_type: "stool_change",
      severity: latest.stool === "diarrhea" ? "watch" : "info",
      owner_message:
        offDays.length >= 2
          ? `Stool was different from normal on ${offDays.length} of the last ${recent.length} logged days.`
          : "The latest log shows a stool change.",
      dedupe_key: `stool_change:${latest.log_date}`,
      next_action: "Keep logging stool changes and start a symptom check if this continues or worsens.",
    };
  }

  return null;
}

function vomitingSignal(logs: HealthLog[]): DetectedSignal | null {
  const recent = logs.slice(0, RECENT_WINDOW);
  const latest = recent[0];
  if (!latest) return null;

  const total = recent.reduce((sum, log) => sum + Math.max(0, log.vomiting_count ?? 0), 0);
  if (total === 0) return null;

  // A single isolated vomit isn't a pattern — don't alarm an owner over it.
  // Require repetition: ≥2 episodes, vomiting on ≥2 days, or one heavy day (≥3).
  const daysWithVomiting = recent.filter((log) => (log.vomiting_count ?? 0) > 0).length;
  const heavySingleDay = recent.some((log) => (log.vomiting_count ?? 0) >= 3);
  if (total < 2 && daysWithVomiting < 2 && !heavySingleDay) return null;

  const severity: SignalSeverity = latest.vomiting_count >= 3 || total >= 4 ? "alert" : "watch";
  return {
    signal_type: "vomiting_trend",
    severity,
    owner_message:
      total === 1
        ? "Vomiting was reported in the latest logged window."
        : `Vomiting was reported ${total} times across the latest ${recent.length} logged days.`,
    dedupe_key: `vomiting_trend:${latest.log_date}`,
    next_action:
      severity === "alert"
        ? "Start a symptom check now and consider urgent veterinary guidance."
        : "Watch for repeat vomiting and start a symptom check if it happens again.",
  };
}

function weightSignal(logs: HealthLog[]): DetectedSignal | null {
  const weighed = [...logs]
    .reverse()
    .filter((log) => typeof log.weight_kg === "number" && log.weight_kg > 0);
  // Need at least 3 weigh-ins to call a trend (two points is just noise).
  if (weighed.length < 3) return null;

  const first = weighed[0];
  const last = weighed[weighed.length - 1];
  const firstWeight = first.weight_kg as number;
  const lastWeight = last.weight_kg as number;
  const dropRatio = (firstWeight - lastWeight) / firstWeight;
  if (dropRatio < WEIGHT_WATCH_DROP) return null;

  // Only a SUSTAINED downtrend: the latest reading must be the lowest, so a
  // dip-then-recovery (e.g. 30 → 20 → 29) doesn't read as a downward trend.
  const minWeight = Math.min(...weighed.map((w) => w.weight_kg as number));
  if (lastWeight > minWeight) return null;

  const severity: SignalSeverity = dropRatio >= WEIGHT_ALERT_DROP ? "alert" : "watch";
  return {
    signal_type: "weight_downtrend",
    severity,
    owner_message: `Weight is down ${(dropRatio * 100).toFixed(1)}% from ${first.log_date} to ${last.log_date}.`,
    dedupe_key: `weight_downtrend:${first.log_date}:${last.log_date}`,
    next_action: "Recheck weight and share the trend with your vet if it continues.",
  };
}

function medicationSignal(logs: HealthLog[]): DetectedSignal | null {
  const latestWithMedication = logs.find(
    (log) => log.context_signals?.medication || log.meds_given,
  );
  const medication = latestWithMedication?.context_signals?.medication;
  if (!latestWithMedication || (!medication?.side_effect_notes && !medication?.missed_late)) {
    return null;
  }

  const severity: SignalSeverity = medication.missed_late ? "watch" : "info";
  const detail = medication.side_effect_notes
    ? medication.side_effect_notes.slice(0, 120)
    : "a missed or late medication dose";

  return {
    signal_type: "possible_med_side_effect",
    severity,
    owner_message: `Recent medication history notes ${detail}.`,
    dedupe_key: `medication_note:${latestWithMedication.log_date}`,
    next_action: "Keep medication notes factual and ask your vet before changing any dose.",
  };
}

function waterUrinationSignal(logs: HealthLog[]): DetectedSignal | null {
  const recent = logs.slice(0, RECENT_WINDOW);
  const latest = recent[0];
  if (!latest) return null;

  const waterOff = recent.filter((log) => log.water === "more" || log.water === "less");
  const urineOff = recent.filter(
    (log) =>
      log.urination === "more" ||
      log.urination === "less" ||
      log.urination === "straining",
  );
  const thirstNoted = recent.filter(
    (log) => log.context_signals?.urinary?.increased_thirst,
  ).length;
  const accidents = recent.some((log) => log.context_signals?.urinary?.accidents);
  const straining = recent.some((log) => log.urination === "straining");

  const offCount = Math.max(waterOff.length, urineOff.length);
  if (offCount === 0 && thirstNoted === 0 && !accidents) return null;

  // Increased thirst + increased urination together is the classic PU/PD pattern
  // worth a vet mention (kidney/diabetes/Cushing's-adjacent). Supportive only —
  // never feeds deterministic urgency.
  const puPd =
    (latest.water === "more" || thirstNoted > 0) &&
    recent.some((log) => log.urination === "more");

  const severity: SignalSeverity = straining ? "alert" : puPd || offCount >= 2 ? "watch" : "info";

  const parts: string[] = [];
  if (waterOff.length > 0) {
    parts.push(`water intake ${latest.water === "more" ? "up" : "down"}`);
  }
  if (straining) parts.push("straining to urinate");
  else if (urineOff.length > 0) parts.push("urination changed");
  else if (accidents) parts.push("urinary accidents");
  if (thirstNoted > 0 && waterOff.length === 0) parts.push("increased thirst noted");

  return {
    signal_type: "water_urination_change",
    severity,
    owner_message:
      parts.length > 0
        ? `Owner logged ${parts.join(" and ")} on ${Math.max(offCount, thirstNoted, 1)} of the last ${recent.length} logged day(s).`
        : "Water or urination was different from normal recently.",
    dedupe_key: `water_urination:${latest.log_date}`,
    next_action: straining
      ? "Straining to urinate can be urgent — start a symptom check and contact your vet."
      : "Note water bowls and bathroom trips; a thirst or urination change is worth a vet mention.",
  };
}

function mobilityPainSignal(logs: HealthLog[]): DetectedSignal | null {
  const recent = logs.slice(0, RECENT_WINDOW);
  const latest = recent[0];
  if (!latest) return null;

  const limpDays = recent.filter((log) => log.context_signals?.mobility?.limping);
  const reluctanceDays = recent.filter(
    (log) => log.context_signals?.mobility?.reluctance_to_move,
  );
  if (limpDays.length === 0 && reluctanceDays.length === 0) return null;

  const limb = recent
    .map((log) => log.context_signals?.mobility?.limb)
    .find((value): value is string => Boolean(value));

  // Limping on 2+ days, or limping together with reluctance to move, reads as a
  // sustained pattern worth a vet mention. Supportive only — never urgency.
  const severity: SignalSeverity =
    limpDays.length >= 2 || (limpDays.length > 0 && reluctanceDays.length > 0)
      ? "watch"
      : "info";

  const parts: string[] = [];
  if (limpDays.length > 0) parts.push(limb ? `limping (${limb})` : "limping");
  if (reluctanceDays.length > 0) parts.push("reluctant to move");

  return {
    signal_type: "mobility_pain_change",
    severity,
    owner_message: `Owner logged ${parts.join(" and ")} on ${Math.max(limpDays.length, reluctanceDays.length)} of the last ${recent.length} logged day(s).`,
    dedupe_key: `mobility_pain:${latest.log_date}`,
    next_action:
      "Rest from stairs and jumping, note which leg, and mention the limping or stiffness to your vet if it persists.",
  };
}

export function detectDogBrainSignals(logs: HealthLog[]): {
  state: BriefState;
  signals: DetectedSignal[];
} {
  const ordered = newestFirst(logs).slice(0, 14);
  const signals: DetectedSignal[] = [];

  pushSignal(signals, appetiteSignal(ordered));
  pushSignal(signals, stoolSignal(ordered));
  pushSignal(signals, vomitingSignal(ordered));
  pushSignal(signals, weightSignal(ordered));
  pushSignal(signals, waterUrinationSignal(ordered));
  pushSignal(signals, mobilityPainSignal(ordered));
  pushSignal(signals, medicationSignal(ordered));

  const state = combineState(signals);
  return {
    state: signals.length === 1 ? severityState(signals[0].severity) : state,
    signals,
  };
}
