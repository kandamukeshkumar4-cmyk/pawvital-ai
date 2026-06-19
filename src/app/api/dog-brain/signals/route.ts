import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { HealthLog } from "@/lib/health-log/types";
import type { DetectedSignal, SignalSeverity, SignalType } from "@/lib/dog-brain/types";

export const maxDuration = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SignalsResponse {
  state: "stable" | "watch" | "needs_attention";
  signals: DetectedSignal[];
}

function toOwnerMessage(type: SignalType, detail?: string): string {
  switch (type) {
    case "appetite_drop":
      return "Appetite was reduced on several recent days.";
    case "stool_change":
      return "Stool consistency changed in recent logs.";
    case "vomiting_trend":
      return "Vomiting noted on more than one day recently.";
    case "weight_downtrend":
      return detail || "Weight shows a downward trend across recent weigh-ins.";
    case "possible_med_side_effect":
      return "Medication side effect notes were logged.";
    default:
      return "Pattern noted in recent logs.";
  }
}

function computeSignals(logs: HealthLog[]): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  if (!logs || logs.length === 0) return signals;

  const recent = [...logs].sort((a, b) => (a.log_date < b.log_date ? 1 : -1)).slice(0, 7);

  // appetite
  const appetiteOff = recent.filter((l) => l.appetite === "reduced" || l.appetite === "none").length;
  if (appetiteOff >= 2) {
    signals.push({
      signal_type: "appetite_drop",
      severity: appetiteOff >= 3 ? "watch" : "info",
      owner_message: toOwnerMessage("appetite_drop"),
      dedupe_key: `appetite_drop:${recent[0]?.log_date}`,
      next_action: "Log today's check-in",
    });
  }

  // vomiting
  const vomitDays = recent.filter((l) => (l.vomiting_count ?? 0) > 0).length;
  if (vomitDays >= 2) {
    signals.push({
      signal_type: "vomiting_trend",
      severity: "watch",
      owner_message: toOwnerMessage("vomiting_trend"),
      dedupe_key: `vomiting:${recent[0]?.log_date}`,
      next_action: "Log today's check-in",
    });
  }

  // stool change
  const stoolOff = recent.filter((l) => l.stool !== "normal").length;
  if (stoolOff >= 2) {
    signals.push({
      signal_type: "stool_change",
      severity: "info",
      owner_message: toOwnerMessage("stool_change"),
      dedupe_key: `stool:${recent[0]?.log_date}`,
    });
  }

  // weight downtrend (need at least 3 weigh-ins, last is the lowest)
  const weighed = recent.filter((l) => typeof l.weight_kg === "number" && l.weight_kg > 0);
  if (weighed.length >= 3) {
    const sorted = [...weighed].sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
    const first = sorted[0].weight_kg!;
    const last = sorted[sorted.length - 1].weight_kg!;
    const min = Math.min(...sorted.map((w) => w.weight_kg!));
    const drop = ((first - last) / first) * 100;
    if (last === min && drop >= 3) {
      signals.push({
        signal_type: "weight_downtrend",
        severity: drop >= 7 ? "watch" : "info",
        owner_message: toOwnerMessage("weight_downtrend", `Weight is down ~${drop.toFixed(0)}% recently.`),
        dedupe_key: `weight:${sorted[sorted.length - 1].log_date}`,
        next_action: "Log today's check-in",
      });
    }
  }

  // meds side effect note
  const medNote = recent.some((l) => l.notes && /side effect|reaction/i.test(l.notes));
  if (medNote) {
    signals.push({
      signal_type: "possible_med_side_effect",
      severity: "info",
      owner_message: toOwnerMessage("possible_med_side_effect"),
      dedupe_key: `med:${recent[0]?.log_date}`,
    });
  }

  return signals;
}

function deriveState(signals: DetectedSignal[]): "stable" | "watch" | "needs_attention" {
  if (signals.some((s) => s.severity === "watch")) return "watch";
  if (signals.length > 0) return "stable"; // info level still shows as stable per brief
  return "stable";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const petIdParam = url.searchParams.get("pet_id");
  const petId = petIdParam && UUID_RE.test(petIdParam) ? petIdParam : null;

  if (!petId) {
    return NextResponse.json({ state: "stable", signals: [] });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // If no user in strict envs, still allow demo-like empty for the brief
    const { data: logsData, error } = await supabase
      .from("daily_health_logs")
      .select("*")
      .eq("pet_id", petId)
      .order("log_date", { ascending: false })
      .limit(14);

    if (error) {
      // Graceful: table not ready yet or RLS
      if (error.code === "42P01" || /relation .* does not exist/i.test(error.message || "")) {
        return NextResponse.json({ state: "stable", signals: [] });
      }
      console.error("[dog-brain/signals] query error", error);
      return NextResponse.json({ state: "stable", signals: [] });
    }

    const logs = (logsData ?? []) as HealthLog[];
    const signals = computeSignals(logs);
    const state = deriveState(signals);

    return NextResponse.json({ state, signals } satisfies SignalsResponse);
  } catch (err) {
    // Never 500 the brief
    return NextResponse.json({ state: "stable", signals: [] });
  }
}
